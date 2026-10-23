/**
 * Whale-tail activity icon (running status bar + live thinking row): the
 * per-browser motion preference and the still pose. Contours for the motions
 * live in lib/whale-tail-poses.ts (personal-use, see its header) and are
 * loaded only when a tail starts moving.
 */

export type WhaleTailAction = "official" | "wag" | "sway" | "twist";
export type WhaleTailMotion = WhaleTailAction | "still";

export const WHALE_TAIL_MOTIONS: readonly WhaleTailMotion[] = ["official", "wag", "sway", "twist", "still"];

/** Seconds per loop: the official sway at DSH's recommended 4 s, the others at dsh-status-rotator's idle 1 s. */
export const WHALE_TAIL_LOOP_SECONDS: Record<WhaleTailAction, number> = { official: 4, wag: 1, sway: 1, twist: 1 };

/** Every contour, including the still pose, is drawn in this box (aspect 5:4). */
export const WHALE_TAIL_VIEWBOX = "20 40 300 240";

/** First frame of the official sway: the tail at rest, shown whenever it does not move. */
export const WHALE_TAIL_REST_POSE = "M97 60 L102 61 L107 63 L110 66 L114 69 L118 71 L122 73 L127 75 L132 76 L136 78 L142 79 L147 80 L152 82 L157 83 L161 85 L165 88 L169 90 L173 93 L177 95 L180 98 L183 102 L186 105 L189 108 L191 113 L193 117 L197 118 L202 117 L208 117 L215 117 L221 117 L226 118 L232 119 L236 121 L241 123 L246 124 L250 126 L255 128 L259 130 L265 131 L270 132 L275 133 L282 133 L287 132 L291 134 L295 137 L297 141 L297 148 L295 152 L292 155 L289 159 L287 163 L283 166 L281 170 L278 173 L274 176 L270 178 L267 181 L263 184 L258 185 L253 187 L249 189 L244 190 L238 191 L233 192 L226 192 L221 193 L215 193 L208 193 L202 193 L197 194 L193 197 L192 202 L192 207 L192 213 L193 218 L194 224 L195 229 L196 234 L196 241 L197 246 L198 252 L198 258 L198 264 L197 270 L191 270 L184 270 L181 267 L182 262 L181 256 L181 250 L180 245 L180 238 L179 233 L178 227 L177 222 L176 217 L175 211 L175 205 L176 199 L177 194 L179 190 L182 186 L185 183 L188 180 L193 178 L198 177 L205 177 L211 177 L216 176 L223 176 L229 176 L234 175 L240 174 L245 173 L250 171 L254 169 L258 167 L262 164 L266 162 L269 158 L272 155 L275 152 L273 149 L267 149 L263 147 L257 146 L253 144 L248 142 L243 141 L239 139 L234 137 L230 135 L224 134 L219 133 L213 133 L206 133 L201 134 L196 135 L190 136 L185 135 L181 132 L179 128 L178 123 L175 119 L173 115 L170 111 L167 108 L164 105 L159 103 L155 101 L151 99 L146 97 L142 95 L136 94 L131 93 L126 92 L121 90 L117 88 L113 86 L108 84 L104 82 L101 82 L100 87 L100 93 L101 99 L103 103 L105 108 L107 112 L110 115 L113 119 L116 122 L118 126 L122 129 L125 132 L129 135 L132 138 L136 140 L140 143 L143 146 L147 149 L150 152 L153 155 L156 159 L158 163 L160 167 L162 172 L162 178 L160 183 L159 188 L157 192 L155 197 L153 201 L151 206 L149 210 L147 214 L145 219 L144 224 L142 228 L141 234 L140 239 L138 244 L137 249 L137 255 L136 261 L135 266 L134 271 L128 270 L122 270 L119 266 L120 261 L120 255 L121 249 L122 244 L123 238 L124 233 L125 228 L127 223 L128 218 L130 214 L132 209 L134 205 L136 200 L138 196 L140 192 L142 187 L144 183 L145 177 L144 172 L142 168 L139 164 L136 161 L133 158 L129 155 L125 153 L121 150 L118 147 L115 144 L111 141 L108 138 L105 135 L102 131 L99 128 L96 124 L94 120 L91 117 L89 112 L87 108 L86 102 L84 98 L84 92 L84 85 L85 80 L86 75 L88 70 L90 66 L93 62 Z";

const MOTION_KEY = "omp-web:whale-tail";
const listeners = new Set<() => void>();

function isWhaleTailMotion(value: unknown): value is WhaleTailMotion {
  return WHALE_TAIL_MOTIONS.includes(value as WhaleTailMotion);
}

export function getWhaleTailMotion(): WhaleTailMotion {
  if (typeof window === "undefined") return "official";
  try {
    const value = window.localStorage.getItem(MOTION_KEY);
    if (isWhaleTailMotion(value)) return value;
  } catch {
    // storage unavailable — fall through to the default
  }
  return "official";
}

export function setWhaleTailMotion(motion: WhaleTailMotion): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOTION_KEY, motion);
  } catch {
    // storage unavailable — the preference simply won't persist
  }
  for (const listener of listeners) listener();
}

/** useSyncExternalStore subscription: Settings changes and other tabs update visible tails. */
export function subscribeWhaleTailMotion(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MOTION_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
