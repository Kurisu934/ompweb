# ompweb

[![npm version](https://img.shields.io/npm/v/@kahme247/ompweb.svg?logo=npm&color=e05d44)](https://www.npmjs.com/package/@kahme247/ompweb)
[![node version](https://img.shields.io/node/v/@kahme247/ompweb.svg?logo=node.js&color=44cc11)](https://nodejs.org)
[![license](https://img.shields.io/github/license/kahme247/ompweb.svg?color=44cc11)](./LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/@kahme247/ompweb.svg?color=44cc11)](https://www.npmjs.com/package/@kahme247/ompweb)
[![GitHub stars](https://img.shields.io/github/stars/kahme247/ompweb.svg?logo=github)](https://github.com/kahme247/ompweb/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/kahme247/ompweb/pulls)

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Community: [Join the OMPWEB Discord](https://discord.gg/evqgGzRfM5)

A clean, modern web UI for the [oh-my-pi (omp)](https://github.com/can1357/oh-my-pi) coding agent. It reads your local omp sessions and gives you a browser workspace to chat with the agent, browse projects, manage settings, and preview files.

## This Fork

[hsiatein/ompweb](https://github.com/hsiatein/ompweb) builds on
[kahme247/ompweb](https://github.com/kahme247/ompweb). The inventory below covers
this fork's additions and behavior changes relative to the merged upstream
baseline [`e822c7f`](https://github.com/kahme247/ompweb/commit/e822c7f), including
the current source changes. Related fixes are grouped into **53 entries across
six areas**; these are feature groups, not a count of commits or files.
Upstream features are credited separately below.

The npm badges above refer to the **upstream package**, not a separate release
of this fork. Install from source to get these changes.

### Files, Terminal and Notes

| Addition / change | Behavior and limits |
| --- | --- |
| Text editing | Edit and explicitly save regular UTF-8 files up to 256 KiB in authorized workspaces. Drafts survive tab/settings switches; dirty tabs and navigation warnings protect unsaved work. Atomic saves preserve normal permissions and LF/CRLF line endings; revision checks reject external-edit conflicts. Drafts are in-memory, not autosaved. |
| Explorer file management | Create files/folders, rename and permanently delete entries through root buttons and row menus, including on mobile. Renames update open tabs; folder deletion is recursive and confirmed. Dirty affected editors block rename/delete; workspace roots, symlinks, special files and chat-only external references are protected from mutation. |
| Reply and activity files/images | Resolve filesystem paths, `file://`, parent-relative Markdown links and persisted `artifact://` references using the originating session. Activity links resolve relative tool paths against that session's workspace, strip trailing read selectors and preserve Windows drives and literal filename punctuation; internal tool URIs remain plain text. Fix `xd://open_file` path/result handling and cross-session file context. Failed images show access/size errors; external references grant session-scoped access to the exact file, preserving directory and editing restrictions. |
| Agent file-opening approval | **Settings → Interface & Behavior → Allow background sessions to open files in the side panel**, next to **Automatically open web links in the browser**, lets background sessions open authorized files directly, leaving Settings if necessary. Off by default and saved per browser; file access, editing permissions and URL approvals are unchanged. |
| Integrated terminal | Real PTY shells in the right panel, multiple tabs, colors, full-screen programs, resizing and output replay. Shared across browser tabs and preserved on page reload; terminated when closed or the server stops. Optional `node-pty` requires a working native build toolchain. |
| Context menus | Workspace, session, Explorer, file-tab, message and code-block actions; selected text can be copied or quoted into the composer. Includes opening folders in the terminal, downloading files and copying paths. Shift+right-click, touch long-press, text fields, media, web links and the terminal screen keep the native browser menu. |
| Memos | Server-persisted notes with autosave, search, pinning, Markdown preview/export, draft recovery and revision-conflict handling. Default toggle: `Insert`. Shared by authorized clients, not automatically included in model prompts. See [Memos](docs/memos.md). |

### Conversations, Scheduling and Authorization

| Addition / change | Behavior and limits |
| --- | --- |
| Send later | Schedule text into an existing session using presets, a date/time or the current model's reported 5-hour quota reset plus one minute. Server-side storage survives page closure/restarts; overdue messages send on startup. Send now, cancel and explicit retry are available; at most 30 days ahead. |
| Scheduled tasks | Once, interval, daily or weekly prompts into an existing session or a fresh session per run. Supports pause/edit/delete/run-now, run history, model/thinking/advisor choices for new sessions, retention archival and run time limits. Default new-session retention is 10 runs and timeout is 60 minutes. |
| Webhook triggers | Tasks can expose `POST /api/hooks/<token>` with URL rotation and optional external request-body context, truncated to 16,000 characters. **The URL is the credential** and bypasses the web login; protect it like a password. |
| Agent-created wake-ups | The server-hosted `scheduled_tasks` tool lets an agent create/list/cancel its own timed tasks or a one-use wake-up URL, including for a job running separately in tmux. At most 10 agent tasks per session; unused URLs expire after 7 days by default, at most 30. One-shot tasks are removed after delivery. |
| Native queue reuse | Timed, webhook and manual triggers deliver `prompt` when idle and native `follow_up` when busy, rather than skipping busy sessions or overlapping deliveries. New-session tasks start independently. There is no second persistent scheduler queue. |
| Needs-you attention center | A sidebar bell aggregates questions, confirmations, text inputs, links and sudo prompts across sessions; entries jump to the waiting session. Includes a tab-title count, a closed-sidebar indicator and background OS notifications when permission was already granted. Attached question cards fold to a single header: click the whole header or use Enter/Space to reclaim conversation space, with choices and text drafts preserved. A new request opens automatically. |
| Browser sudo authorization | Linux agent commands use the web askpass dialog, which shows a verified sudo command line. Passwords are not sent to the model, stored or logged; no listening tab means immediate refusal, and requests expire after four minutes. A startup system-prompt **soft rule** forbids desktop askpass/password-channel fallbacks, including from old conversation history. This is not an OS sandbox. |
| Message editing and steering fixes | Editing a sent user message forks before it and restores its text as a draft, preserving the original session instead of merely changing the displayed branch. Mobile Send honors the steer/follow-up setting; promoting a queued follow-up to Steer actually moves it in OMP (requires OMP 18.4+; queued attachments are not carried over). |
| Collapsible background results | `async-result` starts as a short preview. Click anywhere on the notice header to expand or collapse repeatedly; Enter and Space work while the header is focused. The chevron indicates state. Expanded output preserves line breaks and indentation, and Copy retains the complete output. Other custom notices start expanded. |

**Long-job lifecycle:** obtain the wake-up URL, run the job separately (for
example in tmux), POST its result on completion, and let the same session resume.
The browser and the session's idle OMP process need not stay open, but **ompweb
must be running and reachable when the callback arrives**. A webhook cannot
start a stopped web server. Generated URLs target the configured local server;
remote workers need a deliberately reachable, secured address.

Schedules use the **server's time zone**. Missed timed runs collapse into one
catch-up run after restart, not an unlimited backlog. A run marked `started`
means delivery was accepted, not that queued work finished. Run-time watchdogs
are in-memory and do not survive restart. Use only one ompweb scheduler per
agent directory to avoid duplicate deliveries.

### Usage and Model Telemetry

| Addition / change | Behavior and limits |
| --- | --- |
| Quota pools and Hyper credits | Preserve independent provider quota pools, such as Antigravity's model groups, instead of merging equal-duration windows. Show Charm Hyper remaining credits; an unknown total is explicitly a **250-credit reference estimate**, not a verified subscription limit. |
| Usage refresh | One-minute server cache and client refresh instead of five-minute snapshots; pause polling while hidden/offline, refresh when due on return, avoid overlapping requests and retain the last snapshot on transient failures. |
| Generation-speed history | A clickable, color-coded speed display opens the last 20/50/100 requests with mean, aggregate rate, median, P10/P90, extrema, standard deviation, TTFT, decode speed and token totals. The topbar's 32-request average is reconstructed from OMP's actual output/duration fields after reload, not timestamp gaps. |
| Fast-mode availability | Honor model-declared service tiers and expose Fast for supported ChatGPT/Codex-subscription GPT models and Google Vertex, in addition to previously supported providers. |
| First-run model/login setup | Utility/login RPCs can bootstrap the provider catalog when OMP exits with `No models available.`, without creating credentials or sending prompts. This does not override chat model choices or mask unrelated startup failures. See [first-run behavior](docs/CUSTOMIZATIONS.md#first-run-provider-setup). |

### Navigation, Input and Settings

| Addition / change | Behavior and limits |
| --- | --- |
| Scoped custom instructions | Settings → Agents & Policies → Instructions manages global, provider and provider/model prompts. **Model > provider > global**, without concatenation; empty rules suppress inheritance and deleting restores it. Saved server-side and selected when ordinary or queued messages start, preserving native/project instructions. Linked dropdowns select existing providers and their available models; controls share the wallpaper glass material. Includes an effective-rule preview. [Details](docs/CUSTOMIZATIONS.md#scoped-custom-instructions). |
| Configurable shortcuts | **Settings → Interface & Behavior → Keyboard Shortcuts** manages all 21 app shortcut actions: search, record, remove, clear, reset and conflict hints, with immediate per-browser persistence and cross-tab synchronization. Horizontal tabs separate **Interface layout** (tool-call collapse and sidebar usage visibility), **Interaction behavior** (selection, opening, sound/speech and submission), and **Keyboard Shortcuts**; search opens the matching panel. **Stop agent is unbound by default; Esc no longer aborts tasks.** Dialog dismissal, normal editing and terminal applications keep their native behavior. |
| Alt dictation | Press and release Alt alone to start or finish dictation into the composer; Alt chords, IME, other editors and open dialogs are excluded. The binding is configurable. Startup cancellation, stale transcription responses, preview cleanup and input-focus recovery are handled. The recording deck and browser TTS themselves come from upstream. |
| Pinned workspaces | A separate Pinned section, optimistic drag ordering, cross-section pin/unpin drop targets and section-local move-up/down actions. Order and pin state are saved together and do not jump with session activity. |
| Session filters | Combine running/unread/unexpected-exit statuses with recent activity (24 hours or 7 days), per-filter counts, removable chips and reset. This is filtering, **not full-text transcript search**. |
| Directory picker | Create folders in place; save shared favorite directories; jump to a favorite without auto-selecting it. Profile, advisor and extra launch arguments live in a collapsible options panel. |
| New-chat navigation and first send | Clicking a workspace consistently opens its new-chat page, even from an existing chat in that workspace. New-chat and add-workspace entry points remain reachable in the responsive topbar; width calculations account for interface scaling. Sessions allocated before their first transcript can establish an RPC-verified empty prompt boundary without hiding genuinely missing history. |
| Settings organization | **Extensions & Skills** (`extensions`) combines built-in image generation, MCP servers, and the Skills library. Search jumps to the relevant section; project MCP editing and skill management require a workspace, but the category remains accessible without one. Remove obsolete plugin UI branches, aliases, and reload callbacks without changing installed plugins or the backend API. Rapid native-setting edits no longer mix unrelated fields. English, Simplified Chinese, and Japanese labels are included. |
| Appearance & Personalization | One `appearance` category with provider-style horizontal tabs: **Theme & Display**, **Wallpapers & Glass**, **Pets**, and **Motion**. Theme, chat font size and interface scale live together; whale-tail animation moves out of General. Search and wallpaper/pet shortcuts open the matching subtab. Existing browser preferences and asset libraries are preserved. |
| Models & Providers | One `providers` category combines connected accounts, custom providers, model registry, and five global defaults in horizontal tabs. Reasoning, verbosity, personality, thinking visibility and external scratchpad keep automatic native-settings saves; registry editing retains its own save controls and unsaved drafts across subtab switches. Search opens the relevant defaults panel. |
| Agents & Policies | One `agents` category with separate **Instructions**, **Subagents**, **Runtime policies**, and **Tool approvals** tabs. All 13 compaction/memory/autolearn/retry settings and the three approval controls retain their native persistence. Instruction and subagent editors retain independent drafts across subtab switches; search opens the matching panel. |

### Wallpapers, Glass and Companions

| Addition / change | Behavior and limits |
| --- | --- |
| Local media wallpapers | Original image/video delivery, streamed uploads, server folders and Steam library discovery; playback, mute, volume, brightness, fit and draggable crop positioning. Large media can be read in place; source assets are not rewritten. |
| Wallpaper library filters and sorting | Combine title search, wallpaper type and orientation; sort naturally by name, added time or modified time in either direction. Auto initially selects landscape on desktop and portrait on mobile, with explicit landscape/portrait/square/unknown/all overrides. Choices persist per browser. |
| Sandboxed web wallpapers | Local HTML/CSS/JavaScript projects and installed-base presets run in isolated iframes with scoped resource URLs, blocked external networking and property/media callbacks. Application wallpapers are not executed; native plugin APIs are not emulated. |
| Browser-native scenes | Three.js/WebGL renders supported Wallpaper Engine scenes on the **client GPU**, without desktop capture or frame streaming. Includes supported effect passes, textures, particles/trails, parallax, text/fonts, parenting, selected mesh/bone animation, original audio, audio-reactive effects and bounded QuickJS SceneScript. Compatibility is partial. |
| Scene compatibility and spring bones | Decode supported MDLV0019/0023 static/skinned meshes and apply authored damped-spring bone physics, drag/release motion, impulses and resets. Support the two Aemeath scene formats; inherited parallax anchors keep eyes aligned with the face while preserving eye animation/effects. Native IK and pixel-identical physics remain outside the compatibility contract. |
| Scene loading and caches | Server-persistent converted resources plus browser IndexedDB caches for images, fonts, used videos and native audio; lazy media loading, bounded concurrency, original-media range streaming, hidden-tab pause and GPU-resource disposal. Cache invalidation follows source changes; HTTP LAN use is supported. Script timeout handling retains validated visual state and reports compatibility limits. |
| Custom background music | Import audio or a video's first audio track to replace the wallpaper soundtrack; cached extraction is reused. Shared volume/mute/pause and scene audio analysis use the replacement track. Requires server-side FFmpeg/ffprobe; system/tab audio sharing is opt-in and subject to browser permissions. |
| Glass workspace | Per-message/per-control glass, clear and full-frosted modes with opacity control across chat, code, tables, tools, thinking, status, usage, composer, files, terminal and system cards. All form dropdowns—including the new-session workspace picker and Settings—use shared glass triggers and portaled option lists, with keyboard navigation and Escape dismissal; scheduled paths retain free-form autocomplete. Fix glass on directory/extension dialogs and syntax readability; disabling wallpapers restores normal surfaces. |
| Wallpaper-derived colors | Material Color Utilities samples the visible crop in a browser Worker to coordinate accents, selections, borders and progress. Ordinary text uses one fixed, automatic black/white or Material-derived color; semantic colors remain distinct. Sampling stays local, and readability over arbitrary moving backgrounds is not guaranteed. |
| Animated pets | Discover/import Codex v1/v2 raster spritesheets; preview, resize, reposition, follow the pointer and reflect the active chat's activity. Hidden-tab/reduced-motion handling, no extra model calls and no bundled artwork. See [Pets](docs/PETS.md). |
| Whale-tail status animation | Running/thinking indicators use a configurable whale tail with five motion choices and live previews. Reduced-motion preferences and Safari use a still tail. |

### Runtime Policy, Deployment and Security

| Addition / change | Behavior and limits |
| --- | --- |
| Enforced single-agent policy | Every OMP process launch validates and appends the single-agent overlay, blocking built-in task/batch/eval/workpool subagent creation while preserving normal main-agent tools and historical subagent viewing. It is an OMP tool policy, **not an OS sandbox** against subprocesses or external APIs. See [policy details](docs/CUSTOMIZATIONS.md#single-agent-policy). |
| Image generation defaults | Enable OMP's `generate_image` for web sessions unless user/project configuration explicitly overrides it. A settings switch persists the native option for subsequent starts/restarts; an image-capable provider/account is still required. |
| System dashboard and memory guard | Linux memory/swap/CPU/load and per-session/terminal process usage, stop controls and action history. The configurable guard defaults to 15% warning / 6% action, signals large agent/terminal descendants and notifies the affected chat/terminal. It does not kill the server or unrelated processes and cannot guarantee prevention of kernel OOM kills. |
| OOM isolation | Agent processes and terminal shells get higher kernel OOM scores; generated systemd units use `OOMPolicy=continue` so one OOM-killed command does not automatically stop the entire service. This is separate from OMP's own memory protection. |
| Quieter, safer OMP updates | Background checks update the settings badge instead of interrupting startup/return with prompts; when update checks are enabled, failures retain their reason and checks allow 45 seconds. Setting `OMP_WEB_DISABLE_AUTOUPDATE` disables BOTH web and runtime check/apply without update network calls (`updatesDisabled` / `updates_disabled`). When updates are enabled, updating the binary leaves active runs alone; idle sessions restart onto it before their next prompt. Explicit Restart OMP sessions still interrupts all sessions. |
| Staged Linux deployment | [Deployment script](scripts/deploy-linux-service.sh) builds a separate staging copy while the service runs, reuses matching dependencies/build cache, fingerprints the source, preserves live environment settings and retains backups. `switch` reuses a matching stage or builds first, then restarts the service; it is not zero-downtime deployment. |
| Publication hygiene | Local credentials, sessions, databases, private notes, artwork and diagnostic captures stay out of the repository. |

**Compatibility and trust:** this is not a complete or pixel-identical Wallpaper
Engine replacement. Unsupported effects, formats and scripting APIs, client GPU
limits and browser media policies still apply. Authorized web users can run
shells and manage shared server state; this is not a multi-user isolation system.
Wallpaper Engine, Steam artwork, Codex assets, credentials and ASR weights are
**not bundled**. Browser sudo applies to OMP children launched by this web
server, not arbitrary desktop/terminal clients.

Details: [wallpaper compatibility and cache limits](docs/local-wallpapers.md),
[pet controls](docs/PETS.md), [memos](docs/memos.md),
[deployment, policy and privacy](docs/CUSTOMIZATIONS.md), [change history](CHANGELOG.md).

### Showcase

Actual browser captures of this fork using **fictional conversations, a demo
account and original procedural artwork**. These show image-wallpaper mode,
not a claim of full scene compatibility.

![Glass chat, wallpaper colors and a demo credit balance](docs/showcase/workspace.png)

<details>
<summary>Wallpaper colors, text modes and crop settings</summary>

![Wallpaper settings with Material colors and crop positioning](docs/showcase/wallpaper-settings.png)

</details>

<details>
<summary>Mobile workspace</summary>

<img src="docs/showcase/mobile.png" alt="Mobile glass chat with responsive controls" width="360" />

</details>

[Capture method and asset provenance](docs/showcase/README.md).

### Latest Upstream Sync

Integrated through [`7a3f76c`](https://github.com/kahme247/ompweb/commit/7a3f76c)
on 2026-10-11: native multi-question Ask, notifications,
`/btw`, Slow mode, in-run attachments and session recovery. Local wallpapers,
glass, pets, running-session shortcuts, immediate Steer / Queue and Rewind
semantics remain intact. Desktop/Web Ask uses the native dialog, independently
of Telegram. Cross-session host tools share the global event stream so two
HTTP/1.1 chat tabs do not exhaust all connections and block dialog submissions.
Source integration does not rebuild or restart an existing deployment.
Merged through [`e822c7f`](https://github.com/kahme247/ompweb/commit/e822c7f).
Retained **upstream** features include opt-in resume after a server restart,
batched ask dialogs, cross-session host-tool handling and link confirmations,
collapsible long user messages, message copy/scoped selection, GitHub references,
the voice recording deck and browser-native reply read-aloud. These are not
claimed as fork inventions. The fork extends their integration as listed above.

![Upstream voice recording deck integrated with the glass composer](docs/showcase/dictation.png)

Dictation uses the existing OpenAI-compatible transcription endpoint. A local
Qwen3-ASR server can be connected if it exposes that protocol; configure
`OMP_WEB_STT_ENDPOINT`, `OMP_WEB_STT_MODEL` and, when required, `OMP_WEB_STT_KEY`
on the server. The ASR service must run separately. Microphone capture requires
localhost or HTTPS and browser permission. Read-aloud uses browser/OS voices,
not the ASR model; voice availability varies by device.

<details>
<summary>Original upstream demo and screenshots (light / dark)</summary>

![ompweb upstream live session demo](docs/demo.gif)

![ompweb — light theme](docs/screenshot-light.png)

![ompweb — dark theme](docs/screenshot-dark.png)

</details>

## Requirements

- [omp](https://github.com/can1357/oh-my-pi) installed and available on your `PATH` (or specified via `OMP_WEB_OMP_BIN`)
- Node.js `>= 22.19.0`

**Steer = Send now**: interrupt the current turn and send the new message immediately in the same session using `abort_and_prompt`. Only **Queue** waits for completion. Existing saved Send now/Steer preferences both select this immediate action. Queue items expose **Edit** and **Delete**, not cooperative promotion under the Steer label; use Edit, then explicitly Steer if needed.

Queue **Delete** and **Edit** additionally require `remove_queued_message`. Deletion is confirmed by OMP before the chip disappears; editing recalls text only after cancellation succeeds. Unsupported runtimes or messages that are no longer pending leave the queue unchanged and display a notice.

The queue panel shows omp's own queue (`queuedMessages` in `get_state` and `queue_update` events, omp 18.4.4 or later), so every device viewing a session sees the same queued messages. **Stop** moves the text of messages still waiting in the queue back into the composer instead of letting the agent run them; a steer the model already picked up through live steering still runs. Older omp runtimes show no queue panel, and Stop cannot take queued messages back.

If delivery cannot be confirmed (for example, the HTTP response is lost), each submitted message is retained separately in the composer warning. It is not automatically retried or merged into your next draft. Check the native queue/history before restoring or dismissing it. Restore requires an empty composer. Text survives reload in the same tab when storage is available; images remain in memory, with the unsent-content exit warning.

## Attach a desktop OMP process

Load the standalone extension in the **original terminal OMP process**:

```bash
omp -e /absolute/path/to/ompweb/extensions/desktop-bridge.ts
```

For automatic loading, symlink that file into
`${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}/extensions/omp-web-desktop.ts`
(or configure it as an OMP extension). Load it only once. In an existing terminal
session, use OMP's `/reload` after installation; do not resume its journal in a
second process. The bridge was verified against OMP **18.10.1**.

OMP and Web must share `PI_CODING_AGENT_DIR` (default `~/.omp/agent`). The extension
publishes private, authenticated `omp-web-desktop/v1` metadata under
`web-desktop-sessions`; Web discovers active owners even before opening their
sessions. Input, streaming output and state stay in the original PID and journal.
Closing Web or restarting its service only disconnects the bridge.

The bridge intercepts the existing **native Ask dialog**; it does not register a
replacement tool. Local and Web forms share validated, first-answer-wins
arbitration, dismiss the losing form, replay pending questions on reconnect and
clean up on cancellation/abort. The native dialog retains its timeout behavior.
No Telegram plugin, Telegram state, wake lock or Ask-protocol environment flag is
required; Telegram's separate namespace/protocol is neither read nor modified.

Attached sessions accept ordinary input, Queue and Stop. Steer/Send now requires
atomic interrupt-and-replace support that this desktop bridge does not provide;
the request is rejected and the draft retained. Stop aborts the turn but cannot
withdraw the desktop queue, and displays that limitation. Run shell/slash
commands, rename, fork and reload in the original terminal. Web rejects
archive/delete rather than taking ownership of the external process.

Before resuming a historical journal, Web checks the native OMP ownership lease
using the installed runtime's native addon in a bounded Node helper. An active
owner without attach metadata, or an inspection failure, blocks resume. Canonical
paths share startup coordination, session-ID moves retain aliases, and Web resume
reservations stay held for the child lifetime. This is not an atomic handoff:
OMP claims its native lease on first write, so an external terminal acquiring it
between preflight and that write can still trigger native fork-on-collision.

### Native extension tools (including `telegram_send_file`)

An optional file-only Telegram extension can register `telegram_send_file` with
OMP's native `registerTool` API. It is an ordinary agent tool, **not** a browser
host tool: do not add it to `set_host_tools` or send `host_tool_call` frames.
No Web runtime change, Telegram package, private Telegram socket/state protocol
or Ask override is needed.

Load the file extension in the process that actually executes the tool: the
Web-owned `omp --mode rpc-ui` child for a Web-owned session, or the **original
terminal process** for an attached session. Installing it in Web alone cannot
add a tool to an already-running desktop owner; use the terminal's `/reload`
after installation. OMP's active tool selection must allow the registered tool.
The extension owns its private bot/chat/topic configuration and file upload;
Web does not need credentials or a new send endpoint. Its input is
`{ path: string, caption?: string }`, with a local regular-file path resolved
against that executing session's working directory and an optional plain-text
caption (at most 1,024 characters). The destination is configured by the
extension, not selected by a Web request.

Return native `{ content: [{ type: "text", text: "..." }], details?: ... }`
results, with readable success/error text in `content`, not only in `details`.
The file tool's success details are
`{ messageId: number, chatId: string, messageThreadId?: number, fileName: string, bytes: number }`;
failures use native `isError: true` and credential-free text. Let OMP publish the
normal `tool_execution_start`, optional `tool_execution_update`,
`tool_execution_end` and persisted `toolResult` messages with the same
`toolCallId`; do not emit a Telegram-specific event or synthesize these frames
inside the extension. Both Web's RPC transport and the desktop bridge forward
these native events. The generic tool card displays their text/error status,
and history/reconnect uses the original journal's committed `toolResult`.
Native Ask arbitration and ownership protections remain unchanged.

## App installation behind authentication

To install the web app, sign in first and use your browser's installation menu.
The single manifest link requests `/api/manifest` with credentials; that endpoint
uses the existing web-password guard and private, revalidating caching. Its
192×192 and 512×512 PNG icons are embedded from the packaged assets because
Android's native installer fetches ordinary icon URLs without authentication
cookies. The app still launches at `/` with scope `/`.

Keep Cloudflare Access and application authentication enabled; no public
manifest exception or Access bypass rule is needed. This does not add offline
support. Local Chromium verification covered cookie-gated metadata with HTTP
icon URLs blocked (zero installability errors). The owner also confirmed that
installation on a physical phone works as expected behind Cloudflare Access.

Skill startup notices require an OMP runtime with `get_skill_diagnostics`,
`set_skill_startup_diagnostics`, and `skill_diagnostics_update`. Conflicts and
redundant installations appear above the composer when its OMP session starts;
an empty new-chat page does not start OMP just for diagnostics. **Details** shows
the resolved default, variants, identical copies, backing paths, sources, and
selection reason. The **×** button dismisses the notice for that session until
the diagnostic report changes. **Turn off** and **Settings →
Interface & Behavior → Skill startup notices** use OMP's persisted
`skills.showStartupDiagnostics` preference, not a separate browser setting.
**Settings → Extensions & Tools → Skills → View skill diagnostics** remains
available for a selected running session when notices are off. Inspection does
not resume stopped sessions. Missing support or no running session is unavailable,
not a clean result.

## Notifications

Turn on notifications in **Settings → Notifications**. Each browser keeps its own
settings: which events notify (task finished, waiting for input, run failed,
model switched automatically) and what happens while you use omp-web in another
tab (an in-app toast, or always a system notification). Nothing is shown for the
session you are viewing. Clicking a notification opens its session.

- **Push** reaches the browser even when no omp-web tab is open. It needs a
  secure context (HTTPS through your reverse proxy, or `localhost`), and the
  omp-web server needs outbound HTTPS access to the browser vendors' push
  services. omp-web generates its push (VAPID) keys on first use and stores them
  with the device list in `~/.omp/agent/omp-web/notifications.json` (mode 0600).
- On **iPhone and iPad** (iOS 16.4 or later), push works only in the app added
  to the Home Screen.
- In a secure context without push support, system notifications appear while
  an omp-web tab is open. Over plain HTTP on a non-localhost address, browsers
  allow no system notifications: only the in-app toasts shown while you use
  omp-web remain.
- Desktop browsers show notifications through the operating system's
  notification center. Push delivery needs the browser process running.

Completion notifications use omp's `prompt_result` and `session_settled` RPC
frames (omp 18.3.1 or later).

## Quick Start

**Install this fork from source:**

```bash
git clone https://github.com/hsiatein/ompweb.git
cd ompweb
npm ci
npm run build
node bin/omp-web.js --no-open
```

OMP must be installed separately on the same server (or in the same container)
and its agent directory persisted separately from this checkout. Keep private
settings in environment variables or an ignored `.env.local`; do not commit them.
Use a separate checkout for builds while an existing instance is serving tasks.

Open [http://127.0.0.1:30177](http://127.0.0.1:30177). For the CLI examples below,
replace `ompweb` with `node bin/omp-web.js` when running from source. The explicit
`npx @kahme247/ompweb` service recipes install **upstream**, not this fork.

### Stage and Switch an Existing Linux Installation

For an already configured installation with `app/` and exactly one
`runtime/node-*/bin/node` under `~/.local/share/ompweb`:

```bash
scripts/deploy-linux-service.sh          # stage only; do not restart the service
# After agent work has finished:
scripts/deploy-linux-service.sh switch   # reuse a matching stage, or build first
```

This is an update helper, not a fresh systemd installer. It copies tracked and
unignored working-tree files, including uncommitted changes. The live
`.env.local` and service environment are preserved. Source/environment changes
after staging require a fresh build, so pre-staging only makes `switch` fast
when its fingerprint still matches. Switching stops managed agents and
integrated terminals. It retains two backups by default and prints a rollback
command. Overrides: `OMPWEB_INSTALL_ROOT`, `OMPWEB_SERVICE`,
`OMPWEB_KEEP_BACKUPS`. Do not run it against an active development `.next`.

<details>
<summary>Install upstream instead (without the fork additions)</summary>

**Run directly without installing:**

```bash
npx @kahme247/ompweb@latest
```

or
```bash
nix run github:kahme247/ompweb
```

**Or install globally:**

```bash
npm install -g @kahme247/ompweb
ompweb
```

Open [http://127.0.0.1:30177](http://127.0.0.1:30177) in your browser.

</details>

### CLI Options

```bash
ompweb --port 8080                         # Custom port
ompweb --hostname 0.0.0.0                  # Listen on network
ompweb hash-password                       # Print the value for OMP_WEB_PASSWORD_HASH
ompweb --no-open                           # Don't auto-open the browser
ompweb --install-tray                      # Install Windows System Tray service & Desktop shortcuts
ompweb --uninstall-tray                    # Uninstall Windows System Tray service & shortcuts
ompweb --tray                              # Start background System Tray manager
ompweb systemd install                     # Install Linux systemd user service
ompweb --help                              # Show help
ompweb --version                           # Show version
```

### Password protection

omp-web **never passes a plaintext password to the server**, because every
`omp` session inherits the server's environment: an agent running `env` would
print the password into its session file and send it to the model provider.
`--password` stops `ompweb` at startup. An `OMP_WEB_PASSWORD` still works for
now: `ompweb` hashes it at startup, keeps it out of the server's environment,
and logs a warning with the hash to put in `OMP_WEB_PASSWORD_HASH` instead.
Switch soon: agents can still read the plaintext from the `ompweb` launcher
process, and each start makes a new hash, so every restart signs all browsers
out. Setting both variables stops `ompweb`; remove `OMP_WEB_PASSWORD`.

Generate a hash instead and give that to the server:

```bash
ompweb hash-password                       # asks twice, input hidden
echo "a-long-random-password" | ompweb hash-password   # or pipe it in

OMP_WEB_PASSWORD_HASH='scrypt$15$8$1$…' ompweb
```

`ompweb hash-password` reads the password from stdin — never from a command
line argument — so it stays out of your shell history and out of `ps` output.
The hash is scrypt (N = 2^15, r = 8, p = 1) with a fresh 16-byte salt, printed
in the self-describing form `scrypt$<ln>$<r>$<p>$<salt>$<digest>`. Anyone who
reads the hash cannot sign in with it, and it cannot be turned back into the
password.

Sessions are not signed with the password hash. A random signing key is created
on first start in `~/.omp/agent/omp-web/web-auth-secret.json` (mode `0600`) and
mixed with the hash, so changing the password still signs everyone out while the
stored hash alone is never enough to forge a session.

The service installers (`ompweb systemd install`, `ompweb-launchd install`, the
Linux tray, and the Windows service) still accept `OMP_WEB_PASSWORD` at install
time and hash it before writing it to their configuration. Only the hash is
stored.

On Windows, the tray and background service read `OMP_WEB_PASSWORD_HASH` from
your user or system environment (for example `setx OMP_WEB_PASSWORD_HASH
"scrypt$…"`) each time they start the server, not from the environment they were
started with. Changing or removing the hash takes effect at the next server
restart, without signing out of Windows.

### Run as a Windows Service (System Tray)

Install ompweb as a Windows background service with a system tray icon and autostart at login:

```bash
ompweb --install-tray
```

Manage it from **Settings → System & Updates → Windows Background Service**, or via CLI:

```bash
ompweb --tray          # Start the tray manager
ompweb --uninstall-tray
```

Shortcuts are created on the Desktop and Start Menu. The service restarts automatically and shows the current port and status in the tray.

### Run as a macOS Service (launchd)

Install ompweb as a launchd user agent that starts at login and restarts on crash:

```bash
npx --yes @kahme247/ompweb@latest ompweb-launchd install
```

Manage it with:

```bash
npx --yes @kahme247/ompweb@latest ompweb-launchd status      # Show service state
npx --yes @kahme247/ompweb@latest ompweb-launchd uninstall   # Stop and remove
```

The service runs `npx --yes @kahme247/ompweb@latest`; pass a package spec to pin a
version, e.g. `ompweb-launchd install @kahme247/ompweb@0.3.6`. All
[environment variables](#environment-variables) are read at install time and baked
into the plist, plus `OMP_WEB_PKG` (package spec, same as the positional argument).
As a service, the browser is **not** auto-opened by default — install with
`OMP_WEB_NO_OPEN=0` to restore that.

```bash
OMP_WEB_PASSWORD=secret npx --yes @kahme247/ompweb@latest ompweb-launchd install
```

`OMP_WEB_PASSWORD` is hashed at install time; the plist holds the hash, never
the password. Pass `OMP_WEB_PASSWORD_HASH` to install a hash you generated with
`ompweb hash-password`.

When binding to a non-loopback host, require authentication (`OMP_WEB_PASSWORD_HASH`
or equivalent access control) and HTTPS through a trusted reverse proxy or VPN.
Unauthenticated binds are strictly restricted to loopback (`127.0.0.1`); there is
no unauthenticated private-network access. Never expose the web UI without
authentication or send credentials/session cookies over plaintext HTTP.

Logs go to `~/Library/Logs/ompweb/ompweb.log` and the plist lives at
`~/Library/LaunchAgents/com.kahme247.ompweb.plist` (mode 600; the password
hash — not the password — is stored there).

### Run as a Linux Service (systemd)

Install ompweb as a systemd **user** service that starts at login and restarts
on crash:

```bash
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd install
```
The installer creates `~/.omp/agent/web-service.env` automatically with mode
`600`; no manual file creation is required. The explicit `--package` form makes
`npx` run the systemd executable from the selected package.

To bind the service to all IPv4 interfaces for LAN access, set a password while
installing:

```bash
OMP_WEB_HOSTNAME=0.0.0.0 OMP_WEB_PASSWORD='change-me' \
  npx --yes --package=@kahme247/ompweb@latest ompweb-systemd install
```

The password is hashed before it is written to `web-service.env`.

Manage it with:

```bash
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd status    # Show service state
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd restart   # start / stop / restart
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd uninstall # Stop and remove
```

The service runs the locally installed `ompweb` binary resolved at install time
(override with `OMP_WEB_SYSTEMD_BIN`). Runtime configuration lives in
`~/.omp/agent/web-service.env` — the tray (or any editor) can change the port,
hostname, and password hash there and just restart the service; no reinstall
needed.
Install-time [environment variables](#environment-variables) are baked into
that file. As a service, the browser is **not** auto-opened by default. The
unit lives at `~/.config/systemd/user/ompweb.service` and logs go to the
journal:

```bash
journalctl --user -u ompweb -f
```

On a headless server, enable user lingering if the service must keep running
after the last login session ends:

```bash
loginctl enable-linger "$USER"
```

### Linux System Tray (KDE Plasma and compatible)

On Linux, `ompweb-tray` registers a StatusNotifierItem tray icon with a context
menu: open the web UI, copy its URL, start/stop/restart the systemd service,
view logs, expose the web UI to the network, change the port, set the web
password, toggle autostart, and quit the tray.

```bash
npx --yes @kahme247/ompweb@latest ompweb-tray --install      # Icons + autostart + start tray
npx --yes @kahme247/ompweb@latest ompweb-tray --status       # Tray and service status
npx --yes @kahme247/ompweb@latest ompweb-tray --uninstall    # Remove autostart, stop tray
```

**Expose to Network** rebinds the service from `127.0.0.1` to `0.0.0.0` so the
web UI is reachable from your LAN or VPN (e.g. Tailscale). Leaving loopback
requires a web password — the tray prompts for one via `kdialog`/`zenity` when
needed, and stores its hash. **Change Port…** and **Set Web Password…** edit
`~/.omp/agent/web-service.env` and restart the service. When binding to a
non-loopback host, use HTTPS through a trusted reverse proxy or VPN for remote
access.

"Start with Plasma" in the tray menu toggles a desktop autostart entry at
`~/.config/autostart/ompweb-tray.desktop`. Requires a running StatusNotifierItem
host (KDE Plasma, and most Wayland/X11 desktops).

## Features

- **Interactive Chat**: Real-time streaming conversation with your local `omp` agent — tool calls, thinking levels, token counts, cost, context gauge, queue controls, and interrupt & retry.
- **Running Sessions**: Jump between active runs from a separate section above workspaces, including runs in collapsed projects and desktop sessions not yet opened in Web. The standalone desktop bridge supplies validated owner metadata; read-only discovery reconciles every five seconds and follows live run events without spawning or prompting the owner. Shortcuts show the workspace path and disappear when the run finishes; the normal project tree remains intact.
- **Workspace Quick New Session**: Each workspace row has an always-visible **+** button that opens a new-session composer at that workspace's root, even when its session list is collapsed. OMP starts only on the first message. Existing sessions and drafts are preserved; the top New Session action still follows the selected directory/worktree. On mobile, the shortcut closes the drawer and focuses the composer.
- **Steer (Send now) or Queue**: Steer aborts the current turn and immediately submits the new message in the same session; completed actions are not undone. Queue waits for completion. Settings selects the highlighted action and desktop Enter behavior. Desktop attach rejects unsupported interrupt-and-replace and retains the draft; stop first or choose Queue.
- **Shared desktop OMP instance**: The standalone `extensions/desktop-bridge.ts` attaches Web to the original terminal process through its private authenticated socket, without a second writer or any Telegram dependency. Both processes share `PI_CODING_AGENT_DIR`; disconnecting or shutting down Web never terminates the desktop owner. Unsupported controls report an explicit error.
- **Native Ask in terminal and Web**: The existing native Ask appears as a structured browser form, including choice descriptions, multi-select and custom answers. The first answer wins and closes the other form; reconnects replay pending questions and abort clears both surfaces. No replacement Ask tool or placeholder input protocol is used.
- **Message Copy**: Copy user messages and completed assistant replies as rendered plain text or original Markdown using the buttons below each message. Thinking, tool output, and message controls are excluded. Oversized messages that use the raw-text viewer copy their full source in either format.
- **Queue Deletion Confirmation**: Preview and confirm before cancelling queued follow-ups or steered messages in OMP. Requires native `remove_queued_message` support; already-delivered messages cannot be recalled.
- **Session Management**: Browse past conversations by project, fork sessions, branch within a session, archive/restore, import session files, and deep-link via URL.
- **Rewind Prompts**: Use **Rewind** below a historical prompt or its reply to fork before that prompt and restore its text and images in the composer. The first prompt starts a branch with no earlier messages. The original conversation and its unsent draft remain intact; workspace files and executed commands are not undone. Stop an active run before rewinding. Session changes on attached desktop owners remain unsupported rather than moving the external owner's session.
- **Draft Recovery**: Unsent text stays scoped to its conversation or new-session workspace and is restored after Back/Forward navigation or reload in the same tab when browser storage is available (up to 50 drafts). Images and file attachments remain in memory only.
- **Live Plans & Historical Subagents**: Composer-attached panels retain todo progress and historical subagent summaries/transcripts. This fork's enforced single-agent policy prevents creating new built-in subagents, even though the upstream history UI remains.
- **Tool Preset Picker**: Choose `none` / `default` (`read,bash,edit,write`) / `full` for new sessions, persisted in localStorage. Presets do not override the fork's single-agent policy.
- **File Explorer & Previews**: Browse workspaces side-by-side with chat; preview code, markdown, Mermaid, images, audio, PDFs, and diffs with allow-listed access.
- **File Editing & Management**: Open a text preview and choose **Edit file**, then **Save** or **Back to preview**. The editor accepts regular UTF-8 files up to 256 KiB inside authorized workspaces, retains drafts across file-tab and settings switches, marks unsaved tabs, and warns before closing or leaving. Saves check the loaded content revision and atomically replace the file, retaining regular permission bits and the existing LF/CRLF convention; a disk conflict keeps your draft instead of overwriting the other writer. Copy any edits you need before choosing **Reload from disk** to resolve a conflict. Drafts are in-memory, not autosaved.
- **Explorer File Actions**: Use **New file / New folder** at the workspace root, or a folder's right-click/ellipsis menu to create nested entries. Each row's menu also offers **Rename** and **Delete**, including on mobile. Renaming updates affected open file tabs and never intentionally replaces an existing name. Deletion is permanent and recursive for folders, with confirmation; unsaved affected editors must be saved or discarded first. Workspace roots and their ancestors are protected. External files readable only through a chat reference do not gain write permission; symbolic links and special files cannot be mutated through these controls.
- **Local Reply Attachments**: Markdown links and images support filesystem paths, `file://` URLs, parent-relative paths, and `artifact://` references to persisted files in the originating session. External files must be referenced by that session; a link does not grant access to its entire directory or another session's artifacts. Missing, denied, and oversized images show an explicit error. Existing preview limits still apply (256 KiB for text, 10 MiB for images).
- **Git Worktree Support**: Create, switch, and manage Git worktrees directly from the sidebar; sessions and file roots stay grouped by project.
- **Usage & Analytics**: Dashboard in **Settings → Usage** for tokens, costs, cache savings, and breakdowns by provider / model / day / project with SQLite persistence.
- **Windows System Tray & Service**: Background service, tray icon, logon autostart, and Desktop/Start Menu shortcuts (Windows).
- **macOS launchd Service**: LaunchAgent that starts at login, restarts on crash, and logs under `~/Library/Logs/ompweb`.
- **Linux systemd Service & Tray**: User service that starts at login and restarts on crash, plus a StatusNotifierItem tray icon with service controls (KDE Plasma and compatible desktops).
- **Web-based Settings**: Interface & Behavior, Appearance & Personalization, Models & Providers, Usage, Agents & Policies, Extensions & Skills, and System & Updates. **Interface & Behavior** uses horizontal Interface layout/Interaction behavior/Keyboard Shortcuts tabs. **Appearance & Personalization** groups theme/display, wallpapers/glass, pets, and motion. **Models & Providers** groups connected accounts, custom providers, model registry, and global defaults. **Agents & Policies** groups separate instructions, subagents, runtime policies, and tool approvals. **Extensions & Skills** groups built-in image generation, MCP servers, and the Skills library.
- **Slash Commands & Shortcuts**: Quick prompts (`/plan`, `/review`, `/fix`, `/test`, etc.), a command palette (default `⌘K` / `Ctrl+K`), and model/reasoning cycling. **Settings → Interface & Behavior → Keyboard Shortcuts** lets you record, clear, or reset all 21 app shortcut actions, with search and conflict hints. Changes apply immediately and persist per browser, syncing across its tabs. **Stop agent is unbound by default**: Escape no longer aborts work; use the Stop button or assign a key. Standard menu/dialog dismissal, text editing/focus navigation, and terminal application keys remain unchanged.
- **UI Themes & Localization**: Warm paper light/dark themes plus an omp.sh-inspired midnight (`omp`) theme, chat font size & interface scale, with full English, Chinese (简体中文), and Japanese (日本語) translations.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Server port | `30177` |
| `OMP_WEB_HOSTNAME` | Server bind host | `127.0.0.1` |
| `OMP_WEB_PASSWORD_HASH` | Optional scrypt hash of the web login password, from `ompweb hash-password`. Required for any non-loopback bind; unauthenticated binds are strictly loopback-only (`127.0.0.1`) | _None (auth disabled)_ |
| `OMP_WEB_TRUSTED_HEADER_SHA256` | SHA-256 hex digest of the secret a trusted reverse proxy sends in `X-Omp-Web-Auth` to skip the password for that request; see [Skipping the password on trusted networks](#skipping-the-password-on-trusted-networks) | _None (disabled)_ |
| `OMP_WEB_NO_OPEN` | Set to `1` to prevent auto-opening browser | `0` |
| `OMP_WEB_DISABLE_AUTOUPDATE` | Set to `1` to disable both ompweb and OMP runtime update checks and in-app updates without network requests (`updatesDisabled` / `updates_disabled`); restart after changing | `0` |
| `OMP_WEB_NAME` | Name shown in browser tabs and installed-app names. `url`, `host` or `domain` (any case) uses the hostname the browser connected to, without port; localhost and IP addresses keep `omp web`. Any other value is used as-is. Restart after changing | `omp web` |
| `OMP_WEB_OMP_BIN` | Path to `omp` binary if not on `PATH` | _auto-detected_ |
| `OMP_WEB_DEV_ORIGIN` | Additional allowed hostname for the development server (no scheme or port); ignored in production | _None_ |
| `PI_CODING_AGENT_DIR` | Custom omp agent directory | `~/.omp/agent` |
| `OMP_WEB_STT_ENDPOINT` | OpenAI-compatible transcription endpoint URL | _None (disabled)_ |
| `OMP_WEB_STT_KEY` | Optional API key for the STT endpoint | _None_ |
| `OMP_WEB_STT_MODEL` | Optional model name for the STT endpoint | _None_ |
| `OMP_WEB_FFMPEG_BIN` / `OMP_WEB_FFPROBE_BIN` | Executable paths for custom BGM extraction | `ffmpeg` / `ffprobe` on PATH |
| `OMP_WEB_WALLPAPER_CACHE_MB` | Server-side compiled scene cache budget in MiB (`0` disables) | `4096` |
| `OMP_WEB_WALLPAPER_DIRS` | Server wallpaper roots, separated by the OS path delimiter; empty disables Steam discovery | _Steam auto-discovery_ |
| `OMP_WEB_WALLPAPER_ASSETS` | Additional Wallpaper Engine asset roots from your own installation | _auto-discovered where available_ |
| `OMP_WEB_CODEX_PETS_DIR` | Override the local Codex pet discovery directory | `$CODEX_HOME/pets` or `~/.codex/pets` |
| `OMP_WEB_PORT` | Port used in agent wake-up URLs; the launcher sets it. For the dev server, set `OMP_WEB_PORT=30178` | `PORT`, else `30177` |

**`OMP_WEB_NAME` and installed apps.** An installed app (PWA) is usually named after the page it was installed from. If you later change `OMP_WEB_NAME`, or reach omp-web through a different address while `OMP_WEB_NAME` is `url`, `host` or `domain`, your operating system may rename the installed app as well. Leave `OMP_WEB_NAME` empty, or set a name that identifies this omp-web server whatever domain name or address is used to reach it.

## Skipping the password on trusted networks

omp-web cannot see the client's address itself, so it leaves the decision to
your reverse proxy. The proxy sends a secret in the `X-Omp-Web-Auth` header,
and omp-web holds only that secret's SHA-256 digest in
`OMP_WEB_TRUSTED_HEADER_SHA256`. A request whose header hashes to that digest
is treated as signed in. Everyone else still signs in with the password whose
hash is in `OMP_WEB_PASSWORD_HASH`; without a password there is nothing to
skip, and the header is ignored. Keep omp-web bound to `127.0.0.1` so only the
proxy reaches it.

Generate the secret and its digest without typing the secret on a command line,
so it never lands in your shell history. This writes a random secret straight
into an nginx include file readable only by root and nginx, and prints only the
digest:

```bash
secret=$(openssl rand -hex 32)
printf 'map $ompweb_trusted $ompweb_auth {\n    1        "%s";\n    default  "";\n}\n' "$secret" \
  | sudo install -m 0640 -o root -g www-data /dev/stdin /etc/nginx/ompweb-auth.conf
printf %s "$secret" | sha256sum | cut -d' ' -f1
unset secret
```

Use your nginx group in place of `www-data` (`nginx` on some distributions).
Set the printed digest as `OMP_WEB_TRUSTED_HEADER_SHA256`. The command history
holds only the commands, never the secret. On Windows, the tray and background
service read it from your user or system environment, like
`OMP_WEB_PASSWORD_HASH`.

Always generate the secret this way; do not reuse a password or another chosen
value. omp-web stores only a fast, unsalted SHA-256 digest, which is safe only
for a long random secret: anyone who reads the digest could recover a short or
guessable one with a dictionary attack.

With nginx, send the secret only to the address ranges you trust:

```nginx
# http {} context
geo $ompweb_trusted {
    default       0;
    10.0.0.0/16   1;
}
include /etc/nginx/ompweb-auth.conf;  # the map written above

# the location that proxies to omp-web
proxy_set_header X-Omp-Web-Auth $ompweb_auth;
```

Always set the header, as above: the empty value for other clients replaces any
`X-Omp-Web-Auth` a client sends itself. nginx only inherits `proxy_set_header`
from outer blocks when a block sets none of its own, so put this line next to
the location's other `proxy_set_header` lines.

Serve omp-web only for its own hostname: give its `server` block an explicit
`server_name`, and add a `default_server` block that answers every other
hostname with `return 444;`. Otherwise a web page that a trusted browser visits
can point its own domain name at your nginx (DNS rebinding) and have nginx add
the secret to its requests.

`geo` checks `$remote_addr`, the address that connected to nginx. When clients
reach nginx through another proxy, use the
[`realip` module](https://nginx.org/en/docs/http/ngx_http_realip_module.html) to
replace it with the real client address. It does so only for connections from
addresses you list in `set_real_ip_from`:

- **Cloudflare (proxied DNS):** trust `CF-Connecting-IP`, and only from
  Cloudflare. List every range from <https://www.cloudflare.com/ips-v4/> and
  <https://www.cloudflare.com/ips-v6/>, and keep them up to date. Use this only
  when Cloudflare is really in front.

  ```nginx
  set_real_ip_from 173.245.48.0/20;  # ...one line per Cloudflare range
  real_ip_header   CF-Connecting-IP;
  ```

  Also refuse connections that come neither from Cloudflare nor from your
  trusted ranges. `$realip_remote_addr` is the address that actually
  connected, before `realip` replaced it:

  ```nginx
  geo $realip_remote_addr $ompweb_peer_allowed {
      default          0;
      173.245.48.0/20  1;  # ...every Cloudflare range
      10.0.0.0/16      1;
  }
  # in the server block
  if ($ompweb_peer_allowed = 0) { return 403; }
  ```

- **Cloudflare Tunnel (`cloudflared`):** the tunnel connects to nginx from
  `cloudflared`'s address (`127.0.0.1` when it runs on the same machine), so
  trust `CF-Connecting-IP` from there: `set_real_ip_from 127.0.0.1;` and
  `real_ip_header CF-Connecting-IP;`. Any local process can then send its own
  `CF-Connecting-IP` to nginx and claim a trusted address, and a local
  connection without that header keeps `127.0.0.1`, so listing `127.0.0.1` in
  `$ompweb_trusted` trusts every local process that connects to nginx.
- **Any other proxy or load balancer:**

  ```nginx
  set_real_ip_from  <proxy address or range>;
  real_ip_header    X-Forwarded-For;
  real_ip_recursive on;
  ```

  `real_ip_recursive on` reads `X-Forwarded-For` from the right and skips the
  hops listed in `set_real_ip_from`. Addresses a client adds itself are
  ignored.

## Development

```bash
git clone https://github.com/hsiatein/ompweb.git
cd ompweb
npm install
npm run dev
```

The dev server runs at [http://127.0.0.1:30178](http://127.0.0.1:30178).

The development server allows loopback and RFC1918 private IPv4 origins
(`10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16`). When using a tunnel
or reverse proxy with a custom hostname, set it without editing `next.config.ts`:

```bash
OMP_WEB_DEV_ORIGIN=dev.example.com npm run dev
```

For a persistent setup, set the variable in your local environment or service
configuration and restart the dev server. This does not change the bind address
or enable authentication. Next.js hostname patterns cannot express IPv6 CIDRs;
a private IPv6 origin must be supplied explicitly (for example, `[fd00::1]`).

### Checks

```bash
npm run typecheck   # Type check (TypeScript)
npm run lint        # ESLint
npm test            # Run test suite
```

> **Note**: Do not run `npm run build` during local dev — it populates `.next/` and can break `npm run dev`.

## License & Credits

- Forked from [agegr/pi-web](https://github.com/agegr/pi-web) (MIT) and adapted for [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi).
- Released under the [MIT License](./LICENSE).
