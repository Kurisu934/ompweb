# Changelog

All notable changes to **omp-web** (`@kahme247/ompweb`) are documented in this file.

---

## Unreleased

### Terminal resume lock release and upstream merge — 0.5.4 (2026-11-04)

- Release a Web-owned session to the terminal sooner: `OMP_WEB_IDLE_DESTROY_MS` shortens the idle backstop for Web-owned `omp --mode rpc-ui` children (default unchanged at 10 minutes), so their native session lease is freed and a terminal `omp --resume` no longer forks to a sibling. Attached desktop owners keep the 10-minute backstop. The next Web command cold-starts a new child.
- Never reap a child while background work (async bash/task/eval) can still wake the session: both idle reaping and disconnected reaping now wait for omp's `session_settled`.
- End a session's event stream when its wrapper is destroyed (idle reap, crash, desktop disconnect), so open tabs reconnect instead of reusing a dead stream; a tab then attaches to a desktop owner that took the session over, or respawns on its next send.
- Desktop bridge: a terminal process runs a single bridge. A newer bridge load retires the previous one (shared through `globalThis`), a record carrying the process's own PID is taken over instead of failing with `Session already has a desktop bridge owner (PID <self>)`, and a publish that a release overtook no longer lands. Previously an orphaned bridge could keep the session's record while receiving no events, so Web showed a stale, idle copy of a live terminal session.

- Document the native `telegram_send_file` compatibility contract for Web-owned RPC children and attached original desktop processes: ordinary native tool events/results, process-local extension loading and private target configuration, without a Telegram runtime dependency, private protocol, host-tool routing or Ask changes.
- Display server-observed enqueue timestamps for queued messages using parallel `{steering: number[], followUp: number[]}` arrays aligned with OMP queue lists. Time sorting changes only the expanded view; cancellation and editing retain the native text-and-queue, first-match contract. Missing timestamps fall back to queue order; the collapsed first item remains in queue order.
- Honor non-empty model-declared `serviceTiers` for `/fast`; absent tier metadata falls back to supported provider families, including ChatGPT/Codex (`openai-codex`) and Google Vertex (`google-vertex`). The command lazily creates an empty session, applies `set_fast_mode`, reports creation/ownership errors, and ignores results after leaving the session. Attachments and execution during an active turn are rejected without discarding the draft.
- Update `OMP_WEB_DISABLE_AUTOUPDATE` behavior to disable both web and runtime update checks and application without making network requests (`updatesDisabled: true`, `updates_disabled` 403).
- Update usage refresh interval and server cache TTL to 1 minute (60,000 ms) with visibility-aware pausing, avoiding overlapping requests and preserving prior data on transient refresh errors.
- Update web-settings test expectations to account for `favoriteDirectories` and `memoryGuard` server defaults.
- Preserve loopback-only unauthenticated binds, requiring `OMP_WEB_PASSWORD_HASH` for non-loopback hosts without unauthenticated private-network access.
- Remove account routing, account picker, account aliases, and spend-reset claims, preserving standard provider credentials and usage pool/index reporting.
- Fix MessageView spinner not disappearing upon completion.
- Fix `read` tool path resolution dropping workspace and Windows drive letters, while preserving local per-tool independent line display in chat.
- Expand web prompt-building slash commands before checking running-turn command restrictions; `/fast` and `/btw` cannot accidentally become ordinary Send now or Queue prompts.
- Reuse an already-open session event stream for subsequent sends and clear optimistic turn state when Send now is queued behind a shell command.
- Remove the incompatible full-window sidebar backdrop that blocked desktop controls; preserve the local full-screen mobile drawer.
- Keep a manually selected worktree in workspaces without sessions once the project list has loaded; provisional startup selection must not reset the active checkout to the main worktree.

### Ownership and queue admission — 0.5.3 (2026-10-19)

- Gate historical resume on the native session ownership lease, fail closed when inspection is unavailable, and protect external-owner mutations without Telegram dependencies. Coordinate canonical-path startup across Web processes, retain moved session aliases, and keep resume reservations for the child lifetime.
- Preserve each uncertain delivery separately instead of automatically restoring it into later drafts; retain explicit recovery/discard controls and guard same-draft dispatch. Do not deduplicate message text or clear unrelated native queue entries.
- Unify Steer with Send now (`abort_and_prompt`); only Queue waits. Remove cooperative queue promotion from Steer controls, retaining explicit Edit/Delete. Attached Stop falls back to turn abort with a warning that queued messages were not withdrawn.
- Native ownership preflight is not atomic lease transfer: an external owner can still acquire OMP's lazy first-write lease after inspection. Desktop attach still rejects unsupported atomic interrupt-and-replace. This source release does not deploy or restart the production service.

### Independent desktop bridge — 0.5.2 (2026-10-18)

- Package a standalone desktop extension using private `web-desktop-sessions` metadata and the authenticated `omp-web-desktop/v1` protocol. Web discovers unopened desktop runs and attaches to their original PID/journal; disconnect, idle disposal and Web shutdown never terminate the desktop owner.
- Intercept the existing native Ask dialog instead of registering a replacement tool. Validate Web answers before claiming the question, preserve native result/timeout semantics, accept the first answer, dismiss losing forms, replay pending questions after reconnect and clean up on cancel/abort.
- Remove Telegram-specific placeholder Ask forms, environment negotiation, legacy-state checks and wake-lock coupling. Telegram remains independently namespaced and is not required or modified.
- Resolve newly published live desktop journals even while the ordinary session-list cache is stale, and restore discovered live sessions directly from their deep links. Refuse archive/delete and unsupported ownership-changing controls before writing the external journal.
- Verify with OMP **18.10.1**, a real isolated terminal and browser: discovery before opening, local-first and browser-first native Ask, invalid-answer rejection, pending replay across a Web-service restart, local cancellation and abort cleanup, live input/output, one preserved PID/journal, and owner mutation/shutdown protection. Related existing tests, final TypeScript checks and an out-of-tree production build passed.

### Local deployment — 2026-10-11

- Deploy the integrated fork as package version **0.5.1**, identified by its local Git deployment commit. Install the existing lockfile before building; a stale dependency directory can omit the newly integrated `web-push` package.
- Production build and TypeScript checks passed. Browser verification against an isolated OMP **18.8.7** confirmed that queued-message **Edit** removes the native queue entry and restores the draft, and confirmed **Delete** removes it without restoring a draft.

### Breaking changes

- **A plaintext web password no longer reaches the server.** `ompweb --password` now stops the launcher at startup, and the server refuses every request while a plaintext password is in its environment. Every `omp` session inherits omp-web's environment, so an agent running `env` could print the password into its session file and send it to the model provider. Replace it with `OMP_WEB_PASSWORD_HASH`: run `ompweb hash-password` (it reads the password from stdin, so it stays out of shell history and `ps`) and pass the printed `scrypt$…` value. As a migration step, `ompweb` still accepts `OMP_WEB_PASSWORD`: it hashes the password at startup, keeps it out of the server's environment, and logs a warning with the hash to set as `OMP_WEB_PASSWORD_HASH`. Switch soon: agents can still read the plaintext from the `ompweb` launcher process, and each start makes a new hash, so every restart signs all browsers out. Setting both variables stops the launcher. The service installers hash an `OMP_WEB_PASSWORD` given at install time, so `OMP_WEB_PASSWORD='…' ompweb-systemd install` still works and now stores only the hash; the Linux tray's **Set Web Password…** does the same. Existing session cookies are invalidated.

### Added

- Add an always-visible **+** quick-new-session action to each sidebar workspace row. Target that workspace directly without first selecting it, preserve existing sessions/drafts and the top New Session action's selected-directory/worktree behavior, and lazily start OMP only when the first message is sent. Reuse existing glass-aware sidebar controls, translations, keyboard focus and touch target sizing; mobile closes the drawer and focuses the composer.
- List running sessions in a dedicated sidebar section above workspaces, with workspace paths and direct navigation; keep their existing workspace entries and remove the shortcuts when runs finish.
- Expose **Send now**, **Steer**, and **Queue** as separate actions while composing during a run. Send now uses OMP's native `abort_and_prompt` to cancel the run and process the new input without waiting for natural completion; it does not undo completed actions. The highlighted action and desktop Enter follow Settings → Interface & Behavior → Message during active run. Steering retains native delivery timing, and Queue waits until completion. Unsupported desktop-owned interrupt-and-replace requests report a localized error and retain the draft instead of silently queuing it.
- Attach to a running terminal OMP through the standalone desktop extension's authenticated, owner-only socket, sharing one runtime and session history without spawning a second writer. Browser disconnect and idle disposal detach without terminating the external owner.
- Add wallpaper-library direction/type filters and natural name, added-time and modified-time sorting in both directions. Auto defaults to landscape on desktop and portrait on mobile; explicit choices persist per browser. Read bounded scene/media dimension metadata, honor EXIF/MP4 rotation, and keep unknown dimensions separately selectable.
- Add damped bone-spring simulation with authored axes, stiffness, damping, inertia, gravity and limits, plus SceneScript impulse/reset APIs. Actual Aemeath dragging now releases into spring return; regression coverage includes frame-rate independence, parent motion, limits and single-consumption impulses.
- Repair newly added scene compatibility: preserve embedded Matroska/WebM videos, retain scripted transform-only layers, implement sequence/control-point and vortex particle behavior, and translate HLSL remainder, scalar/vector conversions and mismatched varying widths. Surface shader linker diagnostics and invalidate older compiled manifests.
- Fix loading of the two Aemeath scene wallpapers: accept bounded PKGV0024 packages, decode modern unskinned MDLV0019/0023 meshes with their 48-byte vertex layout, and route default/background-copy composition layers through projected scene capture plus authored post-effects. Preserve explicit isolated-child composition behavior and bump the compiled-scene cache revision. Verified actual browser loading, eye-tracking image changes, and animation.
- Split Interface & Behavior's General subtab into **Interface layout** (tool-call collapse and sidebar usage visibility) and **Interaction behavior** (selection, automatic opening, sound/speech, submission, and completion), alongside Keyboard Shortcuts. Split **Instructions & Subagents** into independent **Instructions** and **Subagents** tabs with draft preservation. Migrate search targets, localized labels, and glass-surface navigation checks; retain existing settings keys and save behavior.
- Consolidate **Agents & Policies** (`agents`) into **Instructions & Subagents**, **Runtime policies**, and **Tool approvals** horizontal tabs. Move all 13 compaction/memory/autolearn/retry settings and the three native approval controls, preserving storage and automatic saves. Keep instruction/subagent drafts across subtab switches, route search to the right panel, and scope native-settings failures to runtime/approval panels. Remove the former `intelligence` and `safety` categories; update English, Chinese, Japanese, and navigation documentation.
- Merge **AI Model Defaults** into **Models & Providers** (`providers`) as a fourth horizontal tab beside connected accounts, custom providers, and model registry. Preserve all five native defaults, automatic saves, registry save controls and provider drafts across subtab switches. Search selects Defaults; native-settings failures and model-file parse errors remain scoped to their own controls. Remove the old `models` category and update localized labels and navigation.
- Merge **Keyboard Shortcuts** into **Interface & Behavior** (`general`) with horizontal **General / Keyboard Shortcuts** tabs sharing Appearance's segmented navigation. Remove the standalone shortcut category and route setting search to the correct subtab. Browser-only preferences stay accessible while native OMP settings load. Existing shortcut bindings, recording, clear/reset, conflict hints and storage remain unchanged.
- Consolidate **Appearance & Personalization** (`appearance`) into provider-style horizontal tabs: **Theme & Display**, **Wallpapers & Glass**, **Pets**, and **Motion**. Move font size, interface scale, and whale-tail animation out of General; add theme selection using the existing topbar preference. Search opens the matching subtab, as do wallpaper and pet shortcuts. Tabs support arrow/Home/End navigation and horizontal scrolling on narrow screens; only the active panel mounts. Existing local preferences and asset libraries remain unchanged.
- Consolidate settings into **Extensions & Skills** (`extensions`): built-in image generation, MCP servers, and the Skills library share one page with searchable sections. The category remains available without a workspace; project MCP editing and skill management show workspace guidance. Remove the obsolete `mcp`/`skills`/`plugins` tab identities, normalization alias, unreachable plugin panel, plugin reload callback, unused component and translations. Installed plugins and the backend plugin API are unchanged.
- Add **Settings → Interface & Behavior → Allow background sessions to open files in the side panel**, directly below **Automatically open web links in the browser**. The distinct labels separate side-panel files from browser web links. Off by default and saved per browser, the file preference lets background-session requests open directly, leaving Settings if necessary. Requests from the viewed session continue opening directly. File authorization, editing permissions, link approvals and saved preference keys remain unchanged.
- Unify all form dropdowns with the shared Base UI selector: new-session workspace, settings, models/providers, agents, usage, wallpapers/BGM, pets and scheduled tasks. Both triggers and portaled option lists follow the wallpaper glass/clear modes, with keyboard navigation, disabled options and viewport-constrained scrolling. Scheduled workspace suggestions use the same material while retaining free-form paths; Escape closes the open dropdown without also closing Settings.
- **Settings → Agents → Custom instructions** manages server-wide, provider and exact provider/model prompt rules. Model rules replace provider rules, which replace the global rule; explicit empty text suppresses broader custom instructions and deleting a rule restores inheritance. The native OMP extension selects fresh rules at ordinary prompt preparation and queued-message dequeue, without interrupting a current response or replacing native/project/sudo instructions. Linked dropdowns select existing providers and their available models, clearing model selection when the provider changes; the card and controls reuse the shared wallpaper glass material. Includes effective-rule preview and unsaved-switch/delete confirmation. Existing children started before this upgrade need one restart to load the extension.
- Add basic right-panel text editing and Explorer file management. Text previews offer **Edit file**, explicit **Save**, reload, and return to preview; drafts survive tab/settings switches, unsaved tabs are marked, and closing/leaving warns before data loss. Content-revision checks reject external-edit conflicts without losing the draft. Saves atomically replace regular UTF-8 files up to 256 KiB, preserving normal permissions and LF/CRLF line endings; live previews continue observing successive replacements.
- Explorer root buttons and row right-click/ellipsis menus create files/folders, rename entries (updating open tabs), and permanently delete files or whole folders after confirmation. Dirty affected editors block rename/deletion. Mutation permissions remain restricted to authorized workspace roots, reject symlink escapes, and protect roots and their ancestors; chat-only external references remain read-only.
- **Settings → Keyboard Shortcuts** manages all 21 application shortcut actions: record or remove bindings, clear an action, restore its defaults, search, and see overlapping bindings. Changes apply immediately, persist in this browser, and sync across its tabs; hints and accessibility shortcuts follow the saved bindings. **Stop agent is now unbound by default**, so Escape no longer stops a task from either the page or composer; the Stop button is unchanged. Menu/dialog dismissal, native editing/navigation, and terminal applications keep their standard keys.
- **Right-click menu** of omp-web's own in place of the browser's. Sessions: open, open in a new browser tab, rename, copy transcript (Markdown), copy session ID, archive, delete. Workspaces: new chat here, pin/unpin, rename, OMP launch arguments, copy path, **open in terminal**, move up/down, remove. Explorer entries: open/expand, mention in chat (@), copy relative/absolute path, download, open a folder in the terminal. File tabs: close, close others, close all, mention, copy path, reveal in Explorer, download. Messages: copy text, copy as Markdown, edit from here, fork a new session, read aloud; code blocks add **Copy code**. Selected text offers **Copy** and **Quote in reply** (appends it as a `>` quote to the composer). Anywhere else: new chat, command palette, sidebar, file panel, terminal, archived sessions, settings. Text fields, images, web links, the terminal screen, and touch long-press keep the browser menu; **Shift+right-click** always opens it.
- Add an off-by-default **Resume running sessions after a restart** setting in Settings → System & Updates. When omp-web restarts while agents are working, it restarts those sessions and prompts each with "Session interrupted and resumed. Continue as you would have done without the interruption." Work in progress at the moment of the restart, such as a running command, is lost. Do not also resume those sessions from a terminal while omp-web is down.
- Add **Copy** and **Copy as Markdown** below user messages and completed assistant replies, with keyboard access and touch-sized controls. Copy only message text, excluding thinking, tool output, and renderer controls; preserve full source for oversized raw-text messages.
- **Expand thinking blocks by default**, an off-by-default switch next to **Keep tool calls collapsed** in Settings → Interface & Behavior. Turn it on to read the model's reasoning without expanding every block; each block still collapses and expands by hand, and the choice applies to a block that is still streaming as well. Tool-call collapsing is unchanged.
- Add **Settings → Notifications**: desktop and mobile notifications for a finished task (after the prompt and any background work it started are done; subagents never notify), a question or approval waiting for you, a run that failed after retries and fallbacks, and a model switch omp made on its own (for example Fable falling back to Opus after a refusal, or a usage-limit fallback). Each browser chooses its own events and whether to show an in-app toast or a system notification while you use omp-web in another tab. Nothing is shown for the session you are viewing, and clicking a notification opens its session; an in-app toast opens it from a click or tap anywhere on it, or Enter when it has keyboard focus. Over HTTPS (or on `localhost`) notifications arrive through Web Push even with no omp-web tab open, including the iPhone/iPad app added to the Home Screen; the push keys and device list live in `~/.omp/agent/omp-web/notifications.json`. Notifications are off until you turn them on. This replaces the previous completion notification for the open session, and the agent's `notify` tool now also works on Android.
- Skip the web password for clients your reverse proxy trusts: the proxy sends a secret in `X-Omp-Web-Auth` only for trusted address ranges, and omp-web holds only the secret's SHA-256 digest in `OMP_WEB_TRUSTED_HEADER_SHA256`. Other clients still sign in with the password. The README shows how to generate the secret without it reaching shell history, and an nginx setup, including how to trust the real client address behind Cloudflare, Cloudflare Tunnel or another proxy, and how to guard against DNS rebinding. The service installers preserve the setting, and the digest never reaches child processes.
- Choose **Classifier** or **Vendor default** in Settings → AI Model Defaults → **Auto Thinking Source** when Reasoning is `auto`. The choice is saved in omp's native config for newly started or restarted agents. Vendor mode prefers the publisher's effort, then omp's per-model default, then normal Auto fallback. Requires an omp release containing [can1357/oh-my-pi#14114](https://github.com/can1357/oh-my-pi/pull/14114).
- Show conflicting skill names and deduplicated installations when an OMP session starts, with resolution details, a **×** button that dismisses the notice for the session until the diagnostic report changes, and a persisted **Turn off** action that disables startup notices. Inspect a running session manually in **Settings → Extensions & Tools → Skills**, even when notices are off; inspection never resumes a stopped session. Requires an OMP runtime with the skill-diagnostics RPC commands; older runtimes report live diagnostics as unavailable.
- Ask a side question with `/btw <question>`: omp answers from the current conversation in a panel above the composer, even while the agent is working, and the question never enters the chat. Cancel a running answer, copy it, or ask follow-ups in the same topic. `/btw` on its own lists the session's past side questions, including ones asked in the terminal, each expandable to all its turns with **Copy** and **Follow up**. Side questions are text-only: with an attachment in the composer, `/btw` is refused and the draft is kept. An answer that omp lost (for example after its process restarted) shows as **Interrupted** instead of spinning. Requires an omp with the `btw` RPC commands; older omp shows "/btw requires a newer omp" instead of sending the text to the model.
- Show omp's Claude usage-limit badge in the composer toolbar, matching the terminal status line during the wrap-up allowance or once `/slow` low priority takes over. Reset times use the browser's locale and timezone. Requires an omp version whose `get_state` reports structured `usageLimit` state.
- Add a **Slow** toggle next to **Fast** in the composer toolbar, the equivalent of omp's `/slow`. On Claude models it turns low priority on or off in your omp settings, so it applies to every session and terminal; on OpenAI and Google models it switches this session to the provider's flex tier. Once the session's omp process runs, the toggle follows omp's `get_state` (`slowModeSupported`); before that, including in a new session, it follows the selected model's provider (`anthropic`, `openai`, `openai-codex`, `google`, `google-vertex`) and, on Claude, the `providers.anthropic.slowMode` setting. Clicking it there starts the session's omp process.
- Show the composer's reasoning level with TUI-style icons, alongside its name on desktop and without the name on narrow toolbars. The menu pairs each icon with its level name. Icons use consistent, vertically centered shapes rather than font-dependent Unicode glyphs, with larger mobile controls, smaller desktop controls, and support for high-contrast colors. Keep the model icon visible on phones and reduce unused space between the model and reasoning controls without wrapping the standard toolbar controls. Provider-defined levels retain their names with normal truncation.
- Keep the reasoning menu in one column on phones as well as desktop, with one full-width level per row instead of side-by-side chips.
- Add **Paste image** to the composer's **+** menu, with Japanese and Simplified Chinese translations. Requires HTTPS (or localhost), browser support for clipboard image reads, and clipboard permission; the item is hidden where the browser cannot read images from the clipboard. Attaching a file remains available.
- Name web app installations, iOS home-screen titles, and browser tabs after the server's hostname (without port), so multiple servers can be told apart. Localhost and IP addresses keep the generic `omp web` name; named LAN hosts are preserved. Tabs show `workspace - installation name`. Existing installations may need to be re-added to pick up the new name.
- Name web app installations, iOS home-screen titles and browser tabs with `OMP_WEB_NAME`, so multiple servers can be told apart. Unset or blank keeps `omp web`; `url`, `host` or `domain` (any case) uses the hostname the browser connected to, without port, keeping `omp web` for localhost and IP addresses; any other value is used as-is. The service installers preserve the setting. Tabs show `workspace - name`. Existing installations may need to be re-added to pick up a new name.
- Create a workspace by cloning a Git repository: in the **Add workspace** dialog, enter an `https://` or ssh URL and choose **Clone here** to clone into a new folder under the selected directory, which then becomes the active workspace. Clone progress streams into the dialog; **Cancel clone** stops git and deletes the partial clone. git never prompts, so private repositories need a credential helper or ssh agent.
- Add a manual refresh button to the sidebar's Provider Usage panel, with the same success feedback as workspace refresh. Manual refresh bypasses omp-web's usage cache and invalidates omp's cached reports before fetching fresh limits; automatic five-minute refresh remains unchanged. Manual refresh requires an omp that supports `usage invalidate`; an unsupported or failed refresh shows as unavailable instead of reporting success.
- Add an off-by-default **Resume running sessions after a restart** setting in Settings → System & Updates. When omp-web restarts while agents are working, it restarts those sessions and prompts each with "Session interrupted and resumed. Continue as you would have done without the interruption." Work in progress at the moment of the restart, such as a running command, is lost. Do not also resume those sessions from a terminal while omp-web is down.
- Scope Ctrl+A / Cmd+A to the selected message, currently loaded chat, or active file contents instead of the whole page. Message selection includes collapsed extension previews and expanded details without toolbar labels. Newer pane focus takes precedence over retained child selections. Text fields and IME composition retain native behavior; browser-menu commands and embedded viewers remain browser-controlled.
- Add an off-by-default **Scope native Select All (experimental)** switch in Settings → Interface & Behavior. The per-browser preference narrows whole-page selections from native menus while leaving keyboard scoping independent. Disable it if browser selection handles or menus behave unexpectedly; intentional whole-page selections can also be narrowed.
- Add a **Notifications** tab, first in the right panel before Explorer and Git, listing the last 100 toasts and system notifications (task completions, agent `notify` messages). Entries keep their action buttons and can be dismissed one by one or all at once. While notifications are unread, the panel toggle shows their count and opens straight to the tab; entries become read when you leave it or choose **Mark all as read**. Toasts now stay on screen for 6 seconds, and errors for 10 seconds. On touch screens, swipe a toast or a Notifications entry left or right to dismiss it, as on Android; the swipe can start anywhere on it except its buttons, and it never also moves a sidebar. Changed your mind mid-swipe? Drag it back toward the centre before letting go and it stays. A mostly vertical drag still scrolls the list. A mouse drag now selects text instead of dismissing a toast, and toasts no longer dismiss with a downward swipe. The mobile sidebar swipes also keep working while a toast is on screen.
- Play back a voice recording before transcribing or sending it. Pause keeps a left-side preview control; Stop opens a review deck with play, discard, and transcribe-and-send.
- Link GitHub issue and pull-request references in chat messages. Bare `#123` links to the session checkout's GitHub repository (the `gh` default remote, else `upstream`, `github`, then `origin`); `owner/repo#123` links to that repository. Code spans and existing links are left unchanged.
- Show all of an agent's ask-tool questions in one panel, with checkboxes for multi-select, radio buttons for single-select (recommended option marked and preselected), and an **Other** free-text answer per question, submitted together. Requires an omp that supports `set_ask_dialog`; older omp keeps the one-question-at-a-time dialog.
- Make `agent://<id>` subagent handles in chat messages clickable. Bare handles, inline code containing only a handle, and Markdown links open that subagent's result dialog; `agent://Parent/Child` opens the nested `Parent.Child` subagent when the roster knows it. A `read` of an `agent://` handle opens the same dialog from its tool row.
- Show the full model name, including its provider (for example `anthropic/claude-sonnet-5-5`), and the reasoning effort in the subagent result dialog, for running subagents and for finished ones after a reload. Finished background subagents take them from their saved transcript, so they also appear in the composer's subagent chips.
- Attach images and text files while the agent is running, and send them with a steer or a queued follow-up. Attaching through **+**, paste, or drag and drop now works during a run; with only attachments in the composer, **Stop** becomes **Queue**. An image-only message shows as `[Image]` in the queue. A steer or follow-up that omp refuses returns to the composer with its images, and so does a queued message taken back by **Edit** or **Stop**. Getting images back from **Edit** and **Stop** requires an omp with `abort_and_restore_queue` and image-returning `remove_queued_message` ([can1357/oh-my-pi#14179](https://github.com/can1357/oh-my-pi/pull/14179)); older omp returns only the text.
- Open file paths that chat messages write as inline code in the file panel, so a screenshot path such as `` `/var/tmp/shot.webp` `` shows in the image viewer. Absolute paths with at least two segments, `~/` home paths, Windows drive paths, and workspace-relative paths with a directory and file extension link; a `:line[:col]` suffix is dropped when opening. Other code, scheme handles (`history://`, `agent://`, `https://`) and fenced code blocks stay unchanged. Files outside the workspace open when the session mentions them, now including `~/` mentions; bare paths in prose are not linked.
- Show omp's passive tool context as one dim `↳ Context: …` line on the last tool card of the tool batch it follows, matching omp's terminal, instead of a separate developer-message row. Hover the line for the full text; expanding the card shows the full text as its own section below the output. ANSI codes and control characters are removed and the text is collapsed to one line. Context that follows a non-tool message is not shown, so it never lands on an earlier, unrelated card. In a batch of several tool calls the line sits on the last call's tool row. Copy as Markdown and transcript exports leave it out. Requires an omp release containing [can1357/oh-my-pi#13269](https://github.com/can1357/oh-my-pi/pull/13269); with older omp, passive context still shows as a developer-message row.

### Fixes & Improvements

- Discover active desktop sessions through their validated standalone bridge metadata even before any Web tab opens them. Merge read-only owner snapshots into the session-list API and running-session SSE, apply live run events immediately, and rescan every five seconds while observed. Reuse authenticated sockets without spawning, prompting, or terminating the external owner; release observers when no requests or subscribers remain.
- Keep running-session shortcuts visible with long workspace lists. Size the workspace scroll area from the remaining sidebar space instead of its content height, which could shrink the running-session list to zero pixels while its count still showed a live session.
- Integrate kahme247/ompweb through `7a3f76c` while retaining the fork's wallpaper/glass/pet UI, running-session shortcuts, three running-input actions, first-prompt Rewind and external-owner protection. Native structured Ask remains independent of Telegram's integration.
- Multiplex cross-session host tools on the running-session/notification stream, including the full-page Settings view, instead of opening a third persistent stream per chat tab. This prevents two HTTP/1.1 chat tabs from exhausting the browser's six connections and stalling answers or commands.
- Reclaim idle OMP children after ten minutes even when extensions continuously update status/widgets or the browser polls read-only state. Keep running tasks and unanswered dialogs/host requests alive; attached desktop owners are disconnected, not terminated.
- Share native Ask between the original terminal and attached browser clients, including reconnect replay and cancellation when another surface answers. Preserve the native RPC channel for Web-owned OMP children, discover live owners before resuming a stored session, and reject unsafe duplicate writers or attached-session deletion/reload.
- `ompweb hash-password` in a terminal finishes when you press Enter. The hidden prompt waited for a newline, but a terminal in raw mode sends Enter as a carriage return, so the prompt never ended.
- The Notifications tab now tells unread notifications from read ones: an unread notification has an accent dot before it and a bold title on a tinted row, and read notifications are dimmed. The tab also lists only the notifications that can also be pushed (task finished, input needed, error, model switch). Confirmations such as "Saved", copy results, update notices and agent `notify` calls still show as toasts but no longer fill the tab. A session's next notification of the same type is unread again instead of inheriting the earlier one's read state.
- Fit the agent's question panel on a phone. A long question, header or option preview no longer widens the panel past the screen and clips the answer text at the right edge, and previews wrap instead of scrolling sideways.
- A question that arrives while you are composing on a touch device no longer pulls focus into its answer box, which raised the on-screen keyboard and scrolled the unread question away. The panel waits for a tap; on a desktop with a keyboard it focuses its first field as before.
- Reach **Submit** with the keyboard open: the question panel is now capped to the visible area so its Cancel/Submit footer stays on screen, an inline send button appears beside the typed answer (same validation as the footer), and the dialog's buttons follow the **Touch Targets** setting.
- Submitting a message while the agent is working now queues it by default instead of steering, in Settings → Interface & Behavior → **Message during active run**: steering a long tool or shell command could abort the turn mid-task and left the new message undelivered. A previously saved choice is kept; only an empty setting changes meaning. Sending during omp-web's own `!!` shell command no longer fails with "Cannot send a prompt while a shell command is running": the message is handed to omp's queue instead of aborting anything, the optimistic bubble is withdrawn, and a notice says it was queued behind the running command.
- Keep omp-web's own secrets out of every child process it starts, not only the `omp` session processes: plugin install and upgrade, skill install/update/search, update checks and the self-update worker, agent unpack, and the Git commands the file panel runs. A session environment no longer contains the web password hash, so `env` inside an agent no longer prints anything that grants access to this server. `OMP_WEB_*` values that are configuration rather than secrets (the `omp` binary path, port, package dir) keep reaching the processes that need them.
- Sign web sessions with a per-installation random key (created on first start at `~/.omp/agent/omp-web/web-auth-secret.json`, mode `0600`) mixed with the password hash, instead of the hash itself. Anyone who reads the hash out of a service environment file can no longer forge a session cookie, and changing the password still signs every browser out.
- On Windows, changing or removing the web password hash with `setx` now takes effect at the next server restart. The tray (native and PowerShell) and the background service read `OMP_WEB_PASSWORD_HASH` from the user, then system, environment each time they start the server, instead of preferring the copy they captured at logon, so an old password no longer keeps working after you rotate it. The native tray previously did not pass the hash on at all.
- The **Notifications** tab now lists notifications that appeared as system notifications too, not only in-app toasts, including Web Push notifications that arrive while an omp-web tab is open. Click or tap an entry for a session, or press Enter on it, to open that session; its dismiss button still only removes it. The list is still kept per tab in memory, so pushes that arrive with no omp-web tab open are not listed.
- Opening a notification by clicking or tapping its toast now marks it as read in the Notifications tab, so it no longer counts toward the unread badge. A later notification of the same kind for the same session is unread again, even after the earlier one was read.
- Word-completion ghost text in a scrolled composer now appears right after the caret. When the draft had text after the caret, it used to be drawn lines further down.
- Show a single plus sign on the **Add provider** buttons in Models settings, and none in the Add provider dialog title. The translated label no longer repeats the button's **+** icon.
- Links in a Markdown file preview no longer navigate omp-web away. A relative link the file panel cannot open, such as one in a Markdown file outside the workspace, shows as plain text with its target on hover; web links open in a new tab. An image the panel cannot load shows its alt text instead of a broken image.
- The image viewer now opens with the whole image fitted to the screen on every device, instead of at 100%; images smaller than the screen stay at their real size. The zoom percentage is always relative to the image's real pixels, at every Interface Scale. Zoom out goes down to 10%, or further to the fitted size for very large images, in ×1.25 steps. **Fit to screen** and **1:1** (actual size) replace **Reset zoom**. Zooming keeps the centre of the view in place, and a zoomed-in image can now be scrolled to every edge; before, the parts outside the starting size were cut off. The viewer covers exactly the window at Compact, Comfortable and Large Interface Scale, and its buttons follow the **Touch Targets** setting, wrapping on narrow screens instead of being clipped.
- Show images from tool results again after reopening or reloading a session. Since tool-result images were dropped from the initial history load, screenshots and image reads showed only `[1 tool result image omitted from initial history payload …]`, with a wrong byte count. Expanding the tool row now shows a small preview; click it for the full image. Previews are 480px WebP files generated once and kept in omp-web's data folder, and live tool output also arrives as a link instead of inline base64, so many large screenshots no longer slow the chat down or fill browser memory.
- The completion notification omp-web used to show for the open session when its tab was in the background is gone, along with its permission prompt on the first finished run. Turn on **Settings → Notifications** to get notifications again; they now cover every session, not only the open one.
- Builds no longer fail at random while fetching fonts. Google Fonts sometimes serves Noto Serif SC through links Next.js cannot parse, so omp-web now ships its own copy: a 2.2 MB subset (weights 600–700; GB2312, kana and CJK punctuation), downloaded only when a page shows Chinese or Japanese text in a heading. Characters outside the subset use the system's CJK serif font. The Nix package's local-font patch applies again.
- Balance the composer icons on phones and narrow toolbars with a slightly smaller effort-level icon and a larger Slow-mode snail, while keeping menu icon sizes unchanged.
- Keep the model picker on the left and reasoning effort, Fast, Slow, microphone, and Send/Stop controls in a right-aligned composer group, including wrapped mobile rows.
- The Provider Usage panel now shows each account's email instead of omp's redacted form (`an*`); accounts without an email show as **Account N**. Only the email, plan and limits reach the browser.
- The composer's reasoning menu now uses the same borderless rows as the model picker instead of bordered cards.
- The context popover now uses the room above the composer instead of a fixed 380px cap, so it only scrolls when the window is too short for it.
- Fix settings crashes, stalled session catch-up, and failed voice transcription polling in browsers without `AbortSignal.timeout`, `AbortSignal.any`, or `Promise.withResolvers`, including development-mode clients. Client requests now use `AbortController` timers and ordinary promises while retaining timeouts and cancellation (#196).
- Allow development requests from all RFC1918 private IPv4 ranges, not just `192.168.*.*`. Set `OMP_WEB_DEV_ORIGIN` to allow a tunnel or reverse-proxy hostname without editing `next.config.ts`; the setting is development-only.
- Fix authenticated app-installation metadata: serve `/api/manifest` through the existing password guard with one credentialed manifest link and embedded packaged PNG icons, avoiding cookie-free native installer icon downloads. Preserve the app identity and root launch URL/scope, retain private revalidating caching, and remove the obsolete public-manifest exception. Verified in local Chromium with HTTP icon URLs blocked and no installability errors; the owner also confirmed successful installation on a physical phone behind Cloudflare Access.
- Manage Git worktrees from a new **Worktrees** tab in the file panel, next to Explorer and Git. It lists the active workspace's worktrees and switches, creates, and removes them; removing one with uncommitted changes asks before forcing. The new-session screen also gets a worktree picker under **Workspace** when the selected workspace has more than one worktree. Switching in either place moves the folder where new sessions start and leaves the open session alone. While a session is open, Explorer, Git, and open files show that session's folder. The workspace list no longer shows a branch selector beside each workspace name.
- Keep the sidebar's action menus inside the screen on phones and at larger interface scales.
- The **Agent environment variables** editor in Settings → System & Updates now sits below its title and description and follows the page width, instead of sitting beside them and extending past the right edge. The text box also grows with its contents.
- Show queued steers and follow-ups on every device viewing a session. The queue panel now shows omp's own queue (omp 18.4.4 or later) instead of a copy kept by the tab that sent them, so it also stays correct across reloads.
- **Stop** no longer loses a queued steer or lets the agent run it anyway: as with Esc in omp's terminal, every message still waiting in the queue moves back into the composer. With omp's `abort_and_restore_queue` (newer omp), omp takes the queue back and aborts in one step, which also covers a steer you just promoted that this page's queue had not caught up with, and one the model already picked up through live steering (for example OpenAI models with `providers.openaiLiveSteering`). If that request fails, Stop retries it once and warns when the messages may not have come back. Older omp (18.4.4 or later) falls back to removing each message the page lists before the abort; there, a steer the page does not list or the model already took still runs after Stop, and attached images are dropped.
- Long voice transcriptions no longer fail with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` behind a reverse proxy. The server now keeps the recording and transcribes it as a background job (up to about 5 minutes) while the browser polls short requests, so proxy timeouts no longer cut off a slow STT endpoint. The job survives the recording browser disconnecting: any browser showing the same session picks it up, can play the recording and retry a failure, and the transcript is inserted in exactly one browser. A **Transcribe and send** (or queue) choice stays with the job, so the transcript is still sent after you switch sessions and come back; if the agent is running by then it is queued as a follow-up, and a queue choice whose run has ended is sent. Another browser that finishes the job only inserts the text. **Transcribe and send** from the review deck now sends too. Recordings stay on the server (in memory) for up to an hour or until inserted or discarded. Anyone who can reach the omp-web API can list, play and retry those recordings by session, so set `OMP_WEB_PASSWORD` when omp-web is reachable by others.
- Sending a message to a live session no longer fails with **HTTP 404** when the session's transcript cannot be read. An empty baseline is used instead, so the prompt is still delivered. The previous behavior is what surfaced as `Failed to send message: HTTP 404` on sessions created by slash commands.
- The Skills page lists exactly what omp resolves, through `omp skill list --json` (omp 18.3.3 or later): plugin, custom-directory and registry skills appear, and colliding names show as `namespace/name`. Skills that live outside omp-web's skill folders, such as plugin installs, show a disabled toggle because an update would undo the edit. Older omp binaries keep the built-in scan.
- On phones, the top bar's **⋯** menu no longer repeats the session name already shown in the title, and its theme and language pickers open fully instead of being cut off at the bar's edge.
- **Resume running sessions after a restart** no longer resumes sessions that another running omp-web instance (for example a dev server sharing the same agent directory) is still running. Previously the second instance started duplicate agents that ran alongside the originals and wrote to the same session files.
- On phones and tablets, the first time the file panel opens it now takes keyboard focus, closes with Escape, and keeps Tab inside the panel, like every later open. Previously the first open left focus on the toggle button and ignored Escape. Closing the panel after that first open also returns focus to what opened it, such as a file link in the chat, instead of the page body.
- The Git side panel now honors `.gitattributes`: changed files marked `linguist-generated`, `linguist-vendored`, `linguist-documentation`, or `-diff` move into a collapsed "files marked in .gitattributes" group below the main list, and the panel previews the first unmarked change. `-diff` files show that their diff is suppressed, including untracked ones, instead of a generic "Diff unavailable". Files with the `binary` attribute stay in the main list.
- Stop showing tool paths such as `history://…`, `proc://…` and `local://…` as file links. They are resolved by omp, and clicking them opened an "Access denied" viewer tab. `http://` and `https://` paths passed to `read` now open the URL in a new browser tab instead.
- omp-web no longer exits when a browser disconnects in the middle of a POST request, for example when a tab closes while a request is still in flight. A Next.js bug (vercel/next.js#99278) could turn that disconnect into an uncaught `Error: aborted`, which the crash handler treated as fatal. These disconnects are now logged to `diagnostics.log` as `client-abort` and the server keeps running; every other uncaught error still exits.
- When `PI_CODING_AGENT_DIR` points away from `~/.omp/agent`, the crash journal (`diagnostics.log`) is written to `<agent dir>/omp-web/` instead of `~/.omp/omp-web/`, so isolated test and development servers no longer write to the real journal.
- Slide the file panel in from the right edge on phones, with the same timing as the left sidebar, instead of popping it open full-screen. The first open slides too, without a **Loading…** placeholder or a dimmed backdrop flashing over the chat. The panel still covers the whole screen once open, and it opens and closes instantly when reduced motion is enabled.
- On mobile, move the session information control (context ring with stats, tokens, cost, and **Compact context**) to the top-right of the top bar; desktop keeps it in the composer toolbar. Preserve the ring usage coloring, its popover, and the `/session` shortcut. Opening the panel moves focus into it; Escape dismisses it before run shortcuts and returns focus to its opener when focus is still within the panel.
- Make the mobile workspace sidebar full-screen without a dimmed backdrop, with a visible top-left close button. Place the file-panel opener inside the upper bar and add a separate top-right close button inside the file panel, with keyboard focus returning to its opener. Keep the session-title pill centered between the header controls.
- Continue the mobile file-panel tab-row border underneath its close-button cell, so the divider spans the full width.
- On mobile, swipe anywhere on the app surface: swipe right to open the left sidebar or close the right one, and swipe left for the opposite action. No device-edge start or perfectly straight movement is required. Recognition follows overall dominant-axis displacement and tolerates curved thumb movement, a brief corrective start, and shorter deliberate drags. Taps, predominantly vertical movement, multi-touch, text editing or selection, native horizontal scrolling, and open popups retain their normal behavior; persistent drawer lists, including Git changes, remain swipeable. Embedded previews retain native input and full width; swipe on their surrounding toolbar to close the sidebar.
- Let the centered session-title pill fit its content and grow for longer names up to the available header space, instead of stretching short names into a fixed-size box.
- Keep **Collapse input** available after expanding a long user message with **Show full input**, so the message can be collapsed again.
- Agent host tools (`open_url`, `notify`, `open_file`) no longer fail when you switch to another session mid-run. Any open omp-web tab now answers them, and a URL or file from a session you are not viewing opens only after you confirm it in a dialog.
- Ask before opening links from the agent. Turn on **Open agent links without asking** in Settings → Interface & Behavior to open links from the session you are viewing right away; links from other sessions always ask.
- An attached ask panel no longer steals focus after it opens. Typing in a question's **Other** box no longer selects the first option when the text begins with a space, and focus is never pulled back to a radio button once you have moved on.
- Keep every assistant reply visible in the chat. **Process details** now folds only the activity between replies (thinking, tool calls, notices), so a reply that ended a turn is no longer hidden when a background job or reminder resumes the agent.
- Honor omp's **Hide Thinking Blocks** setting in the chat, and rename the toggle from **Thinking Blocks** so its label matches what it does.
- Start system reminders, async job results, and late LSP diagnostics collapsed to their first line. Click the header to expand; reminder headers show their attributes, such as `reason` and `rule`.
- Create a folder in the current directory from the **Select directory** picker (folder-plus button next to **Go**). The picker then opens the new folder so it can be selected right away. Names must be a single folder name; an existing name is reported instead of reused.
- Replace the pulsing dot in the running status bar (and the minimized composer bar) and the brain icon on thinking rows with a DSH-style whale tail. It sways while the agent runs and while a thinking block is still streaming, and rests otherwise. Choose the motion in Settings → Interface & Behavior → **Whale tail animation**, where each option plays a live preview: official sway (default, one loop per 4 s), flipping tail, side sway, twist, or still. Reduced motion keeps it still; Safari shows the still tail because it cannot animate SVG path shapes in CSS.
- Click the generation-speed pill in the top bar to open a bar chart of the last 20, 50 or 100 requests' t/s, with the mean, token-weighted mean, median, P10/P90, min/max, standard deviation, mean time to first token, mean speed after the first token, and total output tokens beside it. Hover, click or use the arrow keys to see one request's time, output, duration, time to first token and model.
- Pin workspaces to a **Pinned** section at the top of the sidebar from the workspace **⋯** menu (**Pin to top** / **Unpin**). Drag a workspace header to reorder: an accent line shows where it lands, and dropping it among pinned workspaces pins it (among the others unpins it). While dragging, an empty section shows a **Drop here to pin** / **Drop here to unpin** target. The new order shows immediately and is saved to `projects.json`; **Move up** / **Move down** stay within the workspace's section.
- The **Running only** toggle in the sidebar's Workspaces header is now a **Filter** menu: status (running, unread, exited unexpectedly; any selected status matches) and last activity (any time, active in 24 h, active in 7 days; running sessions count as active), each with its session count, plus **Reset filters**. The button shows how many filters apply, and applied filters appear as removable chips under the header. Workspaces without a matching session are hidden while a filter applies.
- **Send later**: the clock button beside Send schedules the composer text for 30 min / 1 h / 2 h / 5 h, a chosen date and time, or one minute after the current model's 5-hour quota resets (one option per account, from the provider usage report). The omp-web server sends it, so it goes out with the page closed and survives a restart (a message that came due while omp-web was down is sent when it starts). If the agent is running at that moment, it is queued as a follow-up. Scheduled messages show above the composer with **Send now** and cancel; a failed send stays there with its error and **Retry**. Text only, up to 30 days ahead, for sessions that already exist.
- **sudo from agent commands asks you in the web UI** (Linux). When an agent command runs `sudo` and a password is needed, every open omp-web tab shows a dialog with the verified sudo command line and its prompt; the typed password goes straight to that sudo, never to the model, and is not stored or logged. **Refuse** (or closing the dialog) makes that sudo fail; a request expires after 4 minutes, and with no tab open it is refused at once so the command does not hang. sudo itself still decides whether a password is needed and asks again after a wrong one. omp-web puts a small `sudo` wrapper first on the agent's PATH that adds `-A`; calls that already pass `-A`, `-S` or `-n` are left alone. Requests are accepted only from omp-web's askpass client running directly under a root `sudo` process, so an agent cannot just call the endpoint to show a fake prompt. Over plain HTTP, use it only on a trusted network or VPN.
- **Image generation is on by default** for omp-web sessions: omp's `generate_image` tool (off by default in omp) is enabled through a `--config` overlay (`bin/omp-web-defaults.yml`) unless `generate_image.enabled` is set in `~/.omp/agent/config.yml` or the workspace's `.omp/config.yml`. Settings → Extensions & Tools → **Image generation** turns it off or on (saved to config.yml); it applies to sessions started or restarted afterwards. It needs an image-capable account (OpenAI or a ChatGPT/Codex subscription, Antigravity, xAI, Gemini, OpenRouter or DeepInfra). A terminal `omp` is unaffected unless you change the setting.
- **"Needs you" bell** at the top of the sidebar, next to the archive button. It rings and shows a count whenever an agent is waiting on you: a choice, confirmation, text input, question set, link to open, or a sudo password, across all sessions. Click it to see what is waiting (what is asked, which session, how long ago); click an entry to jump to that session, where the question is shown above the input. The browser tab title shows the count, e.g. `(2) ompweb - omp web`. The sidebar toggle shows a dot while the sidebar is closed. A background tab also gets a system notification for each new question, if notifications were already allowed for omp-web.
- **Terminal** tab in the right panel, next to Explorer and Git (or press **Ctrl+`**, which closes it again). It opens a real shell (your `$SHELL`) in the current workspace, with colors, full-screen programs (vim, htop) and resizing. **+** opens more terminals; each tab shows its folder and can be closed with ×. Terminals keep running when you reload the page or switch tabs, and every open browser tab sees the same ones; they end when closed or when omp-web stops. Select text and press **Ctrl+Shift+C** to copy (plain Ctrl+C interrupts the command); paste with Ctrl+V. It needs the `node-pty` module, which is built during install on Linux (make, g++ and python3 must be available); without it the tab says so and the rest of omp-web is unaffected.
- **System** tab in the right panel, next to Terminal: a live dashboard of memory (used, free, swap, and the guard's warning and action lines), CPU and load, the omp-web server's own memory, and memory per agent session and terminal with the largest commands each is running (each has a **Stop** button). It also holds the **memory guard**: when free memory drops below a share of RAM (6% by default; Linux only), omp-web stops the largest process an agent session or terminal started (SIGTERM, then SIGKILL if it does not exit or memory is critical), before the kernel's OOM killer can hit something worse. The chat gets a notice, a running agent gets a steering message telling it what was killed and not to rerun it unchanged, and a terminal prints a line. omp-web itself and programs outside agents and terminals are never touched. Settings (on/off, action and warning lines) and the last 30 actions are on the tab; the tab shows an amber dot while memory is in the warning band. Agent processes and terminal shells now also get a higher kernel OOM score than the omp-web server, so if the kernel does have to kill something, it prefers agent work.
- **Scheduled tasks**: the calendar button at the top of the sidebar (next to the bell) opens a window listing every scheduled task, with its trigger, next run, prompt and recent runs. A task sends a prompt to one of two places. **A new session each run** (in a workspace you pick, with an optional model, thinking level and advisor): each run is a session named after the task and the run time, so every run keeps its full transcript; only the newest runs stay in the sidebar (10 by default) and older ones are archived (restorable from the archive); a run still working after the time limit (60 min by default, 0 = none) is stopped. **An existing session**: pick a workspace, then one of its sessions (defaults to the open chat); each run is sent into that chat as a new message. Triggers: every day at a time, on chosen weekdays, every N minutes/hours, once, or **when a webhook is called**. A webhook task gets a secret URL (`POST /api/hooks/<token>`, shown with a copy button and a curl example); every POST runs the task. The URL is the only credential and works without the omp-web password, so treat it like one; **New URL** revokes the old one, and switching the task to another trigger revokes it too. Optionally the request body (up to 16,000 characters) is appended to the prompt, marked as external data. Busy target sessions receive messages through OMP's native follow-up queue; new-session runs start independently. Runs missed while omp-web was down are made up once at startup. Recent runs show whether a run was manual or came from the webhook. Click a run (or the target session) to open it. Times use the omp-web server's time zone. **Run now**, pause (Enabled), edit and delete are on each task; deleting a task keeps its sessions. Like Send later, tasks run with the page closed, and two omp-web servers on one agent directory would both run them.
- **Agents can schedule messages to themselves** with a new `scheduled_tasks` tool (create / list / cancel), answered by the omp-web server so it also works with no browser tab open. The main use is waiting for long jobs without polling: the agent creates a one-time **wake-up URL**, starts the job (e.g. in tmux) so that it POSTs the URL when it ends, and finishes its turn; the POST wakes the same session with the request body (exit code, log tail) appended as external data, queued as a follow-up if the session is busy. Agents can also set timed or recurring check-ins (once, every N minutes, daily, weekly). An agent can only send to its own session, has at most 10 such tasks per session, and can only list or cancel its own. One-time tasks remove themselves after delivering; an unused wake-up URL works once and expires after 7 days by default (30 at most). Agent-created tasks appear in the scheduled tasks window with an **agent** badge, where you can pause, edit or delete them. The URL points at this machine (`127.0.0.1` and omp-web's port), so the job must run on the same host.
- **Select directory** picker: the bottom now has two collapsible panels. **Favorite folders** lists saved folders; clicking one jumps the picker there (it does not select it), **Add current folder** / **Remove current folder** and the × on each row manage the list. Favorites are stored in `omp-web-settings.json` in the agent directory, so every browser sees them; the panel remembers whether it was open. **Launch options** (OMP profile, advisor, extra arguments) is collapsed by default and shows how many options are set.

### Fixes & Improvements

- Make composer-attached agent question cards collapsible through the entire header, including Enter/Space keyboard activation. Folding hides the questions and actions together, preserving selected answers, text drafts and scroll position; a new request expands automatically. Keep the header accessible above the scrollable body so long question sets leave room to revisit the conversation.
- Load shared select styles through the application stylesheet so component tests can import form controls in Node. Repair React callback dependencies and declaration order, keep scheduled-send clock checks outside render, and apply CommonJS lint rules to native `.cjs` tools while excluding private workstation directories. Replace DOM-object comparison failures with bounded boolean assertions in question regressions.
- Preserve executable Git modes for the Linux deployment script and web askpass launchers. The staging copy explicitly restores owner execution on these entry points after its permission-neutral copy, including checkouts on filesystems with synthetic executable bits.
- Start `async-result` notifications collapsed to a short preview. Custom-notice headers have a chevron and toggle expansion on click, Enter or Space, supporting repeated opening and closing; the preview also opens the complete plain-text output. Keep other custom notices initially expanded and preserve full-output copying.
- Fix missing eyes in Aemeath(R-18): parented layers now inherit the parent's parallax anchor as well as its depth, preserving local offsets instead of expanding them away from the scene center. Keep explicit child depth independent and preserve nested rotation/scale, eye animations and effects. Add regressions for face alignment, moving parent hierarchies and explicit-depth descendants.
- Fix “Access denied” when opening files from conversation activity: resolve relative tool paths against the originating session's workspace in both single and grouped rows, including workspace changes. Parse trailing read selectors while preserving Windows drive letters and literal filename punctuation; keep internal tool URIs as plain activity labels. Match external read references using the same path resolution, retaining exact-file, session-scoped read access and existing editing restrictions.
- Fix local attachments in chat and file previews: images retain their originating session, `file://` and parent-relative Markdown links open through the file API, and `artifact://` references resolve to that session's persisted artifacts. Preserve per-session authorization instead of exposing whole external directories. Failed image loads show the server's error (such as denied access or size limits) instead of only a broken-image icon.
- **Edit** on a sent message now really edits it. It only switched the displayed branch and put the text in the composer, but omp kept its place at the end of the conversation, so sending appended the edited message after the old one and its reply (the agent saw both). Edit now branches like omp's own `/branch`: a new session (shown under the original in the sidebar) holds the conversation up to just before that message, with the message text in the composer to change and send. The original session is kept unchanged. It is offered on every user message except the first, while no run is active.
- The composer's **Fast** toggle now appears for GPT models signed in through a ChatGPT/Codex subscription (`openai-codex`) and for Google Vertex, matching where omp actually applies its priority (fast) service tier. It was limited to the `anthropic`, `openai` and `google` providers, so subscription GPT models never showed it although omp supports fast mode for them. A model that declares its own service tiers now decides by itself.
- With a wallpaper, the System tab's cards and the Terminal tab (screen and terminal tabs) follow the wallpaper glass mode like chat messages and the file panel: glass in the default mode, the shared pane glass in frosted mode, see-through in clear mode. The terminal screen used to stay a solid block and the System cards had no backing at all.
- The Linux service no longer stops entirely when the kernel OOM-kills one agent command. systemd's default `OOMPolicy=stop` stopped the whole unit (all agents) whenever any process in it was OOM-killed; the generated unit now sets `OOMPolicy=continue`.
- Webhook, scheduled, and manual task triggers no longer get skipped while a session is busy or a previous delivery is starting. Existing-session tasks reuse the same native `follow_up` queue as chat messages; idle sessions receive a `prompt`. New-session tasks keep their independent-session behavior and no longer discard overlapping triggers. No separate persistent scheduler queue is introduced.
- Linux sessions with web sudo support now receive a system-prompt instruction to authenticate only through omp-web's browser dialog, including when older conversation history used a desktop askpass. Agents are told not to override `SUDO_ASKPASS`, collect passwords through chat/stdin/files, or fall back to GUI authorization after refusal, timeout, or unavailability; non-interactive `sudo -n` remains allowed. This is a soft instruction, not an OS sandbox. It applies when an OMP child starts or restarts, preserves workspace append-prompt text/files, and leaves standalone terminal OMP unchanged.

- Clicking a workspace in the sidebar now always opens that workspace's new-chat page. It used to do nothing while a session of that same workspace was open (it only worked when coming from another workspace or from a new chat).
- `OMP_WEB_DISABLE_AUTOUPDATE` now turns off only ompweb's own update check and in-app update. The OMP runtime is no longer hidden behind it: Settings → System & Updates shows the installed and available omp versions, and **Update now** runs `omp update`. A failed `omp update` is now reported with its error (it used to be shown as a success). After an update, the "Update now" flow no longer restarts every session, which used to kill agents that were still working: omp swaps its executable without disturbing running sessions, new chats start on the new version, and an open chat restarts onto it before its next message once it is idle. **Restart OMP sessions** still restarts everything at once.
- **Update now** for the OMP runtime no longer fails with a bare "The OMP update could not be started". When the update check before the install fails (for example the npm registry or a proxy is slow), the message now says why. The check also waits 45 s instead of 15 s, longer than omp's own 30 s registry timeout, so a slow registry reports omp's reason instead of being cut off.
- Toggling two native settings of the same group quickly no longer writes unrelated settings into that group of `config.yml`: while a save was in flight, the toggle merged the whole settings object into the section instead of the section itself.
- Restore workspace skill discovery, scope grouping, paths, descriptions, model-invocation switches, and custom installation. These controls now live in **Extensions & Skills → Skills library**, rather than a separate Skills tab.
- Messages sent during a run steer by default on phones too. The composer's run-time button showed **Queue** and always queued a follow-up, ignoring Settings → **Message during active run**, while Enter on desktop steered; the button now follows the setting and reads **Steer** or **Queue**. The **Steer** action on a queued follow-up now really moves it in omp (`remove_queued_message`, then `steer`; needs omp 18.4 or later); before, it only relabelled the queue panel and omp still delivered the message after the run. Attachments on that queued message are not carried over.
- The top bar keeps a single **Wallpaper settings** button; the glass mode, pause, mute, volume and system-audio controls moved into Settings → Wallpapers only.
- The top bar's average speed now uses omp's own per-request measure (output tokens ÷ request duration) for the last 32 requests, also after a reload. Previously a reload rebuilt it from timestamp gaps between messages, which skipped almost every request.
- Blur the wallpaper behind the **Select directory** picker and extension dialogs (frosted glass) instead of showing it sharp through the panel. Their fade-in animation had disabled the glass blur after it finished.
- Keep **Collapse input** available after expanding a long user message with **Show full input**, so the message can be collapsed again.
- Agent host tools (`open_url`, `notify`, `open_file`) no longer fail when you switch to another session mid-run. Any open omp-web tab now answers them. URLs from other sessions always ask; files from other sessions ask unless **Allow background sessions to open files in the side panel** is enabled.
- Ask before opening links from the agent. Turn on **Automatically open web links in the browser** in Settings → Interface & Behavior to open links from the session you are viewing right away; links from other sessions always ask.
- Render Nerd Font icons that omp sends when its symbol preset is set to Nerd (for example the multi-select **Done selecting** check mark) instead of empty boxes. The bundled symbols font (Nerd Fonts Symbols Only, SIL OFL 1.1, about 1.2 MB) applies only to Private Use Area codepoints and is downloaded only when a page shows one of these icons.
- Show late LSP diagnostic notices with their original line breaks, like async results, instead of collapsing them onto one line.
- Unexpected omp process exits now remain visible in the workspace and session sidebar until that session starts again, including the exit code or signal and the last stderr line.
- Show free-text answers to agent questions (the ask tool's "Other" option and other `promptStyle` editor requests) in the chat font instead of the monospace code font.
- Keep line breaks in agent dialog titles instead of running multi-line titles together on one line.
- Restore the Settings toggle track, which the 44px hit area had squeezed into a dot. Cap Settings dropdowns at half the card width with an ellipsis for long options, and stack them below their label at full card width on narrow screens.
- Give the top-bar theme picker the same padding and icon spacing as the language picker; its icon and arrow were squeezed into a 28px button.
- Improve phone and tablet ergonomics with safe-area-aware top chrome, a focus-trapped mobile workspace drawer, an actionable first-run workspace state, touch-sized sidebar actions, narrow-screen composer wrapping, clearer settings loading/retry states, and quieter streaming announcements.
- Keep the Extensions & Skills settings panel scrollable on desktop and touch layouts, including long MCP server and skill lists.
- Let non-native settings tabs render while the common OMP configuration loads, and show static MCP configuration before live status resolution.
- Give the new-session workspace picker a calmer destination card with a folder badge, stronger focus and hover states, a compact path context line, and touch-friendly spacing while retaining the native accessible select behavior.
- Defer the file panel and its Explorer/Git work until first use, use a fixed overlay for the file panel on tablet widths, increase mobile Explorer row height, enlarge Git touch targets, and keep compact session context available in the mobile overflow menu.
- Move focus into attached extension requests, contain keyboard focus in the custom extension terminal, and add a local retry action when a text file cannot be loaded.
- Add local retry actions and status semantics to Explorer, Git, and text-file failure states so transient workspace errors are recoverable without hunting for a toolbar refresh control.
- Defer Explorer and Git tab work until each tab is first opened, avoiding duplicate status requests and hidden-panel overhead while preserving visited tab state.
- Pause content fetches and file-watch connections for inactive file tabs, then resume them when the tab becomes active to reduce background network and rendering work.
- Defer the command-palette chunk until the first Ctrl/Cmd+K shortcut, reducing initial shell work while preserving the existing keyboard workflow.
- Add a visible command-palette action in the topbar overflow menu with the Ctrl/Cmd+K shortcut exposed to assistive technology, while keeping the palette chunk lazy.
- Replace the generic file-panel loading label with a shape-matched skeleton toolbar and rows, giving desktop and mobile users a stable visual handoff while the deferred panel chunk loads.
- Enlarge mobile file-search controls and add inline refresh actions to sidebar load failures, keeping the primary navigation recoverable without relying on the header icon.
- Keep the full-page Settings header clear of notches and home indicators, and enlarge its search, back, and close controls for touch devices.
- Add a localized **Return to latest message** control that appears when a long conversation is scrolled away from the bottom, with reduced-motion-aware scrolling and touch-sized mobile controls.
- Replace the sidebar’s generic loading label with shape-matched workspace/session skeleton rows for a calmer first paint on desktop and mobile.
- Clarify the mobile file-panel control by switching from a panel icon to an explicit close icon when the panel is open, while retaining the existing accessible toggle labels.
- Enlarge mobile session-search and composer attachment-remove controls so common mobile cleanup actions meet the same touch-target standard as navigation.
- Make the compact mobile topbar overflow horizontally navigable so the new command action, session context, and existing controls remain reachable instead of overlapping at narrow widths.
- Localize the command palette’s session-loading state instead of leaving English-only copy visible in Chinese and Japanese.
- Localize the workspace login title, password prompt, unlock action, and authentication errors for English, Chinese, and Japanese users.
- Localize composer attachment limits, skipped-file explanations, read failures, and running-agent attachment errors for English, Chinese, and Japanese users.
- Localize composer retry-abort and attachment removal labels so mobile cleanup and recovery actions match the active interface language.
- Close the mobile topbar overflow when launching the command palette from its visible trigger, preventing the menu from remaining open behind the modal.
- Add localized retry actions to image, audio, and document viewer failures so transient file-loading problems can recover without closing the file panel.
- Keep the login card clear of device safe areas, enlarge password and unlock controls for touch use, and retain the shared focus-ring treatment.
- Add localized inline retry recovery to workspace directory-picker failures, so mobile users can recover without closing the picker.
- Enlarge directory-picker profile, launch toggle, and extra-argument controls on touch devices for reliable workspace setup on phones.
- Enlarge mobile Settings navigation tabs and provider segmented controls to 44px targets, keeping the horizontal Settings header easy to traverse on phones.
- Localize the document viewer’s PDF type label so file metadata remains consistent with the selected interface language.
- Localize workspace-picker profile and extra-argument accessible labels for English, Chinese, and Japanese users.
- Enlarge archive-browser search and clear controls on touch devices for reliable session-history filtering on phones.
- Enlarge MCP refresh, server selection, add-server, config fields, and action buttons on touch devices for reliable mobile server setup.
- Localize MCP connection, enabled/disabled, off, and invalid status labels for English, Chinese, and Japanese users.
- Localize agent discovery error, warning, and fallback diagnostic messages for English, Chinese, and Japanese users.
- Announce agent discovery errors with alert semantics while keeping warning-only diagnostics polite, so assistive technology distinguishes failures from informational notices.
- Give the archive search clear action an explicit localized **Clear search** accessible label instead of reusing the dialog close label.
- Enlarge agent reload, unpack, create, search, list, copy, save, cancel, and remove controls on touch devices for reliable mobile agent management.
- Localize bundled, user, and project agent scope badges so agent metadata remains readable across supported languages.
- Announce MCP configuration load failures with alert semantics while retaining polite status announcements for live-status connectivity notices.
- Expand the Settings switch hit area to 44px while preserving the existing 40×24 visual track and focus behavior.
- Replace the text-file viewer’s generic loading label with shape-matched skeleton lines and semantic busy state for smoother first paint.
- Replace the conversation session-loading label with shape-matched skeleton lines and semantic busy state for a calmer chat first paint.
- Enlarge the conversation session retry action on touch devices so a failed session can be recovered reliably from mobile.
- Expose Explorer directory and search loading state through `aria-busy`, improving assistive-technology feedback while mobile file navigation remains touch-friendly.
- Replace the initial workspace-validation label with a shape-matched skeleton and semantic busy state for a calmer first paint.
- Show the Ctrl/Cmd+K shortcut in the command-palette toolbar trigger’s tooltip while retaining the existing accessible shortcut metadata.
- Give the archive search input an explicit localized accessible label instead of relying on placeholder text alone.
- Refresh the OMP version shown in new sessions after a CLI update without requiring an omp-web server restart. Reuse results while executable metadata is unchanged, with a five-minute fallback expiry for launchers. Keep the last known version visible between visits and distinguish initial loading from an unavailable runtime.
- Add `OMP_WEB_DISABLE_AUTOUPDATE` to skip npm/OMP update checks and block in-app self-update actions, preserve the setting in service installers, and show the disabled state in Settings.
- Return browser host-tool and host-URI results as fire-and-forget frames while preserving OMP's original request ID, preventing `open_file` and clipboard bridge calls from hanging.
- Restore copy-success feedback after React Strict Mode re-runs effect setup.
- Cancel queued messages in OMP before removing their chips or recalling them for editing. Failed or timed-out cancellation leaves the message visible; successful recall survives composer remounts without losing newer typing. Requires native `remove_queued_message` support.
- Preserve question-dialog answers and selections when an SSE reconnect replays the same pending request or answer submission fails.
- Keep sent-message copy, edit, and fork actions visible without hover or a reveal tap. Also keep file mention/download, Git open-file actions, and sidebar menus visible alongside their metadata; wrap message actions on narrow screens.
- Expand complete tool inputs inline, including multiline code and edit patches, while keeping command previews compact and output visibility unchanged.
- Keep composer controls compact, with matching action-button sizes and model names truncating before short effort labels. On narrow layouts, the three running-input actions move together to their own row rather than overflowing.
- Align the + button and primary action with matching composer insets.
- Recover saved responses before reporting an empty agent reply after returning to a backgrounded page or PWA. Preserve provider errors and distinguish new runs from older answers.
- Catch up missed conversation entries incrementally after reconnecting or returning to the page, including during active runs. Restore quiet partial responses and live tool output without duplicating history or overwriting newer updates.
- Send prompts with image attachments in full again: commands reach OMP as one unchunked JSONL record. Protocol-v2 `rpc_chunk` framing is outbound-only, so any prompt over 1 MiB was rejected as `Unknown command: rpc_chunk` and reset the session after the prompt-ack timeout.
- Replace the message-level **New session** action with **Rewind**: fork before the selected user prompt (including the first), restore its text and image attachments as an editable draft, and leave the original history and its draft intact. Replies rewind to their turn's user prompt. Reject rewinds during active runs, ignore duplicate clicks, and surface failures. This changes conversation context only, not workspace files; attached terminal/Telegram owners retain their existing session-switch restrictions.
- Keep intentional OMP cancellations (`stopReason: "aborted"`) distinct from provider failures: retain the message's stopped-by-user status without reporting the cancellation as a failed response.
- Count subagents, advisors, `/tan` clones and extension helper sessions in Settings → **Usage**. Their model usage lives in transcripts inside each session's artifacts folder, which the Usage page never read. It counted only subagent summaries in `task` results, and background subagents leave those empty. These transcripts now count toward the session and project that own them. History copied by `/tan`, `/fork` or a branch counts once and moves to a remaining copy if the original is deleted, and a `task` summary counts only when no copy of its subagent's transcript exists. The `local://` scratch folder is not scanned. The usage cache rebuilds once on first load; when another omp-web version shares it, files that version synced are re-read.
- Show every tool call as its own row. Collapsing a finished turn's process details no longer merges tool calls from separate assistant messages into a single row, and parallel calls are no longer folded behind a summary header such as "Searched 2 times".

---

## [v0.5.0] - 2026-09-12

This release brings live tool-output streaming, a workspace picker for new sessions, voice dictation, new themes, an activity timeline with transcript export, and a redesigned settings experience.

### Highlights

- **Live tool output**: Tool calls now show a running indicator with streamed output while the tool executes, instead of a dead row awaiting the result.
- **Workspace picker for new sessions**: Choose the destination workspace directly above the new-session composer, with workspace names, exact paths, and worktree preservation.
- **Voice dictation**: Provider-agnostic speech-to-text dictation in the composer.
- **New themes**: OMP Midnight plus popular light and dark palettes with previews and CommandPalette support.
- **Activity timeline**: Activity group summaries, a minimap rail, and transcript export.
- **Composer upgrades**: Plus menu, context-ring gauge, context detail panel, and a `/loop` command to repeat a task up to N attempts.
- **Redesigned settings**: Full-page centered layout with a provider grid.
- **Long-session stability**: Targeted cache invalidation, oversized-file handling, better error surfacing, and render optimization.

### Fixes & Improvements

- Keep Cancel and Submit reachable in mobile extension questions by scrolling long questions and answers above a fixed action row and sizing the editor for short viewports.
- Confirm session deletion and workspace removal in dialogs on desktop and mobile. Cancel leaves data untouched; workspace removal keeps files and sessions.
- Center the workspace/session breadcrumb over the conversation column, and keep mobile generation speed and file-panel controls clear of the panel toggle. Explorer actions now have a separate touch-sized toolbar on mobile.
- Keep the top bar on one row with a fixed-width speed readout: compact units such as t/s, kt/s, and Mt/s, and a same-width ~ marker for average speed. The full rate remains in the tooltip; the whole pill hides when it cannot fit, without clipping or scrolling.
- Keep the fixed-width speed readout visible on narrow screens, including 320px: show theme, language, history, branches, and system controls directly when their measured widths fit beside any visible speed readout, and use a More disclosure otherwise, without shrinking touch targets. New-session screens do not reserve space for an absent readout.
- Open the language menu to the right of its left-side toolbar trigger so all options remain visible in the mobile More disclosure and the desktop header.
- Keep resized file panels and their contents inside the window at intermediate widths and non-default interface scales, wrapping file and Explorer actions when space is tight.
- Keep session action menus visible on touch devices beside fixed-width, right-aligned timestamps, with larger tap targets and titles using the remaining row width.
- Keep workspace header action menus visible on touch devices without first selecting or expanding the workspace.
- Keep provider and OMP System navigation in one horizontally scrollable row on narrow screens, and keep Save and Cancel in normal flow with inline save errors.
- Hide the Steer action when the only queued message is already a steer, matching the expanded queue while keeping Edit and Delete available.
- Keep the theme picker inside the mobile viewport by opening it to the right of its toolbar anchor.
- Match browser and installed-app chrome to the selected theme, with OMP Midnight as the launch fallback.
- Open the conversation sidebar on Back before leaving in narrow, overlay-sidebar layouts. On every layout, warn before Back, reload, or close can discard unsent text or attachments. Cancel keeps the current conversation and drafts; switching conversations still preserves drafts.
- Keep unsent-content confirmation active across consecutive Back presses on Android Chrome, including after switching to a new session.
- Some installed browsers cannot close a directly launched app programmatically. After confirming Leave, use native Back or Close if prompted. Chrome may bypass sidebar-first Back until the first interaction after launch, and Android process termination can bypass page warnings.
- Show app-close guidance only in standalone installed apps, never in ordinary browser tabs.

---

## [v0.4.2] - 2026-09-02

### Fixes & Improvements

- Handle provider daily usage windows and Windows npm spawn shells in the self-update flow.

---

## [v0.4.1] - 2026-09-02

### Fixes & Improvements

- Surface quota 429 RESOURCE_EXHAUSTED errors persistently instead of stopping silently.
- Pin the live agent status bar to the top edge of the composer.
- Keep the running indicator visible on selected/hovered sessions.

---

## [v0.4.0] - 2026-09-02

This release adds native autostart services, self-updates, a redesigned top bar, usage analytics, and composer upgrades.

### Highlights

- **Native autostart**: Windows Task Scheduler service, system tray manager, desktop shortcuts, and macOS launchd installer.
- **Self-updates**: Durable auto-update for OMP and omp-web with unified notifications.
- **Top bar redesign**: 3-zone layout with centered breadcrumb, provider cards, and zoom-aware menus.
- **Usage analytics**: Dashboard with persistent SQLite store plus provider usage limits.
- **Composer upgrades**: Tool preset picker, collapsible input, file search in the Explorer, and workspace-level OMP launch arguments.

---

## [v0.3.6] - 2026-08-28

This release adds workspace renaming and reordering, improved context compaction views, prompt queue expansion, and clear network startup banners.

### Highlights

- **Workspace aliases and reordering**: Give your workspaces friendly names and drag-and-drop or use keyboard shortcuts to reorder them in the sidebar.
- **Inspect past context**: Browse full conversation history from before compaction occurred, with accurate before-and-after token counts and compaction method indicators.
- **Queued prompt expansion**: Expand and review queued follow-up prompts before they are sent to the agent.
- **Interactive questions in composer**: Respond to interactive questions from extensions directly inside the chat composer.
- **Accurate live stats**: Live generation speed (tokens per second) is now pulled directly from the agent runtime, and cache hit rates are displayed in both the top bar and session info panel.
- **Helpful network startup banner**: When starting omp-web, the terminal now displays clear, clickable local, LAN, and Tailscale network addresses.
- **Complete Chinese settings localization**: Fully translated Settings, Models, MCP, and Agent configuration screens with smooth hydration.

### Fixes & Improvements

- Fixed the session details popover from getting cut off or hiding message and token numbers.
- Pressing Escape inside popups or dialogs now closes only the dialog without stopping the running agent.
- Tooltips now display properly above open dialogs and modals.
- Enhanced keyboard navigation visibility in the command palette.
- Made archived session recovery safer and improved session file caching on Windows.

### Contributors

Thank you to the contributors who made this release possible:
- @2740653660

---

## [v0.3.5] - 2026-08-21

This release introduces an archive browser for past conversations, live tracking for external CLI sessions, per-chat advisor controls, and a cleaner chat timeline.

### Highlights

- **Archived session browser**: Browse and search archived conversations in a dedicated panel, and restore them anytime without losing data.
- **Live external sessions**: Sessions started directly from the `omp` command-line now show up in the web interface and stream their responses live.
- **Per-chat advisor mode**: Turn the advisor agent on or off for individual conversations, with settings remembered per chat.
- **Cleaner tool-call timeline**: Tool calls and agent reasoning steps now display in a compact, organized timeline with expandable details and side-by-side file diffs.
- **Live speed indicator**: See real-time token generation speed while the agent is responding, along with average speeds for past turns.
- **Simplified model & reasoning pickers**: Redesigned selectors make choosing models and thinking levels quicker and easier on both desktop and mobile.

### Fixes & Improvements

- Fixed focus handling so closing the mobile sidebar never traps keyboard navigation.
- Added web app manifest and icons for installing omp-web directly to your device home screen.
- Server-side network requests now properly respect `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` settings.
- MCP server credentials are now safely preserved when renaming an MCP server.
- Fixed crashes caused by incomplete or manually edited session files.

### Contributors

Thank you to the contributors who made this release possible:
- @gzaripov

---

## [v0.3.4] - 2026-08-20

This release brings persistent visual agent settings, stronger API safeguards, and improved MCP security.

### Highlights

- **Visual agent settings**: Configure agent behavior and visual preferences directly in Settings, with changes saved automatically.
- **Safer MCP credentials**: Project MCP server secrets and tokens are hidden from API responses while being safely preserved during updates.
- **Request size protection**: Added payload size limits to protect agent and file endpoints from oversized requests.
- **Smooth settings editing**: Prevented background settings refreshes from overwriting changes you are actively typing.

### Fixes & Improvements

- Standardized release builds on Node.js 22.
- Normalized line endings and file types across Windows, macOS, and Linux.
- Improved accessibility and visual feedback for interactive buttons.

---

## [v0.3.3] - 2026-08-18

This release improves model search, Windows workspace support, authentication reliability, and text display.

### Highlights

- **Searchable models**: Quickly filter and search through available models directly inside the model selector.
- **Smoother model catalog loading**: Efficiently loads large model catalogs without slowdowns or connection hiccups.
- **Windows drive picker**: Easily select and browse different drives and Git worktrees on Windows.
- **System prompt on demand**: The system prompt now loads on demand for a faster initial chat load.

### Fixes & Improvements

- Better handling of markdown frontmatter and metadata cards.
- Polished sidebar layout and improved text rendering for East Asian (CJK) characters.
- Fixed authentication handshake issues with newer agent versions.
- Safer fallbacks when a selected model is temporarily unavailable.

### Contributors

Thank you to the contributors who made this release possible:
- @flaribbit

---

## [v0.3.2] - 2026-08-17

This release introduces password protection for web access, a redesigned Settings experience, and CLI improvements.

### Highlights

- **Password protection**: Secure your web interface with simple password login and secure session cookies.
- **New CLI flags**: Added `--password`, `--help`, and `--version` command-line options.
- **Redesigned Settings**: Easily search through settings, manage endpoint presets, and configure models with a cleaner layout.
- **Live running sessions**: Running conversations stay clearly visible in the sidebar while keeping updates efficient.

### Fixes & Improvements

- Kept composer controls and thinking toggles accessible while the agent is running.
- Improved initial scroll positioning and prompt helper behavior.
- Fixed pulse animations and status indicators in dark and light themes.
- Polished active folder highlights on Windows systems.

---

## [v0.3.1] - 2026-08-14

This release brings a major redesign of the workspace sidebar and chat composer, along with wider layouts and accessibility fixes.

### Highlights

- **Redesigned sidebar**: Cleaner project grouping and clearer status indicators make navigating multiple projects effortless.
- **Redesigned composer**: Added a dedicated queued follow-up bar so you can queue prompts while the agent is busy.
- **Wider chat workspace**: Expanded the chat column to make better use of widescreen monitors.
- **Universal file attachments**: Attach any supported file type to your chat messages with helpful file icons.
- **Refined typography & details**: Polished code blocks, process details, and spacing across the interface.

### Fixes & Improvements

- Protected attachment reads against file access races and resource leaks.
- Improved file picker filtering and session discovery.
- Fixed sidebar project grouping issues caused by Windows path casing.
- Added proper cleanup for background event streams when switching tabs.

---

## [v0.3.0] - 2026-08-13

This release adds full agent control commands, keyboard shortcuts for models and reasoning, and explicit update notifications.

### Highlights

- **Interrupt & reply**: Stop a running agent response and immediately send a new prompt from the composer.
- **Retry from banner**: Retry failed responses with a single click directly from the error banner.
- **Keyboard shortcuts**: Quickly cycle through models and reasoning levels using handy keyboard shortcuts.
- **Queue mode controls**: Choose between steering and follow-up queue modes directly in the interface.
- **Update notifications**: Replaced automatic background updates with clear update notices and copyable terminal commands.

### Fixes & Improvements

- Smoother live streaming responses and better memory cleanup when sessions finish.
- Improved Windows path comparisons and Git worktree handling.
- Better color contrast, mobile layouts, and screen reader accessibility.

---

## [v0.2.9] - 2026-08-12

This release adds an image lightbox, smoother streaming for long conversations, and configuration safety improvements.

### Highlights

- **Image lightbox**: Click any image in chat to view it in full size, zoom in, or copy it to the clipboard.
- **Collapsible tool calls**: Your preference for keeping streaming tool calls collapsed or expanded is now saved.
- **Smoother streaming**: Long conversations now stream smoothly with significantly reduced lag and fewer unnecessary re-renders.
- **Custom reasoning levels**: Support for custom thinking and reasoning levels defined by external model providers.

### Fixes & Improvements

- Prevented older session data from overwriting newer runs during page reloads.
- Protected MCP configuration files with file locks to avoid corruption during simultaneous writes.
- Fixed upload and path issues on Windows network shares (UNC paths).
- Improved subagent transcript accessibility and retry behavior.

---

## [v0.2.8] - 2026-08-12

This release introduces a dedicated subagent workspace, pinned task plans, and improved session history recovery.

### Highlights

- **Pinned task & subagent panel**: Keep your todo task list and active subagents pinned right above the composer.
- **Live subagent details**: See real-time subagent status, active tools, retries, token usage, cost, and background task markers.
- **Subagent transcript viewer**: Open a dedicated dialog to view final results, live logs, or full transcripts.
- **History recovery**: Subagents from past conversations are now recovered from disk history when you reopen a session.
- **Clean task summaries**: Expanded task cards show concise summaries without cluttering the screen with raw logs.

### Fixes & Improvements

- Restoring a session from a URL now waits until the session is fully loaded.
- Kept project ordering stable and refined dropdowns and toast notifications.
- Improved subagent identifier validation, UTF-8 text handling, and accessibility.

---

## [v0.2.7] - 2026-08-12

This release improves self-update safety with automatic backups, verification, and rollbacks.

### Highlights

- **Safe updates with automatic backup**: Creates a backup before updating the app or agent runtime.
- **Update verification**: Verifies the newly installed binary and launches a test session before marking the update complete.
- **Automatic rollback**: Automatically restores the previous working version if an update fails, preventing broken installations.
- **Package manager detection**: Accurately detects whether you installed via npm or Bun and uses the right tool for the job.
- **Update history in Settings**: View the status and outcome of your latest update attempt directly in Settings.

---

## [v0.2.6] - 2026-08-12

This release expands project workflows, file attachments, subagent visibility, and chat customization.

### Highlights

- **Session import**: Safely import session files into any selected workspace.
- **File attachments**: Attach text and Markdown files directly to your prompts.
- **Searchable model catalog**: Browse and pick models from an expanded, searchable catalog.
- **Web slash commands**: Use convenient slash commands that work seamlessly with the agent.
- **Subagent activity**: Track subagent progress and refresh transcripts in real time.
- **Planning & goals banner**: See task plans and objectives pinned above the composer with live progress timers.

### Fixes & Improvements

- Unified color themes, status badges, and focus rings across all UI components.
- Hardened session import and background process restart behavior.
- Cleaned up assistant message layouts while keeping tool details easily accessible.

---

## [v0.2.5] - 2026-08-10

This release introduces managed project workspaces and improves task tracking and session reliability.

### Highlights

- **Managed project workspaces**: Manage projects in a resizable sidebar with persistent workspace registration and activity grouping.
- **Phase-based task tracking**: Track progress through multi-phase plans with live phase indicators.
- **Smoother session recovery**: Improved session file reading and chat state recovery after disconnections.
- **Reliable in-app updates**: Smoother and more dependable update checks.

---

## [v0.2.4] - 2026-08-10

This release improves streaming scroll stability and simplifies application updates.

### Highlights

- **Stable scroll follow**: Fixed chat scrolling so the view stays smoothly anchored as long responses stream in.
- **Reliable updates**: Streamlined the update flow to use standard npm packages for a smoother upgrade experience.

---

## [v0.2.3] - 2026-08-10

This release improves code readability and visual feedback during streaming.

### Highlights

- **Clearer code blocks**: Refined syntax highlighting and code block styling for better readability.
- **Smooth streaming scroll**: Fixed auto-scrolling behavior so you can comfortably read responses while the agent types.
- **Better completion feedback**: Improved status indicators when the agent finishes answering.

---

## [v0.2.2] - 2026-08-10

This release improves Windows startup behavior and updates project documentation.

### Highlights

- **Clean Windows startup**: Prevented background agent processes from spawning unwanted console windows on Windows.
- **Updated screenshots & config**: Refreshed application documentation, screenshots, and developer settings.

---

## [v0.2.1] - 2026-08-10

This is the initial public release of omp-web: a fast, modern browser interface for the omp coding agent.

### Highlights

- **Live streaming chat**: Converse with the agent with live streamed text, tool call cards, thinking levels, token counts, cost tracking, and context window gauges.
- **Session management**: Switch between conversations, fork threads, branch into alternatives, and restore sessions directly from URLs.
- **Integrated file explorer**: Browse project files with syntax highlighting, Markdown and Mermaid previews, live updates, diffs, and file mentions.
- **Image attachments**: Drag and drop, paste, or pick images to include in your prompts.
- **Comprehensive configuration**: Easily configure providers, models, API keys, OAuth logins, tools, reasoning intensity, system prompts, and skills from the web UI.
- **Productivity features**: Queue follow-ups, enable steering modes, play completion sounds, navigate with a minimap, and use on mobile devices.
- **Global CLI**: Launch easily via `ompweb` on Windows, macOS, and Linux with customizable host and port options.
- **Internationalization**: Full English, Chinese, and Japanese localization with built-in onboarding guides.

### Contributors

Thank you to the contributors who made this release possible:
- @19WAS85
- @AKAZIK-py
- @AyushDubey23
- @GodD6366
- @Kabochar
- @Li7777777
- @MonteNegroX
- @RizzoTho
- @Windrunner20
- @agegr
- @c54444263
- @fallleave001
- @hcnysa
- @huangyuxi99
- @hzdingxb
- @imxyanua
- @isWittHere
- @kaiwishc
- @kerwin2046
- @killersteps
- @kongdd
- @lc-git
- @levinwang6
- @lifu963
- @mike950523
- @molicherry
- @opsCar
- @robinwlive
- @shani-singh1
- @sleepinginsummer
- @sunqing78
- @tura-ai-agent
- @windli2018
- @xCss
- @xiaojueshi
- @zhudatou630
- @zzjcool
