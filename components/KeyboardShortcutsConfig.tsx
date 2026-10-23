"use client";

import { useState, type KeyboardEvent } from "react";
import { Keyboard, Plus, RotateCcw, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useShortcuts } from "@/hooks/useShortcuts";
import { DEFAULT_SHORTCUTS, SHORTCUTS, setShortcutBinding, shortcutFromEvent, shortcutLabel, type ShortcutId } from "@/lib/keyboard-shortcuts";
import { toast } from "./ui/toast";
import "./keyboard-shortcuts.css";

export function KeyboardShortcutsConfig() {
  const { t } = useI18n();
  const bindings = useShortcuts();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [heldAlt, setHeldAlt] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const save = (id: ShortcutId, keys: readonly string[] | null) => {
    if (!setShortcutBinding(id, keys)) toast.error(t("shortcuts.storageError"));
  };
  const capture = (event: KeyboardEvent<HTMLInputElement>, released = false) => {
    event.preventDefault();
    event.stopPropagation();
    if (!recording || event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const chord = shortcutFromEvent(event.nativeEvent);
    if (event.key === "Alt" && !released) { setHeldAlt(chord === "Alt"); return; }
    if (released && !(heldAlt && chord === "Alt")) return;
    setHeldAlt(false);
    if (!chord || (chord === "Alt" && recording !== "toggleDictation")) {
      if (!["Control", "Meta", "Shift"].includes(event.key)) setInvalid(true);
      return;
    }
    save(recording, [...bindings[recording], chord]);
    setRecording(null);
    setInvalid(false);
  };
  const search = query.trim().toLocaleLowerCase();
  const visible = SHORTCUTS.filter(({ id }) => [t(`shortcuts.${id}.label`), t(`shortcuts.${id}.description`), shortcutLabel(id, bindings)].join(" ").toLocaleLowerCase().includes(search));

  return (
    <section aria-labelledby="general-shortcuts-heading" className="shortcut-settings">
      <h3 id="general-shortcuts-heading" className="display-serif"><Keyboard size={20} aria-hidden="true" />{t("settingsConfig.general.shortcuts")}</h3>
      <p className="settings-content-subtitle">{t("shortcuts.description")}</p>
      <p className="shortcut-note">{t("shortcuts.standardKeys")}</p>
      <input className="shortcut-search ui-focus-ring" type="search" aria-label={t("shortcuts.search")} placeholder={t("shortcuts.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
      {visible.length === 0 && <p>{t("shortcuts.empty")}</p>}
      {visible.map(({ id, group }) => {
        const conflicts = SHORTCUTS.filter((other) => other.id !== id && bindings[id].some((key) => bindings[other.id].includes(key)));
        return (
          <section key={id} id={`setting-shortcut-${id}`} className="shortcut-row" aria-label={t(`shortcuts.${id}.label`)}>
            <div className="shortcut-info">
              <span className="shortcut-scope">{t(`shortcuts.group.${group}`)}</span>
              <h4>{t(`shortcuts.${id}.label`)}</h4>
              <p>{t(`shortcuts.${id}.description`)}</p>
              <p>{t("shortcuts.default", { keys: shortcutLabel(id, DEFAULT_SHORTCUTS) || t("shortcuts.unbound") })}</p>
            </div>
            <div className="shortcut-controls">
              <div className="shortcut-bindings">
                {bindings[id].length === 0 && <span className="shortcut-unbound">{t("shortcuts.unbound")}</span>}
                {bindings[id].map((key) => (
                  <button type="button" className="shortcut-key ui-focus-ring" key={key} aria-label={t("shortcuts.removeKey", { action: t(`shortcuts.${id}.label`), key })} onClick={() => save(id, bindings[id].filter((binding) => binding !== key))}>
                    <kbd>{key.replace("Meta+", "⌘+").replace("Backquote", "`")}</kbd><X size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {recording === id ? (
                <div data-shortcut-recorder className="shortcut-recording">
                  <input autoFocus readOnly className="shortcut-search ui-focus-ring" aria-label={t("shortcuts.recording")} placeholder={t("shortcuts.recording")} onKeyDown={capture} onKeyUp={(event) => capture(event, true)} onBlur={() => setHeldAlt(false)} />
                  <button type="button" className="shortcut-button ui-focus-ring" onClick={() => setRecording(null)}>{t("shortcuts.cancel")}</button>
                  {invalid && <span role="alert">{t("shortcuts.invalid")}</span>}
                </div>
              ) : (
                <div className="shortcut-actions">
                  <button type="button" className="shortcut-button ui-focus-ring" onClick={() => { setRecording(id); setHeldAlt(false); setInvalid(false); }}><Plus size={13} aria-hidden="true" />{t("shortcuts.add")}</button>
                  <button type="button" className="shortcut-button ui-focus-ring" disabled={bindings[id].length === 0} onClick={() => save(id, [])}>{t("shortcuts.clear")}</button>
                  <button type="button" className="shortcut-button ui-focus-ring" onClick={() => save(id, null)}><RotateCcw size={13} aria-hidden="true" />{t("shortcuts.reset")}</button>
                </div>
              )}
              {conflicts.length > 0 && <p className="shortcut-conflicts">{t("shortcuts.conflicts", { actions: conflicts.map(({ id: other }) => t(`shortcuts.${other}.label`)).join(" / ") })}</p>}
            </div>
          </section>
        );
      })}
    </section>
  );
}
