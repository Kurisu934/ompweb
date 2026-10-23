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

### Accounts, Quotas and Model Telemetry

| Addition / change | Behavior and limits |
| --- | --- |
| Account choice and rotation | Prefer an account per chat or temporarily disable accounts through OMP's `auth.accountPolicies`. Auto shows the last-used account. These are preferences, not hard locks: exhaustion/blocking can cause fallback. Changed policies apply when the child starts/restarts, including before its next idle prompt; standalone OMP clients are unaffected. |
| Account nicknames | Name provider accounts in the sidebar; the name follows that account across quota-pool rows and browsers through server settings. Original account labels remain visible in details. |
| Quota pools and Hyper credits | Preserve independent provider quota pools, such as Antigravity's model groups, instead of merging equal-duration windows. Show Charm Hyper remaining credits; an unknown total is explicitly a **250-credit reference estimate**, not a verified subscription limit. |
| Usage refresh | One-minute server cache and client refresh instead of five-minute snapshots; pause polling while hidden/offline, refresh when due on return, avoid overlapping requests and retain the last snapshot on transient failures. |
| Saved rate-limit resets | Show Codex/Claude reset credits, expiry and eligibility; spend one after confirmation through `omp usage reset`, then invalidate cached usage. OMP remains responsible for spend fencing and provider-specific restrictions. |
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
| Models & Providers | One `providers` category combines connected accounts, custom providers, model registry/routing, and five global defaults in horizontal tabs. Reasoning, verbosity, personality, thinking visibility and external scratchpad keep automatic native-settings saves; registry editing retains its own save controls and unsaved drafts across subtab switches. Search opens the relevant defaults panel. |
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
| Quieter, safer OMP updates | Background checks update the settings badge instead of interrupting startup/return with prompts. OMP checks/updates remain available when ompweb self-updates are disabled; failures retain their reason and checks allow 45 seconds. Updating the binary leaves active runs alone; idle sessions restart onto it before their next prompt. Explicit Restart OMP sessions still interrupts all sessions. |
| Staged Linux deployment | [Deployment script](scripts/deploy-linux-service.sh) builds a separate staging copy while the service runs, reuses matching dependencies/build cache, fingerprints the source, preserves live environment settings and retains backups. `switch` reuses a matching stage or builds first, then restarts the service; it is not zero-downtime deployment. |
| Private-network access and publication hygiene | The CLI launcher permits passwordless private LAN/VPN access with peer-address and Host checks instead of refusing all non-loopback binds. A same-host tunnel/proxy can bypass that boundary: use a password and HTTPS outside a trusted network. Local credentials, sessions, databases, private notes, artwork and diagnostic captures stay out of the repository. |

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
ompweb --password "your-password"          # Enable password protection
ompweb --no-open                           # Don't auto-open the browser
ompweb --install-tray                      # Install Windows System Tray service & Desktop shortcuts
ompweb --uninstall-tray                    # Uninstall Windows System Tray service & shortcuts
ompweb --tray                              # Start background System Tray manager
ompweb systemd install                     # Install Linux systemd user service
ompweb --help                              # Show help
ompweb --version                           # Show version
```

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

When binding to a non-loopback host without `OMP_WEB_PASSWORD`, ompweb serves
only loopback, private LAN/VPN (10/8, 172.16/12, 192.168/16, IPv6 ULA and
link-local) clients that open it by IP address or `localhost`; anyone on those
networks controls the agent. A tunnel or reverse proxy on the same host (frp,
`ssh -R`, …) arrives from loopback and bypasses this check, so set a password
and use HTTPS for anything beyond a trusted private network. Never send the
password/session cookie over plaintext HTTP outside such a network.

Logs go to `~/Library/Logs/ompweb/ompweb.log` and the plist lives at
`~/Library/LaunchAgents/com.kahme247.ompweb.plist` (mode 600; a configured
password is stored there in plain text).

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

Manage it with:

```bash
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd status    # Show service state
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd restart   # start / stop / restart
npx --yes --package=@kahme247/ompweb@latest ompweb-systemd uninstall # Stop and remove
```

The service runs the locally installed `ompweb` binary resolved at install time
(override with `OMP_WEB_SYSTEMD_BIN`). Runtime configuration lives in
`~/.omp/agent/web-service.env` — the tray (or any editor) can change the port,
hostname, and password there and just restart the service; no reinstall needed.
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
needed. **Change Port…** and **Set Web Password…** edit
`~/.omp/agent/web-service.env` and restart the service. When binding to a
non-loopback host, use HTTPS through a trusted reverse proxy or VPN for remote
access.

"Start with Plasma" in the tray menu toggles a desktop autostart entry at
`~/.config/autostart/ompweb-tray.desktop`. Requires a running StatusNotifierItem
host (KDE Plasma, and most Wayland/X11 desktops).

## Features

- **Interactive Chat**: Real-time streaming conversation with your local `omp` agent — tool calls, thinking levels, token counts, cost, context gauge, queue controls, and interrupt & retry.
- **Message Copy**: Copy user messages and completed assistant replies as rendered plain text or original Markdown using the buttons below each message. Thinking, tool output, and message controls are excluded. Oversized messages that use the raw-text viewer copy their full source in either format.
- **Queue Deletion Confirmation**: Preview and confirm before removing queued follow-ups or steered messages from the queue panel. This does not cancel delivery already queued inside OMP.
- **Session Management**: Browse past conversations by project, fork sessions, branch within a session, archive/restore, import session files, and deep-link via URL.
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
- **Web-based Settings**: Interface & Behavior, Appearance & Personalization, Models & Providers, Usage, Agents & Policies, Extensions & Skills, and System & Updates. **Interface & Behavior** uses horizontal Interface layout/Interaction behavior/Keyboard Shortcuts tabs. **Appearance & Personalization** groups theme/display, wallpapers/glass, pets, and motion. **Models & Providers** groups accounts, custom providers, model registry/routing, and global defaults. **Agents & Policies** groups separate instructions, subagents, runtime policies, and tool approvals. **Extensions & Skills** groups built-in image generation, MCP servers, and the Skills library.
- **Slash Commands & Shortcuts**: Quick prompts (`/plan`, `/review`, `/fix`, `/test`, etc.), a command palette (default `⌘K` / `Ctrl+K`), and model/reasoning cycling. **Settings → Interface & Behavior → Keyboard Shortcuts** lets you record, clear, or reset all 21 app shortcut actions, with search and conflict hints. Changes apply immediately and persist per browser, syncing across its tabs. **Stop agent is unbound by default**: Escape no longer aborts work; use the Stop button or assign a key. Standard menu/dialog dismissal, text editing/focus navigation, and terminal application keys remain unchanged.
- **UI Themes & Localization**: Warm paper light/dark themes plus an omp.sh-inspired midnight (`omp`) theme, chat font size & interface scale, with full English, Chinese (简体中文), and Japanese (日本語) translations.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Server port | `30177` |
| `OMP_WEB_HOSTNAME` | Server bind host | `127.0.0.1` |
| `OMP_WEB_PASSWORD` | Optional password for web login | _None (auth disabled)_ |
| `OMP_WEB_NO_OPEN` | Set to `1` to prevent auto-opening browser | `0` |
| `OMP_WEB_DISABLE_AUTOUPDATE` | Set to `1` to disable ompweb's own update check and in-app update (the OMP runtime check and update stay available); restart after changing | `0` |
| `OMP_WEB_OMP_BIN` | Path to `omp` binary if not on `PATH` | _auto-detected_ |
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

## Development

```bash
git clone https://github.com/hsiatein/ompweb.git
cd ompweb
npm install
npm run dev
```

The dev server runs at [http://127.0.0.1:30178](http://127.0.0.1:30178).

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
