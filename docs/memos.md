# Memos

Use the memo icon in the toolbar or the command palette. Plain `Insert` toggles
the panel, including from the chat editor. `Escape` closes it without stopping
the agent. Modified Insert shortcuts (such as Shift+Insert paste), key repeat,
IME composition and other open dialogs are left alone.

Notes support search, pinning, Markdown preview and Markdown download. Edits are
saved after a 600 ms pause and saving continues when the panel closes. Failed
saves retain the draft; a per-tab session-storage backup survives page reloads
where browser storage is available. Unsaved edits trigger the browser's standard
navigation warning. There are no scheduled reminders or automatic LLM actions.

The server stores notes atomically in `web-memos.json` under the OMP agent
directory (`PI_CODING_AGENT_DIR`, normally `~/.omp/agent`). Back up this file
when moving the server. All authorized clients of the same OMPWeb server share
the collection; this is not a separate per-account vault. Refreshing the list,
reopening the panel or focusing a clean panel reloads server changes. Conflicting
edits are not silently overwritten: keep the local version as a new copy or
explicitly load the server version. Deletion requires confirmation and a matching
revision. Invalid existing storage is reported rather than overwritten.

Limits: 200 memos, 120 characters per title and 20,000 UTF-16 code units per body.
Content is not added to chat prompts or sent to model providers.
