"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, ExternalLink, KeyRound, ListChecks, MessageCircleQuestion, PenLine, ShieldQuestion } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getFileName } from "@/lib/file-paths";
import type { AttentionItem, AttentionKind } from "@/lib/attention";
import { SidebarIconButton, SidebarPortalMenu } from "./SessionSidebar-chrome";

const KIND_ICON: Record<AttentionKind, typeof Bell> = {
  select: ListChecks,
  confirm: ShieldQuestion,
  input: PenLine,
  editor: PenLine,
  ask: MessageCircleQuestion,
  open_url: ExternalLink,
  password: KeyRound,
};

/**
 * Sidebar bell listing everything agents are waiting on the user for
 * (lib/attention.ts). Rings while anything is pending; picking an entry jumps
 * to the session where it can be answered.
 */
export function AttentionCenter({ items, onOpen }: { items: AttentionItem[]; onOpen: (item: AttentionItem) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  const count = items.length;
  const label = count > 0 ? t("attention.titleCount", { count }) : t("attention.title");
  const age = (createdAt: number) => {
    const minutes = Math.floor((now - createdAt) / 60_000);
    return minutes < 1 ? t("attention.justNow") : t("attention.minutesAgo", { count: minutes });
  };

  return (
    <>
      <span className="attention-bell" data-active={count > 0 ? "true" : undefined}>
        <SidebarIconButton ref={anchor} label={label} onClick={() => setOpen((value) => !value)} active={count > 0} expanded={open} badge={count}>
          {count > 0 ? <BellRing size={14} strokeWidth={2} aria-hidden="true" /> : <Bell size={14} strokeWidth={1.9} aria-hidden="true" />}
        </SidebarIconButton>
      </span>
      <SidebarPortalMenu anchor={anchor} open={open} onClose={() => setOpen(false)} minWidth={280} style={{ padding: 6, maxWidth: 340 }}>
        <div className="sidebar-filter-heading">{t("attention.title")}</div>
        {count === 0 ? (
          <div className="attention-empty">{t("attention.empty")}</div>
        ) : items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const where = item.sessionName || getFileName(item.cwd) || item.cwd;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="sidebar-menu-item attention-item"
              onClick={() => {
                setOpen(false);
                onOpen(item);
              }}
            >
              <Icon size={14} strokeWidth={1.9} aria-hidden="true" className="attention-item-icon" />
              <span className="attention-item-body">
                <span className="attention-item-title">{item.title || t(`attention.kind.${item.kind}`)}</span>
                <span className="attention-item-meta">
                  {t(`attention.kind.${item.kind}`)} · {where} · {age(item.createdAt)}
                </span>
              </span>
            </button>
          );
        })}
      </SidebarPortalMenu>
    </>
  );
}
