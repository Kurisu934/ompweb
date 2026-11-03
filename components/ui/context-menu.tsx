"use client";

/**
 * omp-web's right-click menu. Mounted once (AppShell); see lib/context-menu.ts
 * for how components contribute sections. Shift+right-click always shows the
 * browser menu.
 */
import { Menu } from "@base-ui/react/menu";
import { Fragment, useEffect, useRef, useState } from "react";
import { Copy, Quote } from "lucide-react";
import { useI18n, translate } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import {
  takeContextMenuContributions,
  wantsNativeContextMenu,
  type ContextMenuSection,
} from "@/lib/context-menu";
import { toast } from "./toast";

/** Copy from a menu item: the menu is already gone, so confirm with a toast. */
export function copyFromContextMenu(text: string): void {
  copyText(text).then(
    () => toast.success(translate("appShell.copied")),
    () => toast.error(translate("contextMenu.copyFailed")),
  );
}

interface MenuState {
  /** Bumped per opening so a re-open elsewhere resets highlight and position. */
  key: number;
  x: number;
  y: number;
  sections: ContextMenuSection[];
}

/** The selected text when the pointer is on the selection (or the menu came
 *  from the keyboard); a right-click elsewhere must not act on it. */
function selectedTextAt(x: number, y: number, fromKeyboard: boolean): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const text = selection.toString();
  if (!text.trim()) return "";
  if (fromKeyboard) return text;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    for (const rect of selection.getRangeAt(index).getClientRects()) {
      if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return text;
    }
  }
  return "";
}

export function ContextMenuHost({ appSection, onQuote }: {
  /** App-wide actions, shown when nothing more specific was right-clicked. */
  appSection?: () => ContextMenuSection | null;
  /** Quote selected text into the composer; omitted when no chat is shown. */
  onQuote?: ((text: string) => void) | null;
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const keyRef = useRef(0);
  const appSectionRef = useRef(appSection);
  appSectionRef.current = appSection;
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;

  useEffect(() => {
    // window, bubble phase: runs after every React onContextMenu handler (the
    // React root listens on the document), so all contributions are in.
    const onContextMenu = (event: MouseEvent) => {
      const contributed = takeContextMenuContributions(event);
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
      if (!target) return;
      if (popupRef.current?.contains(target)) {
        event.preventDefault();
        return;
      }
      if (wantsNativeContextMenu(event, target)) return;

      // Keyboard (context-menu key, Shift+F10 is taken above) reports no pointer position.
      const fromKeyboard = event.clientX === 0 && event.clientY === 0;
      const rect = fromKeyboard ? target.getBoundingClientRect() : null;
      const x = rect ? rect.left + 8 : event.clientX;
      const y = rect ? rect.top + Math.min(rect.height, 24) : event.clientY;

      const sections: ContextMenuSection[] = [];
      const selected = selectedTextAt(x, y, fromKeyboard);
      if (selected) {
        const quote = onQuoteRef.current;
        sections.push({
          id: "selection",
          items: [
            { id: "copy-selection", label: translate("contextMenu.copy"), icon: Copy, shortcut: "Ctrl+C", onSelect: () => copyFromContextMenu(selected) },
            ...(quote ? [{ id: "quote-selection", label: translate("contextMenu.quoteInReply"), icon: Quote, onSelect: () => quote(selected) }] : []),
          ],
        });
      }
      sections.push(...contributed);
      if (sections.length === 0 && !target.closest("[role=dialog], [role=alertdialog]")) {
        const app = appSectionRef.current?.();
        if (app && app.items.length > 0) sections.push(app);
      }
      if (sections.length === 0) return;

      event.preventDefault();
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      keyRef.current += 1;
      setMenu({ key: keyRef.current, x, y, sections });
      setOpen(true);
    };
    const close = () => setOpen(false);
    // Native menus are modal; this one is not, so it closes instead of
    // floating over content that scrolled away beneath it.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  if (!menu) return null;
  // Zero-size point at the pointer; floating-ui reads only these fields.
  const { x, y } = menu;
  const anchor = {
    getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) }),
  };

  return (
    <Menu.Root
      open={open}
      onOpenChange={setOpen}
      modal={false}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        // Give focus back only when the chosen action left it nowhere (a
        // rename field that took focus keeps it).
        const restore = restoreFocusRef.current;
        restoreFocusRef.current = null;
        requestAnimationFrame(() => {
          const active = document.activeElement;
          if (restore?.isConnected && (!active || active === document.body)) restore.focus({ preventScroll: true });
        });
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          key={menu.key}
          className="context-menu-positioner"
          anchor={anchor}
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={8}
        >
          <Menu.Popup ref={popupRef} className="context-menu" finalFocus={false}>
            {menu.sections.map((section, sectionIndex) => (
              <Fragment key={`${section.id}-${sectionIndex}`}>
                {sectionIndex > 0 && <Menu.Separator className="context-menu-separator" />}
                <Menu.Group className="context-menu-group">
                  {section.title && <Menu.GroupLabel className="context-menu-title">{section.title}</Menu.GroupLabel>}
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Menu.Item
                        key={item.id}
                        className="context-menu-item"
                        data-danger={item.danger ? "true" : undefined}
                        disabled={item.disabled}
                        label={item.label}
                        onClick={item.onSelect}
                      >
                        <span className="context-menu-icon" aria-hidden="true">
                          {Icon && <Icon size={14} strokeWidth={1.9} />}
                        </span>
                        <span className="context-menu-label">{item.label}</span>
                        {item.shortcut && <kbd className="context-menu-shortcut">{item.shortcut}</kbd>}
                      </Menu.Item>
                    );
                  })}
                </Menu.Group>
              </Fragment>
            ))}
            <div className="context-menu-hint" aria-hidden="true">{t("contextMenu.nativeHint")}</div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
