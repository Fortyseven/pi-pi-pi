# AGENTS.md — pi-pi-pi

## What this project is

pi-pi-pi is a **desktop GUI for the `pi` coding agent** (the `pi` CLI from earendil-works/pi).
It is a Tauri 2 app: a small Rust backend that spawns and drives `pi --mode rpc` child
processes, and a Svelte 5 frontend that renders the transcript.

Features: sessions grouped by project (sidebar), live transcript with streaming, live +
historical subagent runs, "edited files" pane with per-hunk revert, global session search,
package/MCP management, provider auth (opens a real terminal for interactive login),
per-model compaction settings.

Many Rust doc comments are in **Portuguese** (fork heritage); match the style of
the file you're editing.

## Repository layout

```
src-tauri/          Rust backend (Tauri commands) — the whole backend is 4 files
  src/main.rs       Tauri builder; canonical list of every #[tauri::command]
  src/rpc.rs        `pi --mode rpc` child process management
  src/sessions.rs   disk (session JSONL) + pi-CLI wrappers + platform utils (~2600 lines, unit tests)
  src/fonts.rs      system font enumeration (font-kit) for the settings pickers
  tauri.conf.json   window, CSP, bundle, ports
  capabilities/     Tauri ACL (core:default only)
ui/                 Frontend — Vite 7 + Svelte 5 (runes) + SASS
  src/App.svelte    layout skeleton; every top-level component
  src/main.js       entry; imports the two scss files
  src/lib/state.svelte.js   ★ THE app: one `S` $state object, ~4700 lines, /* ===== section ===== */ markers
  src/lib/tauri.js  `inv` (invoke) / `listen` (events) bridge with browser dev fallbacks
  src/lib/util.js   pure helpers (no DOM, no state)
  src/lib/markdown.js  safe markdown→escaped-HTML (output used with {@html})
  src/lib/copy.js   clipboard helper
  src/components/   TopBar, SessionTabs, Sidebar, MainView, RightPanel, DetailPanel,
                    SettingsModal, PkgsOverlay, ProviderPicker, ConfirmBar, FatalBar, PanelGrip
  src/components/rows/  transcript row renderers (User, Markdown, Tool, Think, Note, Ext; Row.svelte dispatches)
  src/app.scss      design tokens (:root vars) + shared element styles
  src/styles/transcript.scss  `.row.*` classes shared by main log and detail panel
capture/            standalone Rust protocol probe (`rpc-capture` bin). NOT part of the app
                    build; a proof-of-concept that captured `pi --mode rpc` subagent widgets.
docs/               nerd.png only
```

No CI, no justfile, no linter/formatter config. `ui/dist/` and `*/target/` are gitignored build output.

## How it works (the contract)

- **UI → Rust**: `inv("command", args)` = `window.__TAURI__.core.invoke` (withGlobalTauri is on).
  Rust returns mostly `Result<String, String>` — JSON built by hand with `format!` +
  `escape_json()` (a few commands, e.g. compaction/edits, use `serde_json::Value`).
- **Rust → UI**: events emitted per child line: `rpc-line` `(sessionId, line)`, `rpc-stderr`,
  `rpc-exit`. The _only_ listener is `attachListeners()` in `state.svelte.js` (section
  "RPC event listeners", ~line 4141). It routes by substring/JSON-parse of the line.
- **pi RPC protocol**: line-delimited JSON over the child's stdio. Boot commands are written
  in `start_session` (rpc.rs): `get_messages`, `get_state`, `get_available_models`,
  `get_available_thinking_levels`, `get_session_stats`, `get_commands`. Everything else goes
  through the generic `rpc_command` passthrough (frontend sends ready JSON: `set_model`,
  `set_thinking_level`, `compact`, `fork`, …). Prompts always carry
  `streamingBehavior: "steer"` so they queue mid-run.
  Extension UI sub-protocol (docs/rpc-extension-ui.md): dialog methods (`select`/`confirm`/
  `input`/`editor`) arrive as `extension_ui_request` lines and render as interactive rows
  (`ExtDialogRow`); the answer goes back as `extension_ui_response` — sent via `rpc_command`
  directly (NOT `sendCommand`, which would clobber the dialog's `id`), targeting the dialog's
  own session so background tabs can answer. Fire-and-forget methods (`notify`/`setStatus`/…) become
  ext rows; dialogs keep the row in the tab's `localRows` so they survive tab switches.
  ("extension UI dialogs" section of `state.svelte.js` + `handleExtUi`).
- **Sessions on disk** (pi owns them; the app only reads, plus delete-to-trash):
    - `~/.pi/agent/sessions/<project-group>/<stem>.jsonl` — session history; `stem` = the session id used in `pi --session <path>`
    - `<stem>/<childId>/run-N/session.jsonl` — subagent child runs
    - deletion moves to `<project-group>/.pi-pi-pi-trash/<stem>/` (never deletes)
    - per-project settings: `<project>/.pi/settings.json` (compaction overrides)
    - hooks instrumenting extension: `~/.pi/agent/extensions/pi-pi-pi-hooks.js` → log `~/.pi/agent/pi-pi-pi/hooks.log`
    - pi-subagents missions (read-only): `~/.pi/agent/missions/projects/<hash>/*.json`

## Where to make changes (the directory)

| I want to change…                                        | Go to                                                                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/remove a Tauri command                               | implement in `src-tauri/src/sessions.rs` (disk/CLI) or `rpc.rs` (process mgmt), then register in `main.rs` `generate_handler!`                                                                           |
| How `pi` is located / spawned / PATH                     | `pi_bin()` in `sessions.rs` (env override `PI_DECK_PI_BIN`) and `child_path()` / `start_session` in `rpc.rs` (fixes `spawn npx ENOENT` for MCP servers under systemd `--user`)                           |
| Sidebar tree / project grouping                          | `list_sessions` in `sessions.rs` (shape of the JSON) + "sidebar (project tree)" section of `state.svelte.js` + `Sidebar.svelte`                                                                          |
| Session search (text/tool/errors)                        | `search_sessions` in `sessions.rs` + "global session search" section of `state.svelte.js`                                                                                                                |
| Opening/closing/evicting sessions (tabs, MAX_LIVE=3 LRU) | "session lifecycle" + "S.tabs" sections of `state.svelte.js`; process kill via `stop_session` in `rpc.rs`                                                                                                |
| Transcript rendering / row look                          | `MainView.svelte` (log + scroll), `rows/*.svelte`, `styles/transcript.scss`; markdown via `lib/markdown.js`                                                                                              |
| Streaming / turn state / deltas                          | "streaming" and "RPC responses" sections of `state.svelte.js`                                                                                                                                            |
| Composer input, slash palette, Cmd-K global palette      | composer markup in `MainView.svelte`; "slash palette (per session)" and "global palette (Cmd-K)" sections of `state.svelte.js`; app/local commands list at ~line 1848                                    |
| Model picker, thinking levels                            | "models" / "thinking levels" sections of `state.svelte.js`; catalog comes from `pi_models` in `sessions.rs` (parses `pi --list-models`)                                                                  |
| Context window / compaction limits                       | "context window / compaction" section of `state.svelte.js`; `compaction_get/set` in `sessions.rs` (writes `<project>/.pi/settings.json`)                                                                 |
| Subagents pane (live + disk)                             | "subagent pane" section of `state.svelte.js`; disk runs via `list_children` in `sessions.rs`; live widgets arrive as `PI_SUBAGENT_ASYNC_JSON:` in `rpc-line`                                             |
| Files-edited pane, diff view, hunk revert                | `session_edits` / `revert_hunk` in `sessions.rs`; "files (edited) pane" + "S.detail panel" sections of `state.svelte.js`; `RightPanel.svelte`, `DetailPanel.svelte`                                      |
| Missions readout                                         | `missions_status` in `sessions.rs`; "missions pane" section of `state.svelte.js`                                                                                                                         |
| Packages / MCP / catalog / hooks UI                      | `PkgsOverlay.svelte` + "packages / MCP / catalog / hooks" section of `state.svelte.js`; CLI wrappers `pi_install`/`pi_remove`/`pi_mcp_*`/`hooks_*` in `sessions.rs`                                      |
| Provider auth / login                                    | `auth_status`/`auth_providers`/`open_terminal_login` in `sessions.rs` (note the shell-injection allowlist `LOGIN_PROVIDERS`); `ProviderPicker.svelte`; "provider auth" section of `state.svelte.js`      |
| Updating pi / extensions                                 | `pi_update` in `sessions.rs`; "pi CLI update" section of `state.svelte.js`                                                                                                                               |
| Settings modal, fonts, theme                             | `SettingsModal.svelte`; `fonts.rs` (font-kit); `applyFonts()` in `state.svelte.js`; tokens in `app.scss` `:root`                                                                                         |
| Panel widths / grip dragging                             | `PanelGrip.svelte` + "resizable side panels" section of `state.svelte.js`                                                                                                                                |
| Window title, CSP, ports, bundling                       | `src-tauri/tauri.conf.json` (dev port fixed at **1420**, matched by `ui/vite.config.js`)                                                                                                                 |
| Clipboard / file pickers / terminal                      | platform candidates in `sessions.rs` (`copy_text`, `pick_file`, `pick_directory`, `paste_image`, `open_terminal_login`); note `paste_image` deliberately probes `wl-paste --list-types` first (perf fix) |

## Running & testing

```bash
npm run dev        # tauri dev (builds the UI via beforeDevCommand, port 1420)
npm run dev:ui     # UI in a plain browser — no IPC; tauri.js fallbacks make it render
npm run build      # production build
cargo test --manifest-path src-tauri/Cargo.toml   # unit tests live in sessions.rs
```

- `PWUI_DEBUG=1` → `[rpc]` / `[rpc stderr]` / `[ui]` eprintln traces (Rust side).
- `PI_DECK_PI_BIN=/path/to/pi` → point the app at a specific `pi` binary.
- `PWUI_AUTONEW` is read by `debug_flags` for automated tests.
- Rust test pattern: pure `_in(...)` variants take an explicit root (`read_session_messages_in`,
  `revert_hunk_in`, …) so tests never touch `HOME` — follow this when adding testable logic.

## Invariants to preserve

- **Containment**: any path/directory arriving from the webview must pass
  `contained_in()` in `sessions.rs` (sessions read/delete/search; `open_file` and
  `revert_hunk` require containment in the session's `cwd`). Tests enforce this —
  don't add a file command that skips it.
- **Child process hygiene**: `Child` handles that fail to register must be
  `kill()`+`wait()`ed (`drop_child` in `rpc.rs`) — Rust's Drop does not kill.
  Window destroy calls `kill_all()`; `kill_orphans` (Linux `/proc`, `PI_DECK_CHILD=1`)
  cleans crashed parents at startup.
- **No content leakage to the webview**: oversized lines are dropped/capped
  (`MAX_LINE_BYTES`/`MAX_TOTAL_BYTES`, `MAX_PATCH_BYTES`), `revert_hunk` never returns
  file content, `paste_image` validates image magic bytes.
- **Markdown safety**: `lib/markdown.js` escapes everything before `{@html}`; only
  `http(s)` links survive. Keep it that way.
- **Browser-dev fallbacks**: `lib/tauri.js` must keep failing fast with readable errors so
  `npm run dev:ui` works without Tauri.

## Other

- Keep this document and README.md updated, where it makes sense, if new or changed features are introduced, to avoid drift.
