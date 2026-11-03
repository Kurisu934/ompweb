"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  getWhaleTailMotion,
  subscribeWhaleTailMotion,
  WHALE_TAIL_LOOP_SECONDS,
  WHALE_TAIL_REST_POSE,
  WHALE_TAIL_VIEWBOX,
  type WhaleTailAction,
  type WhaleTailMotion,
  WHALE_TAIL_MOTIONS,
} from "@/lib/whale-tail";
import type * as WhaleTailPoses from "@/lib/whale-tail-poses";

let posesModule: Promise<typeof WhaleTailPoses> | null = null;
const keyframes = new Map<WhaleTailAction, Promise<string>>();

/**
 * Registers `@keyframes whale-tail-<action>` once per page. Each traced contour
 * is a discrete frame (`steps(1, end)`), so no in-between shapes are invented.
 * CSS `d` animation runs in Chromium and Firefox; Safari keeps the still pose.
 */
function loadKeyframes(action: WhaleTailAction): Promise<string> {
  let pending = keyframes.get(action);
  if (!pending) {
    posesModule ??= import("@/lib/whale-tail-poses");
    pending = posesModule.then(({ WHALE_TAIL_POSES }) => {
      const poses = WHALE_TAIL_POSES[action];
      const name = `whale-tail-${action}`;
      const frames = poses.map((pose, index) => `${(index * 100 / poses.length).toFixed(4)}%{d:path('${pose}')}`).join("");
      const style = document.createElement("style");
      style.dataset.whaleTail = action;
      style.textContent = `@keyframes ${name}{${frames}100%{d:path('${poses[0]}')}}`;
      document.head.appendChild(style);
      return name;
    });
    // A failed chunk load must not pin the failure; the next mount retries.
    pending.catch(() => keyframes.delete(action));
    keyframes.set(action, pending);
  }
  return pending;
}

/**
 * DSH-style whale tail. Sways while `active` with the motion chosen in
 * Settings (or `motion`, for previews); otherwise (and under reduced motion)
 * it rests. Width:height is 5:4.
 */
export function WhaleTail({ active, width, motion: fixedMotion, className, style }: {
  active: boolean;
  width: number;
  motion?: WhaleTailMotion;
  className?: string;
  style?: CSSProperties;
}) {
  const chosen = useSyncExternalStore(subscribeWhaleTailMotion, getWhaleTailMotion, () => "official" as const);
  const motion = fixedMotion ?? chosen;
  const reducedMotion = usePrefersReducedMotion();
  const action = active && !reducedMotion && motion !== "still" ? motion : null;
  const [loaded, setLoaded] = useState<{ action: WhaleTailAction; name: string } | null>(null);

  useEffect(() => {
    if (!action) return;
    let cancelled = false;
    loadKeyframes(action)
      .then((name) => { if (!cancelled) setLoaded({ action, name }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [action]);

  const animation = action && loaded?.action === action
    ? `${loaded.name} ${WHALE_TAIL_LOOP_SECONDS[action]}s steps(1, end) infinite`
    : undefined;

  return (
    <svg
      viewBox={WHALE_TAIL_VIEWBOX}
      width={width}
      height={width * 0.8}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, overflow: "visible", ...style }}
    >
      <path d={WHALE_TAIL_REST_POSE} fill="currentColor" fillRule="evenodd" style={animation ? { animation } : undefined} />
    </svg>
  );
}

/**
 * Radio group of live previews, one per motion, so the Settings choice shows
 * what it plays. Arrow keys move and select, as in a native radio group.
 */
export function WhaleTailPicker({ value, onChange, labelFor, ...aria }: {
  value: WhaleTailMotion;
  onChange: (motion: WhaleTailMotion) => void;
  labelFor: (motion: WhaleTailMotion) => string;
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = (WHALE_TAIL_MOTIONS.indexOf(value) + step + WHALE_TAIL_MOTIONS.length) % WHALE_TAIL_MOTIONS.length;
    onChange(WHALE_TAIL_MOTIONS[index]);
    options.current[index]?.focus();
  };
  return (
    <div role="radiogroup" className="whale-tail-picker" onKeyDown={onKeyDown} {...aria}>
      {WHALE_TAIL_MOTIONS.map((motion, index) => (
        <button
          key={motion}
          ref={(node) => { options.current[index] = node; }}
          type="button"
          role="radio"
          aria-checked={value === motion}
          tabIndex={value === motion ? 0 : -1}
          onClick={() => onChange(motion)}
        >
          <WhaleTail active motion={motion} width={44} />
          <span>{labelFor(motion)}</span>
        </button>
      ))}
    </div>
  );
}
