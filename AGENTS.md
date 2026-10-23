# omp-web - Development Notes

## Quick Start

```bash
npm run dev   # port 30178
```

Typecheck: `node_modules/.bin/tsc --noEmit`  
Lint: `npm run lint`  
**Never run `next build` during dev** — pollutes `.next/` and breaks `npm run dev`.

The dev server needs the `omp` binary installed (on `PATH`, or set `OMP_WEB_OMP_BIN`).
All live-agent features go through it; session browsing works without it.

---

## Architecture

omp-web never imports `@oh-my-pi/*` or `@earendil-works/*` packages (they are
Bun-only and cannot run inside Node/Next). See `DESIGN.md` for the full porting
contract.

```
Browser                Next.js Server                    omp child process
  │                        │                                    │
  ├─ GET /api/sessions ────▶ reads ~/.omp/agent/sessions/       │
  ├─ GET /api/sessions/[id] reads .jsonl file directly          │
  ├─ GET /api/agent/running/events ───▶ running id SSE          │
  │                        │                                    │
  ├─ send message ─────────▶ POST /api/agent/[id]               │
  │                        │   startRpcSession() ── spawn ─────▶│ omp --mode rpc-ui
  │                        │   sendCommand({type:"prompt"}) ───▶│ (NDJSON stdio)
  │                        │                                    │
  ├─ SSE connect ──────────▶ GET /api/agent/[id]/events         │
  │                        │   onFrame() ◀── event frames ──────│
  │◀── data: {...} ─────────│                                    │
```

**Session browsing** (read-only): pure-Node parsing of omp session `.jsonl`
files via `lib/session-reader.ts` — no child process involved.  
**Sending a message**: `startRpcSession()` in `lib/rpc-manager.ts` spawns
`omp --mode rpc-ui` (one process per active session) through
`lib/omp/rpc-process.ts`.

Shared foundations in `lib/omp/`:

- `paths.ts` — Node port of omp's directory resolution (`~/.omp/agent`,
  XDG, session dir slugs).
- `omp-cli.ts` — locate/probe the installed `omp` binary (`resolveOmpBin`,
  `getOmpVersion`).
- `rpc-process.ts` — process + NDJSON protocol layer (`RpcProcess`).

---

## File Map

```
app/api/
  sessions/route.ts               GET  list all sessions
  sessions/[id]/route.ts          GET/PATCH/DELETE session
  sessions/[id]/context/route.ts  GET ?leafId= — context for a specific leaf
  sessions/[id]/export/route.ts   GET exported HTML for a session
  agent/new/route.ts              POST { cwd, message, toolNames?, provider?, modelId?, accountPins? }
  account-routing/route.ts        GET ?sessionId= {disabled,pins,serving} | PUT disable an account / pin a session's account
  provider-usage/route.ts         GET ?provider=&model= usage snapshot (`omp usage --json`, 60 s cache)
  provider-usage/reset/route.ts   POST {accountKey} spend one saved Codex/Claude rate-limit reset → {ok, message}
  agent/[id]/route.ts             GET state | POST any RPC command
  agent/[id]/events/route.ts      GET SSE stream
  agent/running/events/route.ts   GET SSE stream of running session ids + pending "needs you" dialogs
  auth/**                         provider list, login/logout, API keys (via RPC)
  cwd/validate/route.ts           POST validate/select a cwd
  default-cwd/route.ts            POST create ~/omp-cwd-YYYYMMDD
  files/[...path]/route.ts        GET file contents for viewer
  github-repo/route.ts            GET ?cwd= — GitHub owner/repo of the checkout (for #N links)
  home/route.ts                   GET user home directory
  models/route.ts                 GET { models, modelList, defaultModel }
  models-config/route.ts          GET/PUT — read/write ~/.omp/agent/models.yml
  models-config/test/route.ts     POST test a configured model/provider
  omp-settings/route.ts           GET/PUT native config.yml settings (allow-listed)
  web-settings/route.ts           GET/PUT omp-web's own server settings (auto-resume)
  mcp/route.ts                    GET/POST/PUT/DELETE project MCP servers
  plugins/route.ts                GET/POST plugin management (shells out to `omp plugin`)
  projects/route.ts               GET registered+discovered projects | POST add | DELETE hide
  skills/route.ts                 GET/PATCH loaded skills and disable-model-invocation
  skills/install/route.ts         POST install skills through npx skills add
  skills/search/route.ts          GET/POST skills.sh search
  terminals/route.ts              GET {available, terminals} | POST start a shell (cwd, cols, rows)
  terminals/[id]/route.ts         POST {input} | {cols, rows} | DELETE close
  terminals/[id]/events/route.ts  GET SSE: scrollback replay, then output/exit
  system/route.ts                 GET dashboard snapshot | PUT {memoryGuard} | POST {stopPid} (agent/terminal trees only)
  worktrees/route.ts              GET/POST/DELETE git worktrees
  scheduled-tasks/route.ts        GET list | POST create a scheduled task
  scheduled-tasks/[id]/route.ts   PATCH edit / {enabled} / {action:"run"} | DELETE
  hooks/[token]/route.ts          POST run a webhook-triggered scheduled task (token = credential, bypasses password)
  favorite-directories/route.ts   GET/PUT directory picker favorites (omp-web-settings.json)

lib/
  omp/                 shared omp foundations (paths, CLI probe, RpcProcess)
  account-routing.ts   server: per-session account pins + disabled accounts → omp auth.accountPolicies overlay
  account-choices.ts   client-safe account grouping (usage reports → one choice per account)
  attention.ts         client-safe "needs you" item type + dialog title helpers
  context-menu.ts      client-safe right-click menu core: contributions, native-menu rules, quoteMarkdown
  terminal-request.ts  "open in terminal" window event (requestTerminalAt → AppShell → TerminalPanel)
  agent-client.ts      typed fetch helper for /api/agent commands
  draft-store.ts       local draft persistence helpers
  file-access.ts       allowed file roots for /api/files and worktrees
  file-paths.ts        client/server path encoding helpers
  github-refs.ts       remark plugin linking #N / owner/repo#N + GithubRepoContext
  github-repo.ts       server: pick the gh-default GitHub remote from git config
  markdown.ts          shared markdown helpers
  npx.ts               npx runner used by skill install
  pi-types.ts          local structural types for agent/RPC objects
  project-ordering.ts  pure project sort/group/activity helpers (client + tests)
  project-registry.ts  on-disk managed-project registry (~/.omp/agent/projects.json)
  rpc-manager.ts       session registry + startRpcSession over RpcProcess
  session-reader.ts    session .jsonl parsing + path cache + buildSessionContext
  session-resume.ts    running-session list for auto-resume after a restart
  scheduled-messages.ts  server-sent "Send later" messages into an existing session
  scheduled-tasks.ts   standalone scheduled tasks (new session per run, retention)
  schedule-recurrence.ts  client-safe repeat rules + next-run computation
  session-archive.ts   archive one session (stop child, gc layout, cache flush)
  web-settings.ts      omp-web server settings (~/.omp/agent/omp-web-settings.json)
  skills-service.ts    pure-Node skill discovery mirroring omp's providers
  tool-presets.ts      PRESET_NONE/DEFAULT/FULL + getToolNamesForPreset()
  types.ts             shared TypeScript types
  normalize.ts         normalizeToolCalls() — field name mismatch between file format and our types
  word-prediction.ts   pure ghost-text arithmetic (advance/accept) for composer word prediction
  terminal-manager.ts  server: PTY shells via optional node-pty (globalThis registry, scrollback)
  system-stats.ts      /proc readers (meminfo, stat, process table, descendants) + preferForOomKill
  memory-guard.ts      server: low-memory guard (kills largest agent/terminal command) + dashboard snapshot
  memory-guard-settings.ts / system-monitor-types.ts  client-safe guard settings + /api/system shapes
  worktree.ts          project/worktree resolution and git worktree operations

components/
  AppShell.tsx        layout + URL state + tab management
  SessionSidebar.tsx  session tree + FileExplorer
  ChatWindow.tsx      chat composition + completion sound wrapper
  ChatInput.tsx       input bar + model/thinking/tools/compact controls
  AccountPicker.tsx   composer account chip (Auto / a specific account per chat)
  AccountRoutingSettings.tsx  Settings → Connected accounts → Account rotation (temporary disable)
  AttentionCenter.tsx sidebar bell listing pending dialogs/sudo prompts; click jumps to the session
  ComposerPanels.tsx  composer-attached todo + subagent panels (collapsible, live states)
  TodoList.tsx        todo phase grid with preview/show-all (used by ComposerPanels)
  SubagentTranscriptDialog.tsx  task + final output summary dialog (wide, screen-adaptive)
  MessageView.tsx     renders one message (user/assistant/toolCall/toolResult)
  CommandPalette.tsx  ⌘K/Ctrl+K palette (cmdk): session switch, new session, theme
  ImageLightbox.tsx   click-to-preview lightbox for chat images (ClickableImage)
  BranchNavigator.tsx in-session branch switcher
  ChatMinimap.tsx     scroll minimap alongside the message list
  MarkdownBody.tsx    markdown renderer
  ModelsConfig.tsx    modal for models/auth configuration
  McpConfig.tsx       MCP inventory + project editor (Settings → Extensions & Skills)
  SkillsConfig.tsx    loaded/search/installable skills (Settings → Extensions & Skills)
  ScheduledTasksPanel.tsx  scheduled tasks window (task list, detail/editor, recent runs)
  FileExplorer.tsx    file tree inside sidebar
  FileViewer.tsx      file content in a tab
  GhostMirror.tsx     textarea overlay painting ghost-text word completion
  TabBar.tsx          right-panel tab bar (Explorer, Git, Terminal + open file tabs)
  TerminalPanel.tsx   right-panel Terminal tab: shell tabs + xterm.js view (Ctrl+` toggles)
  SystemPanel.tsx     right-panel System tab: memory/CPU gauges, per-session usage, memory guard
  ui/                 shared primitives: Dialog/Tooltip/Collapsible, fields, toast, ContextMenuHost

hooks/
  useAgentSession.ts       messages + streaming + SSE + fork/navigate/reconciliation logic
  useAudio.ts              completion sound + browser AudioContext unlock
  useDragDrop.ts           shared drag/drop state
  useIsMobile.ts           responsive breakpoint hook
  usePrefersReducedMotion.ts OS reduce-motion preference (SMIL-safe)
  useTheme.ts              theme state (localStorage key "omp-theme")
  useWordPrediction.ts     debounced omp predict_word ghost text + feedback
```

---

## Key Design Decisions & Traps

### RPC session lifecycle (`lib/rpc-manager.ts`)
- One wrapper per session id, keyed in a `globalThis` registry.
- `globalThis` survives Next.js hot-reload; plain module-level Map does not.
- Idle sessions are disposed after a timeout; concurrent `startRpcSession()`
  calls must share a single start promise.

### sudo password prompts (`lib/askpass.ts`, `lib/askpass-peer.ts`, `bin/askpass/`)
- Linux only. `prepareAskpassSpawn()` gives every omp child a token and env:
  `bin/askpass` first on PATH (its `sudo` adds `-A` unless the call picks
  `-A`/`-S`/`-n`), `SUDO_ASKPASS=bin/askpass/omp-web-askpass` (→
  `askpass-client.cjs`), and the URL of a loopback-only HTTP server started
  inside the Next process (not a Next route: it needs the TCP peer port).
- `verifyAskpassPeer()` maps the connection through /proc to the client pid
  and requires: node running exactly the client script, no NODE_OPTIONS, a
  root (euid 0) parent named `sudo`, stdout an anonymous pipe held by no other
  same-user process. The dialog shows that sudo's real cmdline.
- Browser side: `/api/askpass/events` (SSE, pending list only, never
  passwords) and `/api/askpass/answer`; `hooks/useAskpassRequests.ts` (one
  stream, in AppShell) feeds `components/AskpassDialog.tsx` and the attention
  bell. No listening tab → refused immediately; 240 s timeout (omp's bash
  tool times out at 300 s). Never log or persist a password.
- A determined same-user agent can still race the pipe or edit the client
  file; the checks block trivial phishing, not everything.

### Integrated terminal (`lib/terminal-manager.ts`, `components/TerminalPanel.tsx`)
- Shells run on PTYs from `node-pty` (an `optionalDependency`, loaded with a
  runtime `require` and listed in `serverExternalPackages`). Linux builds it
  from source at install, so a missing toolchain only disables the feature:
  `GET /api/terminals` reports `available: false` and the tab says why.
- Terminals belong to the server, not a tab: they survive reloads, are shared
  by every open tab, and stay until closed (or the server stops); at most 8.
  A view attaching gets the last 512 KiB of output replayed, then live output
  (coalesced per 8 ms). The terminal env drops omp-web's own variables
  (`OMP_WEB_*` incl. the password, `PORT`, `NODE_ENV`, Next internals).
- No WebSocket (route handlers cannot upgrade): output is SSE, keystrokes are
  POSTs chained in order and batched per microtask. Only the visible
  terminal holds an SSE connection, to stay within the browser's per-host
  HTTP/1.1 connection limit alongside the other streams.
- Same trust level as the agents' bash: anyone who can use omp-web gets a shell.

### Right-click menu (`lib/context-menu.ts`, `components/ui/context-menu.tsx`)
- One `ContextMenuHost` (base-ui `Menu`, non-modal, anchored to the pointer)
  is mounted in AppShell. Components never open it themselves: their
  `onContextMenu` calls `contributeContextMenu(event, section)` and lets the
  event bubble, so nested targets stack (code block, then message). The host
  listens on `window` (after React's root listener), so all contributions are
  in when it decides. Item closures are captured at right-click time; act on
  the clicked thing by id, never on "the active" state (see the file-tab
  handlers in AppShell, which take a tab id).
- Order: selection (Copy / Quote in reply) → contributions innermost first →
  the AppShell app section only when nothing else applied and the target is
  not in a dialog. No items at all means the browser menu.
- The browser menu is kept for Shift+right-click, touch long-press, text
  fields/contenteditable, media, `http(s)`/`mailto` links, and anything under
  `[data-native-context-menu]` (the terminal screen). Mark new surfaces that
  need the browser menu with that attribute.
- "Open in terminal" is a `window` event (`lib/terminal-request.ts`); AppShell
  opens the Terminal tab and `TerminalPanel` starts a shell in that cwd.
- Copy actions use `copyFromContextMenu` (toast feedback: the menu is gone).

### Memory guard (`lib/memory-guard.ts`, `components/SystemPanel.tsx`)
- Started from `instrumentation.node.ts` (globalThis state, Linux only); polls
  `/proc/meminfo` every 500 ms. Below `memoryGuard.killBelowPercent` of RAM
  free (omp-web-settings.json) it SIGTERMs the largest process (≥ 64 MiB)
  descended from an omp process or a terminal shell (`pickVictim`), then
  SIGKILLs it after 1.5 s or at once below half the line; an omp process
  itself only when none of its commands qualifies. Never the server, never
  anything outside those trees.
- Notification goes through the wrapper (`memoryGuardKilled`: chat `notice`,
  plus a `steer` to the agent when the run is active) or `noticeTerminal`.
  Read the victim's cmdline before signaling (it vanishes on exit).
- `RpcProcess` and terminal shells set `oom_score_adj` 800 at spawn
  (inherited by every command they run), so the kernel OOM killer prefers
  agent work over the server. The service unit needs `OOMPolicy=continue`
  (generated unit sets it); with systemd's default `stop`, one OOM-killed
  agent command stops the whole service.

### "Needs you" attention bell (`lib/attention.ts`, `components/AttentionCenter.tsx`)
- Session items are the wrapper's `pendingUiRequests` (select/confirm/input/
  editor/ask/open_url; `attentionItems()`), aggregated by `getAttentionItems()`
  and carried as `attention` on every `/api/agent/running/events` frame.
  `notifyRunningChange()` includes them in its dedupe snapshot, so every path
  that adds or drops a pending dialog (new request, `cancel`, the browser's
  `extension_ui_response`, timeout expiry, destroy) must reach a
  `notifyRunningChange()` call.
- The sidebar (the only running-stream subscriber) reports items up via
  `onAttentionChange`; AppShell merges them with sudo prompts, renders the
  bell in the sidebar header (`headerAccessory`), prefixes the tab title with
  the count, dots the sidebar toggle while the sidebar is closed, and sends an
  OS notification for new items while the tab is hidden (only if permission
  was already granted). Clicking an item selects its session, where the
  dialog is replayed above the composer.

### Scheduled messages (`lib/scheduled-messages.ts`, `/api/sessions/[id]/scheduled`)
- Sent by the server, not the tab: entries live in
  `omp-web-scheduled-messages.json` in the agent dir (mode 600) with one timer
  each on a `globalThis` registry; startup (`instrumentation.node.ts`) and the
  first API call re-arm them, and overdue ones fire immediately.
- Delivery is `deliverScheduledMessage()` in `lib/rpc-manager.ts`: starts the
  session's omp if needed, sends `prompt` when idle and `follow_up` when a run
  is in progress. A failure keeps the entry with `error` (no automatic retry);
  PATCH with a new `sendAt` reschedules and clears it ("Send now"/"Retry").
- Two omp-web servers on one agent dir would both fire the same messages.

### Scheduled tasks (`lib/scheduled-tasks.ts`, `/api/scheduled-tasks`, `components/ScheduledTasksPanel.tsx`)
- Recurring prompts with two targets. New-session tasks call
  `spawnNewSession()` (shared with `/api/agent/new`) in the task's cwd, send
  the prompt, and name the session `<task name> · <YYYY-MM-DD HH:MM>`; every
  run is an ordinary session, kept on purpose so its transcript stays.
  Session tasks (`targetSessionId`) deliver through `deliverScheduledMessage()`
  into that existing session; model/thinking/keepRuns/maxRun do not apply and
  `cwd` is copied from the session header for display only.
- Store: `omp-web-scheduled-tasks.json` in the agent dir (mode 600), one timer
  per task on a `globalThis` registry, re-armed at startup. Repeat rules
  (`lib/schedule-recurrence.ts`, client-safe): once / interval / daily /
  weekly / webhook, wall-clock times in the SERVER's time zone. A scheduled fire
  advances `nextRunAt` before starting, so a crash never repeats a run; runs
  missed while down collapse into one catch-up run.
- Busy sessions do not skip triggers. Session tasks reuse
  `deliverScheduledMessage()`: `prompt` while idle, `follow_up` while busy,
  with OMP's existing queue lifecycle and delivery mode (no separate scheduler
  queue). New-session tasks always start independently, even if a prior run
  is still starting or working. A `started` run record means delivery was
  accepted, not that a queued prompt has finished.
  `maxRunMinutes` arms an in-memory watchdog that sends `abort` (lost on
  restart; new-session runs only). Pending dialogs of a run reach the user
  through the attention bell like any session.
- Retention (new-session tasks only — session tasks share the user's session
  and must never archive it): run sessions beyond `keepRuns` are archived
  through `archiveSession()` (`lib/session-archive.ts`, shared with the
  archive route), skipping running ones and ones with forked children.
- Webhook trigger (`repeat.kind === "webhook"`, no schedule): the task gets a
  `webhookToken` (32 random bytes, base64url) and runs on
  `POST /api/hooks/<token>`. `proxy.ts` lets exactly that path past the
  password and origin checks — the token is the only credential, compared in
  constant time in `triggerScheduledTaskWebhook()`. Unknown/malformed tokens
  and non-webhook tasks all answer 404; paused tasks 409. The token survives
  edits, rotates via PATCH `{action:"regenerate-webhook"}`, and is dropped when
  the task leaves webhook mode. With `webhookIncludeBody` the request body
  (read with `readTextWithinLimit`, cut to 16k chars) is appended inside
  `<webhook-body>` and labelled as external data; otherwise it is ignored.
- Agent-created tasks (`lib/agent-task-tool.ts`, tool `scheduled_tasks`:
  create / list / cancel). Always target the CALLING session — the id comes
  from the RPC wrapper, never from tool arguments — so an agent can only
  message itself. Marked `createdByAgent`, at most
  `MAX_AGENT_TASKS_PER_SESSION` per session. `webhook` and `once` are
  `oneShot`: a one-shot URL is spent by its first call (token dropped before
  the run starts) and the task is deleted once delivered (kept, without a
  token, when delivery failed so the error shows). Agent webhooks always
  include the body and carry `expiresAt` (unused URLs are deleted then).
  The returned URL is `localServerUrl()` (OMP_WEB_HOSTNAME/OMP_WEB_PORT set by
  the launcher; a dev server needs `OMP_WEB_PORT` or the URL points at 30177).
- Server host tools (`registerServerHostTool` in `lib/rpc-manager.ts`): tools
  omp-web answers itself, with no browser. Registered on a `globalThis` map
  at startup (`instrumentation.node.ts` imports `lib/agent-task-tool.ts`),
  sent with `set_host_tools` when each child initializes, and merged into
  every browser `set_host_tools` because omp replaces the whole tool set.
  A browser tool cannot shadow a server tool name.
- UI: a memo-style window (`ScheduledTasksPanel`, mounted once in AppShell),
  opened by the sidebar header's calendar button through the
  `lib/scheduled-tasks-ui.ts` window event. The one-shot composer "Send later"
  stays separate (`lib/scheduled-messages.ts`).

### Auto-resume after a restart (`lib/session-resume.ts`)
- Off by default (`autoResumeSessions` in `omp-web-settings.json`). When on,
  `notifyRunningChange()` keeps `omp-web-interrupted-sessions.json` in the
  agent dir listing sessions that are mid-run; startup
  (`instrumentation.node.ts`) consumes it, restarts each session and sends
  `RESUME_PROMPT`.
- A service stop signals every process at once, so an omp child can die
  before omp-web's own SIGTERM handler runs. A session whose process died
  therefore stays listed for `EXIT_GRACE_MS`; the shutdown handler freezes the
  list (`markShuttingDown`) so those deaths count as interrupted, while a
  crash with omp-web still up is dropped after the window.
- Only session ids are stored; paths are re-resolved on resume.
- Known limit: resume does not detect a terminal `omp --resume <id>` started
  on the same session while omp-web was down; both would write the file.

### Two kinds of branching — don't confuse them
- **Fork** (Fork button on user message): creates a new independent `.jsonl` file. Shown as a child in the sidebar tree via `parentSession` header field.
- **In-session branch** (Continue button / BranchNavigator): navigates the entry tree within the same file. Multiple entries share the same `parentId`. Switching between them calls `/api/sessions/[id]/context?leafId=`.

### ToolCall field normalization
Sessions store toolCall blocks as `{type:"toolCall", id, name, arguments}` but `ToolCallContent` uses `{toolCallId, toolName, input}`. `normalizeToolCalls()` in `lib/normalize.ts` handles this — called in both `session-reader.ts` (file load) and streaming event handling.

### Live tool execution (`tool_execution_start/update/end`)
omp announces a tool the moment it starts, streams the tool's output while it
runs, and only commits the `toolResult` message at the end. The UI must not
wait for that commit:
- `useAgentSession` keeps a `liveToolResults` map keyed by `toolCallId`
  (seeded on `tool_execution_start` with `partial: true`, refreshed on
  `tool_execution_update` — omp sends the FULL accumulated partial result per
  chunk, latest wins — and released on `_end`/the committed toolResult).
  Committed results always win over live entries (`ChatWindow` merges them), so
  a reload never shows a stale snapshot.
- `ToolCallBlock` renders a `partial` result as **running** (spinner, and
  "Running tool…" instead of the "(no output)" marker when nothing has been
  printed yet), and opens the row while it runs when the "Keep tool calls
  collapsed" setting is off — that is what that setting means. `AppShell` must
  pass `toolCallsDefaultCollapsed` into `ChatWindow`; without it the setting is
  inert (the chat then always collapses).
- `tool_execution_update` is coalesced per tool call at display rate in
  `lib/message-update-coalescer.ts` (chatty commands emit ~10-100+ frames/s).
  `message_end` drops the pending `message_update` (the committed message
  supersedes it) but must NOT drop buffered tool updates.
- Live entries are cleared on `agent_start`, terminal `agent_end`, prompt
  send/settlement failure — a tool must never leak into the next run.

### Event protocol differences vs pi
omp emits no `prompt_done` / `prompt_error` / `queue_update` /
`compaction_start` / `compaction_end` events. Completion is `agent_end`
(`isTerminal !== false`), errors surface as failed RPC responses plus `notice`
events, and the queue length comes from `get_state.queuedMessageCount`.
New frame types (`turn_start/end`, `notice`, `todo_reminder`, ...) must be
handled or safely ignored.

### Running state SSE + reconciliation
- The sidebar listens to `/api/agent/running/events`, backed by `subscribeRunningSessions()` in `lib/rpc-manager.ts`, so running badges update without polling.
- `useAgentSession` still treats per-session SSE as primary for chat events, but while a run is active it periodically calls `GET /api/agent/[id]` and also reconciles on `visibilitychange`/`online`. This fixes missed `agent_end` events from background tabs or half-open connections.
- Prompt runs use a monotonic run id; late SSE or slow reconciliation responses from an old run must be ignored so they cannot resurrect stale streaming bubbles.

### Composer-attached panels (`components/ComposerPanels.tsx`)
- The live todo plan (`TodoList`) and the subagent roster live **pinned above
  the chat input**, not inside the scrollable message list. `ComposerPanels`
  renders both, each independently collapsible via its header row (`chevron`);
  panels start collapsed (headers always show live progress / running-summary).
  Subagent chips carry live state (pulsing dot while `started`, check/alert/ban
  for terminal states) fed by the same `subagent_lifecycle`/`subagent_progress`
  SSE frames; clicking a chip opens the transcript dialog. `TodoList` keeps a
  non-collapsible default (`collapsible` prop) for SSR tests.

### Subagent integration (`lib/subagent-types.ts`, `lib/subagent-history.ts`)
- **Live detail**: `subagent_progress` frames carry the full `AgentProgress`
  object — `lib/subagent-types.ts` parses it defensively into
  `SubagentInfo.progress` (current tool/intent, tokens, cost, context
  gauge, resolved model, retry state, detached flag, agentSource). The
  composer chips surface the current activity + telemetry line; retry
  (`⟳ retrying N/M`) takes precedence over the tool line. `subagent_event`
  frames also feed a bounded per-subagent activity buffer shown in the
  transcript dialog.
- **Roster hydration**: `get_subagents` snapshots (which carry progress)
  rehydrate the roster after SSE reconnect (`refreshSubagentRoster`, wired
  into mount, send, and the reconcile poll). Terminal subagents vanish from
  the RPC registry — history fills that gap.
- **On-disk history** (`lib/subagent-history.ts`, `/api/sessions/[id]/subagents*`):
  omp persists each subagent's transcript to the parent session's sibling
  artifacts dir (`<session-dir>/<subagent-id>.jsonl`) and the parent file's
  task toolResults keep `progress[]`/`results[]` snapshots. omp-web recovers
  the roster from disk (`extractSubagentHistory`, result fields win over the
  mid-run snapshot), so past/finished runs show in the composer panel after a
  reload. The transcript route pages the sibling file byte-wise (mirroring
  `get_subagent_messages`, which is RPC-registry-gated and refuses files it
  doesn't know). The dialog reads only the final output — `<id>.md` via
  `?mode=completion` (bounded tail read that also works for transcripts
  beyond the 16MB paging cap) with a live `get_subagents` snapshot fallback
  for header enrichment; it never pages the raw transcript. Subagent ids are
  `[A-Za-z0-9_-]{1,80}` — the route validates before joining to confine reads
  to the sibling dir.
- **In-message task summary** (`components/MessageView.tsx` TaskResultPanel):
  the session reader allowlists a SIZE-BOUNDED subset of `task` toolResult
  details (telemetry only — no `output`/`stderr`, long text truncated to
  240 chars, `lib/session-reader.ts` `keepTaskToolResultDetails`), and
  expanded `task` tool calls render a per-subagent summary (status, agent,
  task, tokens/cost/duration/model, async marker) above the raw result text.
- **Chip extras**: agent-source labels (`user`/`project`), nested-subagent
  count (`inflightTaskDetails`/`extractedToolData.task` progress), and the
  `⤴` async marker (live `detached` flag or history `details.async`
  presence). Shared formatters live in `lib/subagent-format.ts`.

### Worktrees and project grouping
- `lib/worktree.ts` resolves linked worktree top-levels back to the main repo `projectRoot`; `listAllSessions()` attaches that to each `SessionInfo` so all worktrees for one repo are grouped together in the sidebar.
- Worktree operations are served by `/api/worktrees` and guarded by the same allowed-root rules as `/api/files`.
- New worktrees are created under `<repoRoot>-worktrees/<sanitized-branch>`. Existing branches are reused; otherwise `git worktree add -b` creates the branch.
- Removing a dirty worktree returns `409` with `{ dirty: true }` so the UI can ask before retrying with `force`.
- Sessions whose cwd points at a removed worktree are inferred back into the main project instead of becoming a phantom project row.

### Managed projects sidebar (`lib/project-registry.ts`, `/api/projects`)
- The sidebar lists **managed projects**: explicitly added directories (registered in
  `~/.omp/agent/projects.json`, written atomically as temp-file + rename) plus
  session-discovered ones — hidden entries excluded. Removing a project only
  marks it hidden (reversible via re-adding); hidden entries suppress session
  re-discovery.
- Registry paths are canonical `projectRoot`s: `POST` resolves worktrees to
  their main repo via `resolveProject`, and `resolveProject` returns the
  symlink-free on-disk form for plain directories so registered and
  session-discovered paths compare equal on Windows casing.
- `GET /api/projects` re-authorizes registered roots with `allowFileRoot()` —
  the in-memory browse allowlist does not survive restarts, and empty managed
  projects derive no root from sessions.
- The client sorts the merged list pinned-first, then by manual `sortOrder`,
  then most-recently-added (registration order), then by path for
  session-discovered projects (`lib/project-ordering.ts`); the order
  deliberately does NOT depend on session activity, so project rows never
  jump around while sessions refresh. Pinned projects render under a
  **Pinned** section label. Drag-reorder and pin/unpin go through
  `moveManagedProject` (the moved project adopts its drop target's section)
  and persist the whole list as ONE batched `PATCH /api/projects`
  (`sortOrder` + `pinned` per entry), applied optimistically first. The drag
  source lives in a ref; the re-rendering drag state is deferred one frame
  because changing layout inside `dragstart` makes Chrome abort the drag.
  Expanded project paths live
  in `localStorage` (`omp-web:expanded-projects`), defaulting to only the
  active/restored project expanded, and stale keys are pruned against the
  current project list (only after the first project fetch — an empty
  still-loading list must never wipe storage).
- Each project's session tree is capped at 5 roots with a show-more toggle;
  project rows are cards matching the session items' height/margins/accent
  treatment, and the active project's worktree selector renders directly
  below its row.

### File access allow-list
- `/api/files` is intentionally not a general filesystem browser. Allowed roots come from session cwds, their resolved project roots, `~/omp-cwd-*`, and roots explicitly added with `allowFileRoot()`.
- `/api/cwd/validate`, `/api/default-cwd`, and `/api/worktrees` call `allowFileRoot()` when they make a new location browsable.

### Session list caching — new sessions must appear immediately
- `listAllSessions()` (sidebar, command palette) is cached twice: a 30s TTL
  list cache in `lib/session-reader.ts` plus an mtime-keyed directory walk in
  `lib/omp/session-files.ts` (`listSessionFiles`).
- The walk cache keys on the **sessions root** mtime. On Windows/NTFS a new
  `.jsonl` inside an existing project subdirectory does NOT bump the root
  mtime, so the walk stays stale indefinitely.
- `invalidateSessionListCache()` (fired on `agent_end`, `session_info_update`,
  compaction, renames) must therefore ALSO clear the walk cache via
  `invalidateSessionFileListCache()` — never add a session-mutation path that
  forgets this. Regression test: `session-reader.test.mjs`.

### Chat scroll-follow
- `useAgentSession` follows the conversation: the effect depends on both
  `messages` (boundaries) and `streamState` (every token batch) and throttles
  to one `requestAnimationFrame` while a run is active (`followScrollFrameRef`).
- A manual scroll-up sets `completionScrollAllowedRef = false` and disables
  following until the next prompt; `scrollUserMsgToTop` handles the
  pending-scroll after sending.
- Programmatic smooth scrolling must respect `prefers-reduced-motion`
  (`usePrefersReducedMotion` in `hooks/usePrefersReducedMotion.ts` — also the
  only way to stop SVG SMIL animations, which CSS cannot).

### MCP configuration (`lib/omp/mcp-config.ts`, `/api/mcp`, `components/McpConfig.tsx`)
- Project MCP config resolution order: `.omp/mcp.json`, `.omp/.mcp.json`,
  `mcp.json`, `.mcp.json` at the git top level (falls back to cwd for
  non-git dirs). Server definitions support `stdio`, `http`, and `sse`;
  exactly one of `command`/`url` is required and validated before any write.
- Writes are atomic (temp file + rename), preserve unrelated top-level keys
  (`disabledServers`, `$schema`, ...), and support rename via `previousName`.
- The MCP editor shares Settings → Extensions & Skills (`SettingsTabs` id
  `"extensions"`) with built-in image generation and the Skills library.
  The category stays available without a workspace; project MCP editing and
  skill management require one. Server list rows show a config-derived status dot
  (valid+enabled / disabled / invalid) — no live-connectivity probe exists in
  the RPC protocol, so failures surface as toasts (`toast.error`) from the
  editor actions, not inline text.
- The endpoint is guarded by the same allowed-root rules as `/api/files`.

### Plugins and skills
- `/api/plugins` shells out to the user's `omp plugin` CLI (`list/install/uninstall/enable/disable/upgrade`, `--json` where available) — never the Bun-only SDK.
- The obsolete plugin settings panel, tab aliases, component and reload callback
  have been removed; the API and installed packages are unchanged. Skills live
  in the unified `extensions` settings page, not a separate `skills` tab.
- `/api/skills` uses `lib/skills-service.ts`, a pure-Node scanner mirroring omp's discovery order: project `.omp/skills` (walk-up), `~/.omp/agent/skills`, then the `.claude` / `.agent(s)` / `.codex` / `.github` compat dirs and managed skills.
- Skill toggling edits only the `disable-model-invocation` frontmatter key on the target `SKILL.md`; keep that surgical so user formatting survives.
- `/api/skills/install` shells through `npx skills add ... --agent universal`, which installs into the ecosystem-standard `.agents/skills` dirs omp reads; project installs run with the selected cwd.

### Update notifications (`/api/omp-update`, `/api/app-update`)
- Automatic in-app self-updating has been removed in favor of explicit user notifications and manual terminal commands.
- `GET /api/app-update` queries the npm registry for `@kahme247/ompweb` updates, detects the install manager (`bun` vs `npm` via `detectInstallMethod`), and returns `updateAvailable` plus the exact terminal command (e.g. `npm install -g @kahme247/ompweb` or `bun add -g @kahme247/ompweb`).
- `POST /api/omp-update` (`action: "check"`) runs `omp update --check` and returns `updateAvailable` plus `updateCommand: "omp update"`. `action: "update"` runs `omp update` through `bin/omp-web-update-worker.js` (`kind: "omp"`); the worker fails the attempt on a non-zero exit.
- `OMP_WEB_DISABLE_AUTOUPDATE` covers only omp-web's own update (npm check + app self-update); the OMP runtime check/update is never gated by it.
- omp replaces its binary by rename, so running children keep the old one. Each wrapper records `ompBinarySpawned` (`ompBinaryFingerprint()`); an idle `prompt` restarts the child first when it changed (same path as account routing, `spawnOutdated()`), so an update never kills running work.
- `POST /api/omp-update` (`action: "restart"`) restarts every active OMP session at once, running ones included.
- Notifications in `AppShell` and settings cards in `SettingsConfig` present the update notification alongside copyable terminal update commands.

### Auth and model config
- Auth flows go through RPC commands (`get_login_providers`, `login`) against the omp child process; credentials live in omp's `agent.db` (SQLite) which omp-web never touches directly.
- The Models panel reads and writes `models.yml` in the omp agent directory (`~/.omp/agent/models.yml`, `.yaml` fallback).
- API-key status endpoints must never return the raw key.

### Account choice per chat (`lib/account-routing.ts`, `/api/account-routing`)
- omp has no RPC to pick or disable an account. omp-web steers it through omp's
  own `auth.accountPolicies`, written to a content-addressed `--config` overlay in
  `<agent dir>/omp-web-overlays/` (never rewrite or delete one: omp re-reads
  overlays at task spawn). State lives in `omp-web-account-routing.json`
  (accountKeys only, no identities).
- A disabled account gets `reservePct: 100`. A session pin gives its account
  `priority: 100` and every sibling `reservePct: 100`; reserve status is what
  breaks omp's per-session stickiness, so a pin also moves a running chat over.
  Both are preferences: a blocked/exhausted account still falls back.
- omp rejects a policy matching zero or several stored accounts, and that fails
  every request for the provider. Identities come from `omp usage --json`
  metadata (`getProviderAccounts`); policies use the fewest identity fields that
  tell siblings apart, only for providers with 2+ identified accounts, and skip
  the provider when any account is ambiguous. The user's own policies for other
  providers are carried into the overlay (arrays replace across config layers).
- Policies are spawn-time. Each wrapper keeps `accountRoutingSpawned`; an idle
  `prompt` whose `accountRoutingSignature` differs restarts the child first. A
  session not yet on disk is never restarted (its id would change), so a new
  chat sends its choice with `ensure_session` (`accountPins`), saved under the
  real id once omp reports it.
- "Last used" reads the session's `credential_pin` entries and matches omp's
  `credentialPinHash` (sha256 of provider, accountId, email, orgId, projectId).

### Saved rate-limit resets (`lib/provider-usage.ts`, `components/ProviderUsageBar.tsx`)
- The usage report's `resetCredits` (Codex / Claude only) becomes
  `ProviderUsageReport.resets`: count, dated credits, `spendable`, omp's
  `reason` (Claude's `not_at_wall`: its resets only apply at the limit).
- Spending goes through `omp usage reset <provider>/<credentialId> --redact`,
  never a direct provider call: omp fences the spend against other omp
  processes and confirms it. The browser only sends the opaque `accountKey`;
  the server maps it to omp's credential id via `omp usage reset --json`
  (same account-id/email identity as the key). omp's sentence comes back as
  `{ok, message}` (stderr + exit 1 = refused/unconfirmed).
- After a spend the server runs `omp usage invalidate --provider` and bumps
  `usageGeneration` so neither omp's nor our cached snapshot shows the
  reset as unspent; the panel then calls the hook's `refresh()`.

### Composer word prediction (`hooks/useWordPrediction.ts`, `components/GhostMirror.tsx`)
- Ghost text comes from omp's `predict_word` RPC (engine = omp's
  `spelling.autocomplete` setting; omp applies the prose gates). Tab or →
  accepts; accept/typed-past outcomes go back as `predict_word_feedback`.
- Keystroke predictions never spawn or replace an omp child: the agent route
  answers `{ suffix: null }` when no process is alive, so sessions that are not
  running show no ghost text until the first send.
- Ghost text paints only when the caret ends its line (the mirror overlay would
  otherwise overlap typed text). Settings → Interface & Behavior → Word
  completion (`lib/composer-prefs.ts`, localStorage `omp-web:word-completion`):
  Auto (default) enables it only when the primary pointer is fine
  (`(pointer: fine)` — mouse/trackpad; browsers cannot detect an on-screen
  keyboard), Enabled/Disabled force it. Also skipped for
  drafts past 20k chars (omp's prose-gate cap); an omp without `predict_word`
  ("Unknown command") pauses requests for a minute.
- Ghost state lives in a small external store (`useSyncExternalStore` in
  `GhostMirror`), not ChatInput state: re-rendering the composer per ghost
  change was the dominant per-keystroke cost.

### Completion sound
- `hooks/useAudio.ts` stores the toggle in `localStorage` and reuses one `AudioContext`.
- Browser autoplay policy means sound must be unlocked from a user gesture; `ChatInput` calls the unlock hook from interactive controls, and `ChatWindow` plays the tone from `onAgentEnd`.

## omp Session File Format (v3)

Location: `~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"title","v":1,"title":"...","source":"...","updatedAt":"...","pad":"   ..."}   ← fixed 256-byte slot
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"/abs/path/to/parent.jsonl"}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"...","modelId":"...","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
```

- Line 1 is a fixed-width 256-byte padded title slot, rewritable in place.
  Old pi files may lack it — the `{"type":"session"}` header is then line 1.
- Entries form a tree via `(id, parentId)`. Additional entry types
  (`title_change`, `session_init`, `mode_change`, `ttsr_injection`, ...) must
  be tolerated by readers.
- Large payloads (images) are externalized to the content-addressed blob store
  at `~/.omp/agent/blobs` and referenced from entries.

`entryIds[]` in `SessionContext` is a parallel array to `messages[]` — maps each displayed message back to its `.jsonl` entry id, used for fork and navigate_tree calls.

---

## Design Tokens & UI Kit (`app/globals.css`, `components/ui/`)

Warm-paper (light) / warm-ember (dark) palettes; every text/background pair is
WCAG AA-verified (measured ratios noted in `globals.css` comments). Components
must consume these variables — no hardcoded colors.

```
color:  --bg --bg-panel --bg-hover --bg-selected --border --bg-subtle
        --text --text-muted --text-dim
        --accent --accent-strong --accent-hover   (links / filled buttons / hover)
        --user-bg --tool-bg
type:   --font-serif (display headings, class .display-serif)  --font-mono
shape:  --radius-control (8) --radius-card (12) --radius-modal (16)
depth:  --shadow-card --shadow-pop --shadow-modal
motion: --dur-fast (150ms) --dur-med (220ms) --dur-slow (320ms) --ease-out-warm
```

`components/ui/` holds the shared primitives (built on `@base-ui/react`):
`primitives.tsx` (Dialog/Tooltip/Collapsible), `field.tsx` (form fields +
ConfirmDialog), `toast.tsx` (`toast.success/error/info`, mounted in AppShell).
Icons come from `lucide-react` — do not add new inline SVGs. The command
palette (`components/CommandPalette.tsx`, ⌘K/Ctrl+K) is built on `cmdk`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
