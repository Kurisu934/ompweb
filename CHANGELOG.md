# Changelog

All notable changes to **omp-web** (`@kahme247/ompweb`) are documented in this file.

---

## Unreleased

### Added

- Add wallpaper-library direction/type filters and natural name, added-time and modified-time sorting in both directions. Auto defaults to landscape on desktop and portrait on mobile; explicit choices persist per browser. Read bounded scene/media dimension metadata, honor EXIF/MP4 rotation, and keep unknown dimensions separately selectable.
- Add damped bone-spring simulation with authored axes, stiffness, damping, inertia, gravity and limits, plus SceneScript impulse/reset APIs. Actual Aemeath dragging now releases into spring return; regression coverage includes frame-rate independence, parent motion, limits and single-consumption impulses.
- Repair newly added scene compatibility: preserve embedded Matroska/WebM videos, retain scripted transform-only layers, implement sequence/control-point and vortex particle behavior, and translate HLSL remainder, scalar/vector conversions and mismatched varying widths. Surface shader linker diagnostics and invalidate older compiled manifests.
- Fix loading of the two Aemeath scene wallpapers: accept bounded PKGV0024 packages, decode modern unskinned MDLV0019/0023 meshes with their 48-byte vertex layout, and route default/background-copy composition layers through projected scene capture plus authored post-effects. Preserve explicit isolated-child composition behavior and bump the compiled-scene cache revision. Verified actual browser loading, eye-tracking image changes, and animation.
- Split Interface & Behavior's General subtab into **Interface layout** (tool-call collapse and sidebar usage visibility) and **Interaction behavior** (selection, automatic opening, sound/speech, submission, and completion), alongside Keyboard Shortcuts. Split **Instructions & Subagents** into independent **Instructions** and **Subagents** tabs with draft preservation. Migrate search targets, localized labels, and glass-surface navigation checks; retain existing settings keys and save behavior.
- Consolidate **Agents & Policies** (`agents`) into **Instructions & Subagents**, **Runtime policies**, and **Tool approvals** horizontal tabs. Move all 13 compaction/memory/autolearn/retry settings and the three native approval controls, preserving storage and automatic saves. Keep instruction/subagent drafts across subtab switches, route search to the right panel, and scope native-settings failures to runtime/approval panels. Remove the former `intelligence` and `safety` categories; update English, Chinese, Japanese, and navigation documentation.
- Merge **AI Model Defaults** into **Models & Providers** (`providers`) as a fourth horizontal tab beside connected accounts, custom providers, and model registry/routing. Preserve all five native defaults, automatic saves, registry save controls and provider drafts across subtab switches. Search selects Defaults; native-settings failures and model-file parse errors remain scoped to their own controls. Remove the old `models` category and update localized labels and navigation.
- Merge **Keyboard Shortcuts** into **Interface & Behavior** (`general`) with horizontal **General / Keyboard Shortcuts** tabs sharing Appearance's segmented navigation. Remove the standalone shortcut category and route setting search to the correct subtab. Browser-only preferences stay accessible while native OMP settings load. Existing shortcut bindings, recording, clear/reset, conflict hints and storage remain unchanged.
- Consolidate **Appearance & Personalization** (`appearance`) into provider-style horizontal tabs: **Theme & Display**, **Wallpapers & Glass**, **Pets**, and **Motion**. Move font size, interface scale, and whale-tail animation out of General; add theme selection using the existing topbar preference. Search opens the matching subtab, as do wallpaper and pet shortcuts. Tabs support arrow/Home/End navigation and horizontal scrolling on narrow screens; only the active panel mounts. Existing local preferences and asset libraries remain unchanged.
- Consolidate settings into **Extensions & Skills** (`extensions`): built-in image generation, MCP servers, and the Skills library share one page with searchable sections. The category remains available without a workspace; project MCP editing and skill management show workspace guidance. Remove the obsolete `mcp`/`skills`/`plugins` tab identities, normalization alias, unreachable plugin panel, plugin reload callback, unused component and translations. Installed plugins and the backend plugin API are unchanged.
- Add **Settings → Interface & Behavior → Allow background sessions to open files in the side panel**, directly below **Automatically open web links in the browser**. The distinct labels separate side-panel files from browser web links. Off by default and saved per browser, the file preference lets background-session requests open directly, leaving Settings if necessary. Requests from the viewed session continue opening directly. File authorization, editing permissions, link approvals and saved preference keys remain unchanged.
- Unify all form dropdowns with the shared Base UI selector: new-session workspace, settings, models/providers, agents, usage, wallpapers/BGM, pets and scheduled tasks. Both triggers and portaled option lists follow the wallpaper glass/clear modes, with keyboard navigation, disabled options and viewport-constrained scrolling. Scheduled workspace suggestions use the same material while retaining free-form paths; Escape closes the open dropdown without also closing Settings.
- **Settings → Agents → Custom instructions** manages server-wide, provider and exact provider/model prompt rules. Model rules replace provider rules, which replace the global rule; explicit empty text suppresses broader custom instructions and deleting a rule restores inheritance. The native OMP extension selects fresh rules at ordinary prompt preparation and queued-message dequeue, without interrupting a current response or replacing native/project/sudo instructions. Linked dropdowns select existing providers and their available models, clearing model selection when the provider changes; the card and controls reuse the shared wallpaper glass material. Includes effective-rule preview and unsaved-switch/delete confirmation. Existing children started before this upgrade need one restart to load the extension.
- Add basic right-panel text editing and Explorer file management. Text previews offer **Edit file**, explicit **Save**, reload, and return to preview; drafts survive tab/settings switches, unsaved tabs are marked, and closing/leaving warns before data loss. Content-revision checks reject external-edit conflicts without losing the draft. Saves atomically replace regular UTF-8 files up to 256 KiB, preserving normal permissions and LF/CRLF line endings; live previews continue observing successive replacements.
- Explorer root buttons and row right-click/ellipsis menus create files/folders, rename entries (updating open tabs), and permanently delete files or whole folders after confirmation. Dirty affected editors block rename/deletion. Mutation permissions remain restricted to authorized workspace roots, reject symlink escapes, and protect roots and their ancestors; chat-only external references remain read-only.
- **Saved rate-limit resets in the sidebar usage panel.** Codex and Claude rows show a ↺ badge with the number of saved resets; expanding the account lists each reset's expiry and a **Use reset** button. It asks for confirmation, then spends one through `omp usage reset` (which guards against other omp processes spending at the same time) and shows omp's result. Claude accounts explain when no reset can be used yet (Claude's resets only apply once a limit is reached). A refused or failed spend uses nothing.
- **Settings → Keyboard Shortcuts** manages all 21 application shortcut actions: record or remove bindings, clear an action, restore its defaults, search, and see overlapping bindings. Changes apply immediately, persist in this browser, and sync across its tabs; hints and accessibility shortcuts follow the saved bindings. **Stop agent is now unbound by default**, so Escape no longer stops a task from either the page or composer; the Stop button is unchanged. Menu/dialog dismissal, native editing/navigation, and terminal applications keep their standard keys.
- **Right-click menu** of omp-web's own in place of the browser's. Sessions: open, open in a new browser tab, rename, copy transcript (Markdown), copy session ID, archive, delete. Workspaces: new chat here, pin/unpin, rename, OMP launch arguments, copy path, **open in terminal**, move up/down, remove. Explorer entries: open/expand, mention in chat (@), copy relative/absolute path, download, open a folder in the terminal. File tabs: close, close others, close all, mention, copy path, reveal in Explorer, download. Messages: copy text, copy as Markdown, edit from here, fork a new session, read aloud; code blocks add **Copy code**. Selected text offers **Copy** and **Quote in reply** (appends it as a `>` quote to the composer). Anywhere else: new chat, command palette, sidebar, file panel, terminal, archived sessions, settings. Text fields, images, web links, the terminal screen, and touch long-press keep the browser menu; **Shift+right-click** always opens it.
- Add an off-by-default **Resume running sessions after a restart** setting in Settings → System & Updates. When omp-web restarts while agents are working, it restarts those sessions and prompts each with "Session interrupted and resumed. Continue as you would have done without the interruption." Work in progress at the moment of the restart, such as a running command, is lost. Do not also resume those sessions from a terminal while omp-web is down.
- Add **Copy** and **Copy as Markdown** below user messages and completed assistant replies, with keyboard access and touch-sized controls. Copy only message text, excluding thinking, tool output, and renderer controls; preserve full source for oversized raw-text messages.
- Scope Ctrl+A / Cmd+A to the selected message, currently loaded chat, or active file contents instead of the whole page. Message selection includes collapsed extension previews and expanded details without toolbar labels. Newer pane focus takes precedence over retained child selections. Text fields and IME composition retain native behavior; browser-menu commands and embedded viewers remain browser-controlled.
- Add an off-by-default **Scope native Select All (experimental)** switch in Settings → Interface & Behavior. The per-browser preference narrows whole-page selections from native menus while leaving keyboard scoping independent. Disable it if browser selection handles or menus behave unexpectedly; intentional whole-page selections can also be narrowed.
- Play back a voice recording before transcribing or sending it. Pause keeps a left-side preview control; Stop opens a review deck with play, discard, and transcribe-and-send.
- Link GitHub issue and pull-request references in chat messages. Bare `#123` links to the session checkout's GitHub repository (the `gh` default remote, else `upstream`, `github`, then `origin`); `owner/repo#123` links to that repository. Code spans and existing links are left unchanged.
- Show all of an agent's ask-tool questions in one panel, with checkboxes for multi-select, radio buttons for single-select (recommended option marked and preselected), and an **Other** free-text answer per question, submitted together. Requires an omp that supports `set_ask_dialog`; older omp keeps the one-question-at-a-time dialog.
- Allow binding to a network address without a password. ompweb then serves only loopback, private LAN/VPN (10/8, 172.16/12, 192.168/16, IPv6 ULA/link-local) clients that open it by IP address or `localhost`, checked at the connection, so a public website cannot reach it through DNS rebinding. Previously the launcher refused to start. Do not forward a passwordless ompweb through a tunnel or reverse proxy on the same host.
- Create a folder in the current directory from the **Select directory** picker (folder-plus button next to **Go**). The picker then opens the new folder so it can be selected right away. Names must be a single folder name; an existing name is reported instead of reused.
- Name provider accounts in the sidebar **Provider usage** panel so several logins of the same provider can be told apart. Expand an account row and choose **Set nickname**; the name replaces the account label on every pool row of that account, and the original label stays in the tooltip and the expanded details. Names are stored in `omp-web-settings.json` in the agent directory, so every browser sees them. Clear the field to remove a name.
- Replace the pulsing dot in the running status bar (and the minimized composer bar) and the brain icon on thinking rows with a DSH-style whale tail. It sways while the agent runs and while a thinking block is still streaming, and rests otherwise. Choose the motion in Settings → Interface & Behavior → **Whale tail animation**, where each option plays a live preview: official sway (default, one loop per 4 s), flipping tail, side sway, twist, or still. Reduced motion keeps it still; Safari shows the still tail because it cannot animate SVG path shapes in CSS.
- Click the generation-speed pill in the top bar to open a bar chart of the last 20, 50 or 100 requests' t/s, with the mean, token-weighted mean, median, P10/P90, min/max, standard deviation, mean time to first token, mean speed after the first token, and total output tokens beside it. Hover, click or use the arrow keys to see one request's time, output, duration, time to first token and model.
- Pin workspaces to a **Pinned** section at the top of the sidebar from the workspace **⋯** menu (**Pin to top** / **Unpin**). Drag a workspace header to reorder: an accent line shows where it lands, and dropping it among pinned workspaces pins it (among the others unpins it). While dragging, an empty section shows a **Drop here to pin** / **Drop here to unpin** target. The new order shows immediately and is saved to `projects.json`; **Move up** / **Move down** stay within the workspace's section.
- The **Running only** toggle in the sidebar's Workspaces header is now a **Filter** menu: status (running, unread, exited unexpectedly; any selected status matches) and last activity (any time, active in 24 h, active in 7 days; running sessions count as active), each with its session count, plus **Reset filters**. The button shows how many filters apply, and applied filters appear as removable chips under the header. Workspaces without a matching session are hidden while a filter applies.
- **Send later**: the clock button beside Send schedules the composer text for 30 min / 1 h / 2 h / 5 h, a chosen date and time, or one minute after the current model's 5-hour quota resets (one option per account, from the provider usage report). The omp-web server sends it, so it goes out with the page closed and survives a restart (a message that came due while omp-web was down is sent when it starts). If the agent is running at that moment, it is queued as a follow-up. Scheduled messages show above the composer with **Send now** and cancel; a failed send stays there with its error and **Retry**. Text only, up to 30 days ahead, for sessions that already exist.
- **sudo from agent commands asks you in the web UI** (Linux). When an agent command runs `sudo` and a password is needed, every open omp-web tab shows a dialog with the verified sudo command line and its prompt; the typed password goes straight to that sudo, never to the model, and is not stored or logged. **Refuse** (or closing the dialog) makes that sudo fail; a request expires after 4 minutes, and with no tab open it is refused at once so the command does not hang. sudo itself still decides whether a password is needed and asks again after a wrong one. omp-web puts a small `sudo` wrapper first on the agent's PATH that adds `-A`; calls that already pass `-A`, `-S` or `-n` are left alone. Requests are accepted only from omp-web's askpass client running directly under a root `sudo` process, so an agent cannot just call the endpoint to show a fake prompt. Over plain HTTP, use it only on a trusted network or VPN.
- **Image generation is on by default** for omp-web sessions: omp's `generate_image` tool (off by default in omp) is enabled through a `--config` overlay (`bin/omp-web-defaults.yml`) unless `generate_image.enabled` is set in `~/.omp/agent/config.yml` or the workspace's `.omp/config.yml`. Settings → Extensions & Tools → **Image generation** turns it off or on (saved to config.yml); it applies to sessions started or restarted afterwards. It needs an image-capable account (OpenAI or a ChatGPT/Codex subscription, Antigravity, xAI, Gemini, OpenRouter or DeepInfra). A terminal `omp` is unaffected unless you change the setting.
- **Choose the account per chat, and temporarily disable accounts.** When the current model's provider has several logged-in accounts, an account chip appears under the input next to the model and reasoning controls. **Auto** (default) lets omp pick by remaining quota and shows the account it last used; picking an account makes this chat prefer it. Settings → API Keys & Providers → Connected accounts → **Account rotation** lists those accounts with a **Temporarily disable** box: omp skips a disabled account while another account still has quota. Both go through omp's `auth.accountPolicies` (a chosen account gets top priority and its siblings are held in reserve; a disabled one is held in reserve). They are therefore preferences, not hard locks: an account that is out of quota or blocked still falls back to another, and a disabled account is used once all others are used up. A change applies from the chat's next message (an idle chat restarts its omp process first, which adds a few seconds once). In a new chat that has not sent its first message yet, a choice made after the chat was set up applies from the second message. A terminal `omp` is unaffected.
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
- Keep sent-message copy, edit, and fork actions visible without hover or a reveal tap. Also keep file mention/download, Git open-file actions, and sidebar menus visible alongside their metadata; wrap message actions on narrow screens.
- Expand complete tool inputs inline, including multiline code and edit patches, while keeping command previews compact and output visibility unchanged.
- Keep composer controls on one line, with equally sized Send, Stop, and Queue buttons and model names truncating before short effort labels.
- Align the + button and primary action with matching composer insets.
- Clearly dim Attach files while the agent is running; queued messages remain text-only.
- Recover saved responses before reporting an empty agent reply after returning to a backgrounded page or PWA. Preserve provider errors and distinguish new runs from older answers.
- Catch up missed conversation entries incrementally after reconnecting or returning to the page, including during active runs. Restore quiet partial responses and live tool output without duplicating history or overwriting newer updates.
- Send prompts with image attachments in full again: commands reach OMP as one unchunked JSONL record. Protocol-v2 `rpc_chunk` framing is outbound-only, so any prompt over 1 MiB was rejected as `Unknown command: rpc_chunk` and reset the session after the prompt-ack timeout.
- Show the **New session** fork action below agent replies as well as user prompts, so the newest message in a conversation can fork the session. omp's `branch` command accepts a user entry only, so each reply forks at the prompt that started its turn; replies with no earlier prompt keep no fork action.

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
