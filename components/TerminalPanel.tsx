"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, SquareTerminal, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { useI18n } from "@/lib/i18n";
import { getFileName } from "@/lib/file-paths";
import { toast } from "@/components/ui/toast";
import type { TerminalInfo } from "@/lib/terminal-manager";
import { matchesShortcut } from "@/lib/keyboard-shortcuts";

const ACTIVE_STORAGE_KEY = "omp-web:active-terminal";
/** Mirrors MAX_INPUT_CHARS in lib/terminal-manager.ts. */
const INPUT_CHUNK = 64 * 1024;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** With a wallpaper the screen is see-through and its glass comes from `.wallpaper-surface`, like the rest of the UI. */
function xtermTheme() {
  const wallpaper = document.documentElement.dataset.wallpaper === "on";
  return {
    background: wallpaper ? "rgba(0, 0, 0, 0)" : cssVar("--bg", "#111"),
    foreground: cssVar("--text", "#ddd"),
    cursor: cssVar("--accent", "#e07"),
    cursorAccent: cssVar("--bg", "#111"),
    selectionBackground: cssVar("--bg-selected", "#444"),
  };
}

/**
 * One terminal's screen: an xterm.js view attached to the server PTY. Output
 * streams over SSE (scrollback replayed on attach); keystrokes are sent in
 * order, batched per microtask.
 */
function TerminalView({ id, visible, exitedLabel, onExit }: { id: string; visible: boolean; exitedLabel: (code: number) => string; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Callbacks via refs: a locale change must not tear down the live xterm.
  const onExitRef = useRef(onExit);
  const exitedLabelRef = useRef(exitedLabel);
  useEffect(() => {
    onExitRef.current = onExit;
    exitedLabelRef.current = exitedLabel;
  }, [onExit, exitedLabel]);

  const fit = useCallback(() => {
    const term = termRef.current;
    const host = hostRef.current;
    if (!term || !fitRef.current || !host || host.clientWidth === 0 || host.clientHeight === 0) return;
    fitRef.current.fit();
    const size = { cols: term.cols, rows: term.rows };
    if (sizeRef.current?.cols === size.cols && sizeRef.current.rows === size.rows) return;
    sizeRef.current = size;
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      void api(`/api/terminals/${id}`, { method: "POST", body: JSON.stringify(size) }).catch(() => {});
    }, 80);
  }, [id]);

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let observer: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let pending = "";
    let flushing = false;
    let chain: Promise<unknown> = Promise.resolve();
    const sendInput = (data: string) => {
      pending += data;
      if (flushing) return;
      flushing = true;
      queueMicrotask(() => {
        flushing = false;
        const text = pending;
        pending = "";
        for (let start = 0; start < text.length; start += INPUT_CHUNK) {
          const chunk = text.slice(start, start + INPUT_CHUNK);
          // Chained so keystrokes reach the shell in the order they were typed.
          chain = chain.then(() => api(`/api/terminals/${id}`, { method: "POST", body: JSON.stringify({ input: chunk }) })).catch(() => {});
        }
      });
    };

    void (async () => {
      const [{ Terminal }, { FitAddon: Fit }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      if (disposed || !hostRef.current) return;
      const term = new Terminal({ ...terminalOptions(), cursorBlink: true, scrollback: 5000 });
      const fitAddon = new Fit();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon((_event, uri) => { window.open(uri, "_blank", "noopener,noreferrer"); }));
      // Only the configured copy chord is intercepted; other keys belong to the shell.
      term.attachCustomKeyEventHandler((event) => {
        if (event.type === "keydown" && matchesShortcut("copyTerminal", event)) {
          event.preventDefault();
          const selection = term.getSelection();
          if (selection) void navigator.clipboard?.writeText(selection).catch(() => {});
          return false;
        }
        return true;
      });
      term.open(hostRef.current);
      termRef.current = term;
      fitRef.current = fitAddon;
      term.onData(sendInput);
      fit();
      observer = new ResizeObserver(() => fit());
      observer.observe(hostRef.current);
      themeObserver = new MutationObserver(() => { term.options.theme = xtermTheme(); });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style", "data-wallpaper", "data-glass"] });

      source = new EventSource(`/api/terminals/${id}/events`);
      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as { type: string; data?: string; exitCode?: number };
          if (event.type === "replay") {
            term.reset();
            if (event.data) term.write(event.data);
            if (typeof event.exitCode === "number") term.write(`\r\n\x1b[2m${exitedLabelRef.current(event.exitCode)}\x1b[0m\r\n`);
          } else if (event.type === "output" && event.data) {
            term.write(event.data);
          } else if (event.type === "exit" && typeof event.exitCode === "number") {
            term.write(`\r\n\x1b[2m${exitedLabelRef.current(event.exitCode)}\x1b[0m\r\n`);
            onExitRef.current();
          }
        } catch {
          // ignore malformed frames
        }
      };
    })();

    return () => {
      disposed = true;
      source?.close();
      observer?.disconnect();
      themeObserver?.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      sizeRef.current = null;
    };
  }, [id, fit]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      fit();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, fit]);

  return <div ref={hostRef} className="terminal-view" style={VIEW_STYLE} />;
}

const VIEW_STYLE = { position: "absolute", inset: "6px 4px 4px 8px" } as const;

function terminalOptions() {
  return {
    // Nerd Font symbols (shell prompts) render when the font is installed locally.
    fontFamily: `${cssVar("--font-mono", "monospace")}, "Symbols Nerd Font Mono", "Symbols Nerd Font"`,
    fontSize: 13,
    theme: xtermTheme(),
    allowProposedApi: false,
    allowTransparency: true,
  };
}

/**
 * The cols/rows a terminal view gets in `screen`, measured by fitting a
 * throwaway xterm there. A new shell is started at that size, so output it
 * prints before the real view attaches (a fetch banner in .bashrc) is not
 * laid out for another width; replayed output cannot be re-wrapped.
 */
async function measureScreen(screen: HTMLElement | null): Promise<{ cols: number; rows: number } | null> {
  if (!screen || screen.clientWidth === 0 || screen.clientHeight === 0) return null;
  const [{ Terminal }, { FitAddon: Fit }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
  const probe = document.createElement("div");
  probe.className = "terminal-view";
  Object.assign(probe.style, VIEW_STYLE, { visibility: "hidden" });
  screen.appendChild(probe);
  const term = new Terminal(terminalOptions());
  try {
    const fitAddon = new Fit();
    term.loadAddon(fitAddon);
    term.open(probe);
    return fitAddon.proposeDimensions() ?? null;
  } finally {
    term.dispose();
    probe.remove();
  }
}

/**
 * Right-panel Terminal tab: tabs for the server's shells plus the active
 * one's screen. Opening the tab with no terminal starts one in the workspace;
 * a `request` (from "Open in terminal") starts one in its folder instead.
 */
export function TerminalPanel({ cwd, active, request }: { cwd: string | null; active: boolean; request: { id: number; cwd: string } | null }) {
  const { t } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_STORAGE_KEY); } catch { return null; }
  });
  const creatingRef = useRef(false);
  const handledRequestRef = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ available: boolean; terminals: TerminalInfo[] }>("/api/terminals");
      setAvailable(data.available);
      setTerminals(data.terminals);
      return data;
    } catch {
      setAvailable(false);
      return null;
    }
  }, []);

  const select = useCallback((id: string | null) => {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(ACTIVE_STORAGE_KEY, id);
      else localStorage.removeItem(ACTIVE_STORAGE_KEY);
    } catch { /* storage unavailable */ }
  }, []);

  const create = useCallback(async (targetCwd: string | null = cwd) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const size = await measureScreen(screenRef.current);
      const terminal = await api<TerminalInfo>("/api/terminals", { method: "POST", body: JSON.stringify({ cwd: targetCwd, ...size }) });
      setTerminals((list) => [...list, terminal]);
      select(terminal.id);
    } catch (error) {
      toast.error(t("terminal.createFailed"), error instanceof Error ? error.message : String(error));
    } finally {
      creatingRef.current = false;
    }
  }, [cwd, select, t]);

  const close = useCallback(async (id: string) => {
    try {
      await api(`/api/terminals/${id}`, { method: "DELETE" });
    } catch {
      // Already gone on the server; drop it here too.
    }
    const next = terminals.filter((terminal) => terminal.id !== id);
    setTerminals(next);
    if (activeId === id) select(next.at(-1)?.id ?? null);
  }, [activeId, select, terminals]);

  // Load the list when first shown; start a shell if there is none yet
  // (unless a requested one is about to start).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Read before the effect below marks the request handled.
    const requestPending = request !== null && request.id !== handledRequestRef.current;
    void refresh().then((data) => {
      if (cancelled || !data?.available) return;
      if (data.terminals.length === 0) { if (!requestPending) void create(); }
      else if (!data.terminals.some((terminal) => terminal.id === activeId)) select(data.terminals.at(-1)!.id);
    });
    return () => { cancelled = true; };
    // Re-check only when the tab becomes visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active || !request || request.id === handledRequestRef.current) return;
    handledRequestRef.current = request.id;
    // After a list load, so a slower load cannot replace the list without it.
    void refresh().then((data) => { if (data?.available) void create(request.cwd); });
  }, [active, request, create, refresh]);

  const exitedLabel = useCallback((code: number) => t("terminal.exited", { code }), [t]);
  const handleExit = useCallback(() => { void refresh(); }, [refresh]);
  const current = terminals.find((terminal) => terminal.id === activeId) ?? null;

  if (available === false) {
    return (
      <div className="terminal-empty">
        <SquareTerminal size={26} strokeWidth={1.5} aria-hidden="true" />
        <div className="terminal-empty-title">{t("terminal.title")}</div>
        <div className="terminal-empty-text">{t("terminal.unavailable")}</div>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-tabs wallpaper-surface" role="tablist" aria-label={t("terminal.title")}>
        {terminals.map((terminal, index) => {
          const selected = terminal.id === activeId;
          const name = `${getFileName(terminal.cwd) || terminal.cwd} ${index + 1}`;
          return (
            <div key={terminal.id} className="terminal-tab" data-active={selected || undefined} data-exited={terminal.exitCode !== undefined || undefined}>
              <button type="button" role="tab" aria-selected={selected} className="terminal-tab-select" title={terminal.cwd} onClick={() => select(terminal.id)}>
                <SquareTerminal size={12} strokeWidth={1.9} aria-hidden="true" />
                <span>{name}</span>
              </button>
              <button type="button" className="terminal-tab-close" aria-label={t("terminal.close", { name })} title={t("terminal.close", { name })} onClick={() => void close(terminal.id)}>
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          );
        })}
        <button type="button" className="terminal-new" aria-label={t("terminal.new")} title={t("terminal.new")} onClick={() => void create()}>
          <Plus size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {/* Opted out of the wallpaper's adaptive text color, which would paint
          every cell in one ink and erase the shell's own colors. */}
      <div ref={screenRef} className="terminal-screen wallpaper-surface" data-wallpaper-contrast="off" data-native-context-menu>
        {current && <TerminalView key={current.id} id={current.id} visible={active} exitedLabel={exitedLabel} onExit={handleExit} />}
      </div>
    </div>
  );
}
