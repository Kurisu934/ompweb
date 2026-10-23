"use client";

import { useRef, useState } from "react";
import { Check, ListFilter, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  countActiveSessionFilters,
  DEFAULT_SESSION_FILTERS,
  SESSION_ACTIVITY_WINDOWS,
  SESSION_STATUS_FILTERS,
  type SessionActivityWindow,
  type SessionFilters,
  type SessionStatusFilter,
} from "@/lib/session-filters";
import { SidebarIconButton, SidebarPortalMenu } from "./SessionSidebar-chrome";

/** Sessions matching each single option, shown beside it in the menu. */
export type SessionFilterCounts = Record<SessionStatusFilter | Exclude<SessionActivityWindow, "any">, number>;

function toggleStatus(filters: SessionFilters, status: SessionStatusFilter): SessionFilters {
  return {
    ...filters,
    statuses: filters.statuses.includes(status)
      ? filters.statuses.filter((item) => item !== status)
      : SESSION_STATUS_FILTERS.filter((item) => item === status || filters.statuses.includes(item)),
  };
}

/** Workspaces header filter button + menu: status checkboxes, activity window, reset. */
export function SessionFilterMenu({ filters, counts, onChange }: {
  filters: SessionFilters;
  counts: SessionFilterCounts;
  onChange: (filters: SessionFilters) => void;
}) {
  const { t } = useI18n();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const activeCount = countActiveSessionFilters(filters);

  return (
    <>
      <SidebarIconButton
        ref={anchor}
        label={t("sessionSidebar.filter")}
        title={activeCount ? t("sessionSidebar.filterActiveTitle", { count: activeCount }) : t("sessionSidebar.filter")}
        active={activeCount > 0}
        expanded={open}
        badge={activeCount}
        onClick={() => setOpen((value) => !value)}
      >
        <ListFilter size={15} strokeWidth={1.9} aria-hidden="true" />
      </SidebarIconButton>
      <SidebarPortalMenu anchor={anchor} open={open} onClose={() => setOpen(false)} minWidth={196} style={{ padding: 6 }}>
        <div className="sidebar-filter-heading">{t("sessionSidebar.filterStatus")}</div>
        {SESSION_STATUS_FILTERS.map((status) => {
          const checked = filters.statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              className="sidebar-menu-item sidebar-filter-option"
              onClick={() => onChange(toggleStatus(filters, status))}
            >
              <span className="sidebar-filter-mark" data-shape="box" aria-hidden="true">{checked && <Check size={11} strokeWidth={2.6} />}</span>
              <span className="sidebar-filter-label">{t(`sessionSidebar.filterStatus.${status}`)}</span>
              <span className="sidebar-filter-count">{counts[status]}</span>
            </button>
          );
        })}
        <div className="sidebar-filter-heading">{t("sessionSidebar.filterActivity")}</div>
        {SESSION_ACTIVITY_WINDOWS.map((window) => {
          const checked = filters.activity === window;
          return (
            <button
              key={window}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              className="sidebar-menu-item sidebar-filter-option"
              onClick={() => onChange({ ...filters, activity: window })}
            >
              <span className="sidebar-filter-mark" data-shape="dot" aria-hidden="true">{checked && <span />}</span>
              <span className="sidebar-filter-label">{t(`sessionSidebar.filterActivity.${window}`)}</span>
              {window !== "any" && <span className="sidebar-filter-count">{counts[window]}</span>}
            </button>
          );
        })}
        <div className="sidebar-filter-divider" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="sidebar-menu-item sidebar-filter-option"
          disabled={activeCount === 0}
          onClick={() => onChange(DEFAULT_SESSION_FILTERS)}
        >
          <span className="sidebar-filter-label">{t("sessionSidebar.filterReset")}</span>
        </button>
      </SidebarPortalMenu>
    </>
  );
}

/** Applied filters under the Workspaces header, each removable on its own. */
export function SessionFilterChips({ filters, onChange }: {
  filters: SessionFilters;
  onChange: (filters: SessionFilters) => void;
}) {
  const { t } = useI18n();
  if (countActiveSessionFilters(filters) === 0) return null;
  const chips = [
    ...filters.statuses.map((status) => ({
      key: status,
      label: t(`sessionSidebar.filterStatus.${status}`),
      remove: () => onChange(toggleStatus(filters, status)),
    })),
    ...(filters.activity === "any" ? [] : [{
      key: filters.activity,
      label: t(`sessionSidebar.filterActivity.${filters.activity}`),
      remove: () => onChange({ ...filters, activity: "any" }),
    }]),
  ];
  return (
    <div className="sidebar-filter-chips" role="group" aria-label={t("sessionSidebar.filterApplied")}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="sidebar-filter-chip"
          onClick={chip.remove}
          aria-label={t("sessionSidebar.filterRemove", { name: chip.label })}
        >
          {chip.label}
          <X size={11} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="sidebar-filter-clear" onClick={() => onChange(DEFAULT_SESSION_FILTERS)}>
        {t("sessionSidebar.filterReset")}
      </button>
    </div>
  );
}
