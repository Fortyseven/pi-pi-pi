// Central app state for pi-pi-pi.
//
// Ported 1:1 from the original monolith (ui/index.html @ git 1a23aaa): same
// behavior, same localStorage keys, same Tauri commands, same RPC routing.
// UI copy is in English; comments kept in English too.
//
// Conventions:
//  - `export let x = $state(...)`  → reassigned (Svelte tracks reassignment)
//  - `export const x = $state(...)` → object/array whose shape mutates in place
//  - plain (non-reactive) internals: Maps/Sets/one-shot timers
//  - DOM access goes through `S.refs` (set by components) or document lookups
//    for statically-rendered overlays (popovers, S.detail panel).

import { inv, listen } from "./tauri.js";
import { renderMarkdown } from "./markdown.js";
import {
    stripAnsi,
    prettyId,
    projectName as _projectName,
    contextLabel,
    fmtTokens,
    fmtCost,
    relTime,
    fmtElapsed,
    splitPath,
    summarize,
    nowTime,
    outputText,
    fuzzyScore,
    splitArgs,
    normForkText,
    parseSessionFile,
    PREFIX,
    extractSnapshot,
    parseInstalledSources,
} from "./util.js";

/* ================= constants ================= */

const LS = {
    tabs: "S.tabs-v1",
    collapsed: "collapsed-projects",
    hidden: "hidden-projects",
    expanded: "expanded-projects",
    settings: "ui-settings",
    models: "models-cache",
    lastModel: "last-model",
    levels: "levels-cache",
    commands: "commands-cache",
    recents: "palette-recent",
    catalog: "catalog:pi-package",
    pane: "panel-pane",
    subsHidden: "subs-hidden",
    treeInit: "collapsed-initialized",
    sidebarW: "sidebar-width",
    rightW: "right-width",
};

const MAX_LIVE = 3; // live pi processes before LRU eviction kicks in
const SESS_PAGE = 8; // sessions shown per project before "load more"
const STREAM_CAP = 30000; // streamed text shown before truncation marker
const DRAFT_CAP = 10000; // draft text kept per tab
const SEARCH_PAGE = 20; // search results per page
const RECENT_MAX = 10; // palette-recent entries
const CATALOG_TTL = 3600 * 1000; // npm catalog cache, 1 hour
const DIAG_MAX = 200; // circular RPC diagnostic buffer
let diagSeq = 0; // stable key for the circular buffer S.rows

const CATALOG_KEY = "catalog:pi-package";
const LIMIT_PRESETS = [70, 75, 80, 85, 90, 95];
/* Side-panel widths (px): built-in defaults + clamp range while dragging. */
const PANEL_W = { left: 300, right: 340, min: 160, max: 560 };

const MCP_PRESETS = {
    filesystem: {
        name: "filesystem",
        target: "npx -y @modelcontextprotocol/server-filesystem",
    },
    memory: {
        name: "memory",
        target: "npx -y @modelcontextprotocol/server-memory",
    },
    "sequential-thinking": {
        name: "sequential-thinking",
        target: "npx -y @modelcontextprotocol/server-sequential-thinking",
    },
};

const CHILD_STATE = {
    done: ["done", "chip-done"],
    running: ["running", "state-running"],
    unfinished: ["aborted", "chip-unfinished"],
    unknown: ["?", "chip-unknown"],
};

/** [label, cssClass] for a disk subagent state (used by RightPanel). */
function childStateMeta(state) {
    return CHILD_STATE[state] || CHILD_STATE.unknown;
}

/* ================= DOM S.refs (set by components) ================= */

/* All reactive state lives on S: a single $state object. */
export const S = $state({
    refs: { log: null, input: null },
    statusText: "disconnected",
    stateCls: "off",
    procCount: "",
    procList: "",
    current: null,
    tabs: [],
    activeTab: null,
    liveOrder: [],
    sessionState: null,
    rows: [],
    viewSeq: 0,
    stream: null,
    uiSettings: {
        expandTools: false,
        expandThink: false,
        showHidden: false,
        notifyDesktop: true,
        notifySound: true,
        // Font slots: blank family = built-in mono stack (var(--mono)).
        uiFont: "",
        uiFontSize: 12.5,
        chatFont: "",
        chatFontSize: 12.5,
        codeFont: "",
        codeFontSize: 11.5,
    },
    systemFonts: [],
    caps: { subagents: true },
    typing: { on: false, label: "" },
    emptyState: { on: true, kind: "nosession" },
    scrollBottomOn: false,
    pendingImages: [],
    imageViewerOn: false,
    imageViewerSrc: "",
    inputText: "",
    forkPopOpen: false,
    forkPopEmpty: false,
    forkItems: [],
    allModels: [],
    modelBtnText: "",
    modelBtnTitle: "",
    modelCtxText: "",
    modelPopOpen: false,
    modelQuery: "",
    modelGroups: [],
    modelError: "",
    levelList: [],
    thinkIndex: 0,
    thinkBtnText: "thinking",
    thinkHasSlider: false,
    thinkName: "",
    thinkBtnTitle: "",
    ctxChip: { text: "", title: "", cls: "" },
    ctxPopOpen: false,
    ctxPopRows: [],
    ctxPopAlert: null,
    sessAgg: null,
    ctxLimit: "",
    ctxLimitOptions: [],
    ctxLimitDisabled: false,
    compactReserve: null,
    compactBusy: false,
    autocompactOn: false,
    statsNoteRequested: false,
    paletteOpen: false,
    paletteItems: [],
    paletteIndex: 0,
    commandsCache: [],
    cmdkOpen: false,
    cmdkText: "",
    cmdkGroups: [],
    cmdkItems: [],
    cmdkIndex: 0,
    paletteFoot: "↑↓ select · Tab complete · Enter run · Esc close",
    sidebarGroups: [],
    sidebarEmpty: "",
    sidebarError: "",
    searchFilter: "",
    toolFilter: "",
    errorsOnly: false,
    searchFocused: false,
    searchResults: [],
    searchMeta: { on: false, text: "" },
    searchMore: { on: false, count: 0 },
    pkgsOpen: false,
    pkgsPane: "installed",
    pkgListText: "loading…",
    mcpServers: [],
    mcpJson: "",
    mcpError: "",
    mcpForm: {
        name: "",
        target: "",
        args: "",
        local: false,
        preset: "",
        out: "",
        envRows: [{ key: "", value: "" }],
    },
    catFilter: "",
    catalogObjects: null,
    hooksText: "",
    hooksStatusText: "",
    hooksInstalled: false,
    confirmBar: false,
    confirmCmd: "",
    provOpen: false,
    provFilter: "",
    provCurrent: "",
    provProviders: [],
    authChip: { hidden: true, cls: "", label: "", title: "" },
    updOut: "",
    piVersion: "",
    panelPane: "subs",
    subsList: [],
    subsWarn: false,
    subsError: "",
    subsHiddenBtn: { on: false },
    editedFiles: [],
    editsError: "",
    filesCount: 0,
    missionsList: [],
    missionsError: "",
    diagBuf: [],
    diagHead: "",
    detail: null,
    childRows: [],
    childError: "",
    fileDiff: null,
    missionDetail: null,
    loadMore: { on: false, text: "", busy: false },
    settingsOpen: false,
    fatalMsg: "",
    homeDir: null,
    fileGroups: [],
    mcpHighlight: null,
    catalogRows: [],
    catLoading: false,
    catError: "",
    mcpOut: "",
    provLoading: false,
    subsHidden: false,
    fatalVisible: false,
    sidebarW: 300,
    rightW: 340,
});

/* Command palette data (kept out of S: contains closures and comments). */
const APP_COMMANDS = [
    {
        name: "compact",
        description: "compact the context now (optional: instructions)",
        app: true,
        needsRpc: true,
        run: (a) =>
            sendCommand(
                a
                    ? { type: "compact", customInstructions: a }
                    : { type: "compact" },
            ),
    },
    {
        name: "model",
        description: "choose the model: /model [search]",
        app: true,
        run: (a) => runModelArg(a),
    },
    {
        name: "thinking",
        description: "cycle the thinking level",
        app: true,
        needsRpc: true,
        run: () => sendCommand({ type: "cycle_thinking_level" }),
    },
    {
        name: "new",
        description: "new session in this folder",
        app: true,
        run: () => newSessionIn(S.current ? S.current.cwd : S.homeDir || "/"),
    },
    {
        name: "name",
        description: "rename the session: /name <title>",
        app: true,
        needsRpc: true,
        run: (a) => {
            if (!a) return note("usage: /name <title>");
            const t = S.tabs.find((x) => S.current && x.key === S.current.key);
            if (t) t.label = a;
            sendCommand({ type: "set_session_name", name: a });
        },
    },
    {
        name: "session",
        description: "session info (tokens and cost)",
        app: true,
        needsRpc: true,
        run: () => {
            S.statsNoteRequested = true;
            sendCommand({ type: "get_session_stats" });
        },
    },
    {
        name: "copy",
        description: "copy the last answer",
        app: true,
        needsRpc: true,
        run: () => sendCommand({ type: "get_last_assistant_text" }),
    },
    {
        name: "export",
        description: "export the session as HTML",
        app: true,
        needsRpc: true,
        run: () => sendCommand({ type: "export_html" }),
    },
    {
        name: "abort",
        description: "interrupt the current turn",
        app: true,
        needsRpc: true,
        // pi's `abort` keeps queued messages moving (docs/rpc-commands.md §clear_queue):
        // without clearing first, the next turn would start on its own.
        run: () => {
            sendCommand({ type: "clear_queue" });
            sendCommand({ type: "abort" });
        },
    },
    {
        name: "undo",
        description:
            "return the queue to the composer (without interrupting the turn)",
        app: true,
        needsRpc: true,
        run: () => desfazerFila(),
    },
    {
        name: "fork",
        description:
            "fork (new session) from a previous message — the original is preserved",
        app: true,
        needsRpc: true,
        run: () => sendCommand({ type: "get_fork_messages" }),
    },
    {
        name: "login",
        description: "choose a provider and log in: /login [provider]",
        app: true,
        run: (a) => (a ? startLogin(a) : openProvPicker()),
    },
];

/** MainView registers the scrollable transcript element here. */
function setLogEl(el) {
    S.refs.log = el || null;
}

/* ================= reactive state ================= */

/* fork */
let pendingForkAnchor = null;
let pendingForkReload = false;

/* model selector */
const modelsByProvider = new Map();

/* thinking levels */

/* context / stats */

/** Short session label for the aggregate list. */
function sessShort(t) {
    return (t.label || t.key).split(" — ")[0].slice(0, 16);
}

/* slash palette (per-session) */

/* global palette (Cmd-K) */

/* sidebar */

/* search */
let searchTimer = 0;
let searchOffset = 0;

/* packages / MCP / catalog / hooks */
const installedSet = new Set();
let hooksTimer = null;

/** Whether a catalog package is already installed (parsed from `pi list`). */
function isInstalled(name) {
    return installedSet.has(String(name || ""));
}

/* confirm bar */
let pendingAction = null;

/* provider auth */
let authProvider = null;
let authTimer = null;

/* updates */

/* right panel */
let lastSnap = null;
let lastDiskList = null;

/* files (edited) pane */

/* missions pane */

/* diagnostics pane */
const diagPending = new Map();

/* S.detail panel (child transcript / file diff / mission) */

/* history pagination */
let loadedConsumed = 0;

/* settings modal */

/* fatal JS error bar */

/* internals (non-reactive) */
const cards = new Map(); // toolCallId -> tool row (focused session)
const childTools = new Map(); // toolCallId -> tool row (S.detail child)
const pendingPromptRows = new Map(); // rpc id -> local queue row entry
const sessionTitles = new Map(); // session id -> title (from list_sessions)
let collapsedProjects = new Set();
let hiddenProjects = new Set();
let expandedProjects = new Set();
const lastNotifyAt = {};
const extRowsByKey = new Map(); // statusKey -> ext row
let seq = 0; // rpc id counter

/** Project display name for a cwd (home dir shows as '~'). */
function projectName(cwd) {
    return _projectName(cwd, S.homeDir);
}
let initDone = false;

/* ================= localStorage ================= */

function lsGet(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : v;
    } catch {
        return fallback;
    }
}
function lsSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* no storage */
    }
}

function loadSettings() {
    let raw = {};
    try {
        raw = JSON.parse(lsGet(LS.settings, "{}"));
    } catch {
        /* defaults */
    }
    S.uiSettings.expandTools = !!raw.expandTools;
    S.uiSettings.expandThink = !!raw.expandThink;
    S.uiSettings.showHidden = !!raw.showHidden;
    S.uiSettings.notifyDesktop = raw.notifyDesktop !== false;
    S.uiSettings.notifySound = raw.notifySound !== false;
    S.uiSettings.uiFont = String(raw.uiFont || "");
    S.uiSettings.uiFontSize = fontNum(raw.uiFontSize, 12.5);
    S.uiSettings.chatFont = String(raw.chatFont || "");
    S.uiSettings.chatFontSize = fontNum(raw.chatFontSize, 12.5);
    S.uiSettings.codeFont = String(raw.codeFont || "");
    S.uiSettings.codeFontSize = fontNum(raw.codeFontSize, 11.5);
    applyFonts();
}
function saveSettings() {
    lsSet(LS.settings, JSON.stringify(S.uiSettings));
}

/** Coerce a font-size setting to a positive finite number (fallback = default). */
function fontNum(v, dflt) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : dflt;
}

/** Push font/size settings to :root CSS custom properties.
 *    Blank family = built-in mono stack; a family becomes "name", <fallback>. */
function applyFonts() {
    const s = S.uiSettings;
    const root = document.documentElement;
    const stack = (name, fallback) =>
        name
            ? `"${String(name).replace(/"/g, '\\"')}", ${fallback}`
            : "var(--mono)";
    const sans = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const mono =
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
    root.style.setProperty("--font-ui", stack(s.uiFont, sans));
    root.style.setProperty("--font-chat", stack(s.chatFont, sans));
    root.style.setProperty("--font-code", stack(s.codeFont, mono));
    root.style.setProperty("--fs-ui", fontNum(s.uiFontSize, 12.5) + "px");
    root.style.setProperty("--fs-chat", fontNum(s.chatFontSize, 12.5) + "px");
    root.style.setProperty("--fs-code", fontNum(s.codeFontSize, 11.5) + "px");
}

/** Settings handler: persists; re-runs the session list when hidden-projects
 *    visibility changes, re-applies CSS vars for font settings. */
function settingChange(field, value) {
    S.uiSettings[field] = value;
    saveSettings();
    if (field === "showHidden") loadSessions();
    if (
        field.startsWith("uiFont") ||
        field.startsWith("chatFont") ||
        field.startsWith("codeFont")
    )
        applyFonts();
}

/** Open a URL in the default browser (Tauri shell). */
function openExternal(url) {
    if (url) inv("open_external", { url }).catch(() => {});
}

function loadTreeState() {
    try {
        collapsedProjects = new Set(JSON.parse(lsGet(LS.collapsed, "[]")));
    } catch {
        /* defaults */
    }
    try {
        hiddenProjects = new Set(JSON.parse(lsGet(LS.hidden, "[]")));
    } catch {
        /* defaults */
    }
    try {
        expandedProjects = new Set(JSON.parse(lsGet(LS.expanded, "[]")));
    } catch {
        /* defaults */
    }
}
function saveTreeState() {
    lsSet(LS.collapsed, JSON.stringify([...collapsedProjects]));
    lsSet(LS.hidden, JSON.stringify([...hiddenProjects]));
    lsSet(LS.expanded, JSON.stringify([...expandedProjects]));
}

/* ================= status / header ================= */

function setStatus(text) {
    S.statusText = String(text == null ? "" : text);
}
function setState(cls) {
    S.stateCls = cls;
}

async function updateProcCount() {
    try {
        const list = JSON.parse(String(await inv("running_sessions")));
        S.procCount = list && list.length ? list.length + " pi" : "";
        S.procList = Array.isArray(list) ? list.join("\n") : "";
    } catch {
        /* ignore */
    }
}

/* ================= notifications / sound ================= */

function beep() {
    if (!S.uiSettings.notifySound) return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        const t0 = ctx.currentTime;
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.start(t0);
        o.stop(t0 + 0.4);
        o.onended = () => ctx.close().catch(() => {});
    } catch {
        /* no audio */
    }
}

/**
 * Done-notification: fires only when the session is NOT focused and its tab was
 * actually working. Debounced 4s per session so long turns don't retrigger.
 */
function maybeNotifyDone(sessionId) {
    const t = S.tabs.find((x) => x.key === sessionId);
    if (!t || !t.working) return;
    if (S.current && S.current.key === sessionId) return;
    const now = Date.now();
    if (lastNotifyAt[sessionId] && now - lastNotifyAt[sessionId] < 4000) return;
    lastNotifyAt[sessionId] = now;
    beep();
    if (
        S.uiSettings.notifyDesktop &&
        window.Notification &&
        Notification.permission === "granted"
    ) {
        try {
            new Notification("pi-pi-pi: turn ready", {
                body: t.label || sessionId,
            });
        } catch {
            /* ignore */
        }
    }
}

/* ================= scroll / empty / S.typing / turn ================= */

function scrollBottom(force) {
    const l = S.refs.log;
    if (!l) return;
    const away = l.scrollHeight - l.scrollTop - l.clientHeight;
    // On open/re-render always jump to the end. During a S.stream, only when already near it.
    if (!force && away > 260) {
        S.scrollBottomOn = true;
        return;
    }
    l.scrollTop = l.scrollHeight;
    updateScrollBtn();
}

function updateScrollBtn() {
    const l = S.refs.log;
    if (!l) return;
    S.scrollBottomOn = l.scrollHeight - l.scrollTop - l.clientHeight > 220;
}

function onLogScroll() {
    updateScrollBtn();
}

function scrollToBottom() {
    const l = S.refs.log;
    if (l) l.scrollTo({ top: l.scrollHeight, behavior: "smooth" });
}

function setEmptyState(on, kind) {
    S.emptyState = { on: !!on, kind: kind || (on ? "nosession" : null) };
}

function setTyping(on, label) {
    S.typing.on = !!on;
    if (label) S.typing.label = label;
}

/**
 * Turn-in-progress is tab state, not window state: without this the previous
 * tab's "thinking…" kept showing after switching (even into a fresh session).
 */
function setTurn(sessionId, working, phase) {
    const t = S.tabs.find((x) => x.key === sessionId);
    if (!t) return;
    const changed = !!t.working !== !!working;
    t.working = !!working;
    t.phase = working ? phase || t.phase || "thinking…" : "";
    if (S.current && S.current.key === sessionId) setTyping(working, t.phase);
    if (working) setState("busy");
    if (!working && changed) maybeNotifyDone(sessionId);
}

/* ================= transcript S.rows ================= */

let rowSeq = 0;
function nextId() {
    return "r" + ++rowSeq;
}

/** Quick note line in the focused transcript. */
function note(text) {
    S.rows.push({ id: nextId(), kind: "note", text: String(text) });
    scrollBottom();
}

/** Extension activity (setStatus/notify), deduped by statusKey. */
function extActivity(text, key) {
    const clean = stripAnsi(text);
    if (!clean) return;
    if (key) {
        const existing = extRowsByKey.get(key);
        if (existing) {
            existing.text = clean;
            return;
        }
    }
    const row = { id: nextId(), kind: "ext", key: key || null, text: clean };
    S.rows.push(row);
    if (key) extRowsByKey.set(key, row);
    scrollBottom();
}

/** Build a tool card row and register it in the given store. */
function cardRow(callId, name, args, store, timeMs) {
    const row = {
        id: nextId(),
        kind: "tool",
        name: name || "tool",
        argsText: summarize(name, args),
        resultText: "",
        state: "",
        expanded: !!S.uiSettings.expandTools,
        timeText: nowTime(timeMs),
    };
    if (callId) store.set(callId, row);
    return row;
}

/** Append a markdown row (assistant text) with copy + fork affordances. */
function mdRowObj(text, forkAnchor) {
    return {
        id: nextId(),
        kind: "md",
        raw: text,
        html: renderMarkdown(text),
        forkText: forkAnchor
            ? "Fork from here (new session starting from the previous prompt)"
            : "",
        forkMsg: forkAnchor ? forkAnchor.utext || "" : "",
        forkIndex: forkAnchor ? forkAnchor.uindex : -1,
    };
}

/**
 * Convert pi messages into transcript S.rows (port of renderMessages).
 *  - main: focused session log; user S.rows get fork buttons; keeps first note
 *  - ctx:  S.detail panel child transcript (no fork, own tool store)
 */
function buildRows(messages, opts) {
    const main = !!opts.main;
    const store = main ? cards : opts.store || new Map();
    const out = [];
    if (opts.keepNote) {
        const firstNote = S.rows.find((r) => r.kind === "note");
        if (firstNote) out.push(firstNote);
    }
    let userIdx = -1;
    const userTexts = [];

    for (const m of messages) {
        if (!m || m.role === "system") continue;
        const blocks = Array.isArray(m.content) ? m.content : null;
        if (m.role === "user") userIdx++;
        if (m.role === "user" && userTexts.length <= userIdx)
            userTexts.push("");

        if (m.role === "custom") {
            out.push({
                id: nextId(),
                kind: "ext",
                key: null,
                text: m.customType || m.type || "custom",
            });
            continue;
        }

        if (m.role === "user") {
            const text = blocks
                ? blocks
                      .filter((b) => b && b.type === "text")
                      .map((b) => b.text)
                      .join("\n")
                : typeof m.content === "string"
                  ? m.content
                  : "";
            // Sent images show up too: without this the pasted print vanishes from the transcript.
            const imgs = blocks
                ? blocks.filter((b) => b && b.type === "image" && b.data)
                : [];
            if (!text.trim() && !imgs.length) {
                userIdx--;
                userTexts.pop();
                continue;
            }
            const t = text.trim();
            out.push({
                id: nextId(),
                kind: "user",
                text: t,
                dataText: t,
                images: imgs.map((b) => ({
                    dataUrl:
                        "data:" +
                        (b.mimeType || "image/png") +
                        ";base64," +
                        b.data,
                })),
                queueTag: null,
                forkText: main
                    ? "Fork from this message (new session, original preserved)"
                    : "",
                forkMsg: t,
                forkIndex: userIdx,
            });
            userTexts[userIdx] = t;
            continue;
        }

        if (m.role === "assistant") {
            if (!blocks) continue;
            for (const b of blocks) {
                if (!b) continue;
                if (b.type === "thinking" && b.thinking && b.thinking.trim()) {
                    out.push({
                        id: nextId(),
                        kind: "think",
                        text: b.thinking.slice(0, 20000),
                        collapsed: !S.uiSettings.expandThink,
                    });
                } else if (b.type === "text" && b.text && b.text.trim()) {
                    const t = b.text.trim();
                    out.push(
                        mdRowObj(
                            t,
                            main
                                ? {
                                      uindex: userIdx,
                                      utext: userTexts[userIdx] || "",
                                  }
                                : null,
                        ),
                    );
                } else if (b.type === "toolCall") {
                    const row = cardRow(
                        b.id,
                        b.name,
                        b.arguments,
                        store,
                        m.timestamp,
                    );
                    out.push(row);
                }
            }
            continue;
        }

        if (m.role === "toolResult") {
            let row = store.get(m.toolCallId);
            if (!row) {
                row = cardRow(
                    m.toolCallId,
                    m.toolName,
                    null,
                    store,
                    m.timestamp,
                );
                out.push(row);
            }
            row.state = m.isError ? "err" : "ok";
            const text = outputText(m);
            if (text) row.resultText = text;
            if (S.uiSettings.expandTools) row.expanded = true;
            continue;
        }
    }
    return out;
}

/* ================= queue (queued messages) ================= */
// `queue_update` brings the full queue on every change (docs/json.md) and is the
// only signal that a queued message was delivered. Local S.rows live on the tab
// because the log is rebuilt from disk, which doesn't have the message yet.

function localRows(t) {
    return t ? t.localRows || (t.localRows = []) : [];
}

function markRow(entry, state) {
    entry.state = state;
    entry.row.queueTag =
        state === "queued"
            ? { text: "· queued", cls: "" }
            : state === "delivered"
              ? { text: "· delivered", cls: "delivered" }
              : state === "cancelled"
                ? { text: "· cancelled", cls: "cancelled" }
                : null;
}

function syncQueue(key, texts) {
    const t = S.tabs.find((x) => x.key === key);
    if (!t) return;
    const left = (texts || []).slice();
    t.queue = texts || [];
    for (const entry of localRows(t)) {
        if (entry.state !== "queued") continue;
        const i = left.findIndex(
            (s) =>
                s === entry.text ||
                s.includes(entry.text) ||
                entry.text.includes(s),
        );
        if (i >= 0) left.splice(i, 1);
        else markRow(entry, "delivered");
    }
}

/**
 * Re-attach local S.rows the disk history doesn't have yet. Runs on every main
 * log render: once the message is persisted, its local copy drops.
 */
function restoreLocalRows() {
    const t = S.tabs.find((x) => S.current && x.key === S.current.key);
    if (!t || !t.localRows || !t.localRows.length) return;
    const seen = new Set(
        S.rows.filter((r) => r.kind === "user").map((r) => r.dataText),
    );
    t.localRows = t.localRows.filter((entry) => {
        if (entry.state !== "cancelled" && seen.has(entry.text)) return false;
        S.rows.push(entry.row);
        return true;
    });
}

/* ================= fork ================= */

function forkFromAnchor(anchor) {
    if (!S.current) {
        note("no session open");
        return;
    }
    if (!S.current.connected) {
        note("read-only session — connect to fork");
        return;
    }
    pendingForkAnchor = {
        uindex: anchor.uindex,
        utext: anchor.utext,
        key: S.current.key,
    };
    sendCommand({ type: "get_fork_messages" });
}

function resolveForkAnchor(msgs) {
    const a = pendingForkAnchor;
    pendingForkAnchor = null;
    if (!a || !S.current || S.current.key !== a.key) return false;
    const items = (msgs || []).filter((m) => m && m.entryId);
    if (!items.length) return false;
    const want = normForkText(a.utext);
    let hit = null;
    if (want) {
        if (items[a.uindex] && normForkText(items[a.uindex].text) === want)
            hit = items[a.uindex];
        else hit = items.find((m) => normForkText(m.text) === want) || null;
    } else if (items[a.uindex]) hit = items[a.uindex];
    if (!hit) return false;
    sendCommand({ type: "fork", entryId: hit.entryId });
    return true;
}

function openForkPop(messages) {
    closeModelPop();
    const items = (messages || []).filter((m) => m && m.entryId);
    S.forkItems = items.map((m) => ({
        entryId: m.entryId,
        label:
            String(m.text || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120) || "(no text)",
        shortId: String(m.entryId).slice(0, 8),
        full: String(m.text || ""),
    }));
    S.forkPopEmpty = !items.length;
    S.forkPopOpen = true;
}

function closeForkPop() {
    S.forkPopOpen = false;
}

/** Row-level fork: exact match on (order + text); falls back to the picker. */
function forkRowClick(row) {
    if (!S.current) {
        note("no session open");
        return;
    }
    if (!S.current.connected) {
        note("read-only session — connect to fork");
        return;
    }
    pendingForkAnchor = {
        uindex: row.forkIndex,
        utext: row.forkMsg || row.text,
        key: S.current.key,
    };
    sendCommand({ type: "get_fork_messages" });
}

/** Fork a specific entry from the picker. */
function forkPick(entryId) {
    S.forkPopOpen = false;
    sendCommand({ type: "fork", entryId });
}

/* ================= models ================= */

function updateModelButton(m) {
    if (!m || !m.id) return;
    S.modelBtnText = m.name || m.id;
    S.modelBtnTitle = (m.provider ? m.provider + "/" : "") + m.id;
    S.modelCtxText = contextLabel(m.contextWindow);
    // Keep the whole model: loadLastModel restores the button without any RPC.
    lsSet(LS.lastModel, JSON.stringify(m));
}

function loadLastModel() {
    try {
        const m = JSON.parse(lsGet(LS.lastModel, "null"));
        if (m && m.id) updateModelButton(m);
    } catch {
        /* ignore */
    }
}

function loadCachedModels() {
    try {
        const arr = JSON.parse(lsGet(LS.models, "null"));
        if (Array.isArray(arr) && arr.length) {
            S.allModels = arr;
            fillModels(arr, null);
        }
    } catch {
        /* ignore */
    }
}

/**
 * Fill the model list. `first` selects the initial model (null = keep S.current
 * button). Builds the provider groups and persists the cache.
 */
function fillModels(models, currentModel) {
    if (Array.isArray(models) && models.length) {
        S.allModels = models;
        modelsByProvider.clear();
        for (const m of S.allModels) {
            if (!m || !m.id) continue;
            const p = m.provider || "other";
            if (!modelsByProvider.has(p)) modelsByProvider.set(p, []);
            modelsByProvider.get(p).push(m);
        }
    }
    const cur = (S.sessionState && S.sessionState.model) || currentModel;
    if (cur) updateModelButton(cur);
    renderModelList(S.modelQuery || "");
    try {
        lsSet(
            LS.models,
            JSON.stringify(Array.isArray(models) ? models : S.allModels),
        );
    } catch {
        /* ignore */
    }
    debugNote(
        "providers=" + modelsByProvider.size + " models=" + S.allModels.length,
    );
}

/** Search + provider-grouped list for the model popover. */
function renderModelList(filter) {
    if (filter !== undefined) S.modelQuery = filter;
    const q = String(S.modelQuery || "")
        .trim()
        .toLowerCase();
    const groups = [];
    for (const [provider, list] of modelsByProvider) {
        const modelRows = list
            .filter(
                (m) =>
                    !q ||
                    (m.id + " " + (m.name || "")).toLowerCase().includes(q),
            )
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (!modelRows.length) continue;
        groups.push({ provider: provider.toUpperCase(), rows: modelRows });
    }
    groups.sort((a, b) => a.provider.localeCompare(b.provider));
    S.modelGroups = groups;
}

/** Instant catalog from the CLI (`pi --list-models`) — no session or RPC needed. */
async function warmModels() {
    try {
        const list = JSON.parse(String(await inv("pi_models")));
        if (Array.isArray(list) && list.length) fillModels(list, null);
    } catch {
        /* offline or no pi: cache still usable */
    }
}

function findModels(arg) {
    if (!arg) return null;
    const q = String(arg).toLowerCase();
    // Exact id first (ids can be substrings of other ids).
    const exact = S.allModels.find(
        (m) => m && m.id && String(m.id).toLowerCase() === q,
    );
    if (exact) return [exact];
    const scored = S.allModels
        .map((m) => ({
            m,
            s: fuzzyScore(
                String(
                    m.id + " " + (m.name || "") + " " + (m.provider || ""),
                ).toLowerCase(),
                q,
            ),
        }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
        .map((x) => x.m);
    return scored.length ? scored : null;
}

/** Apply a model (popover, cmdk, /model). Reconnects read-only sessions. */
async function applyModel(m) {
    if (!m || !m.id) return;
    updateModelButton(m);
    closeModelPop();
    if (!S.current) return;
    if (!S.current.connected) {
        if (!(await ensureRpc())) return;
    }
    sendCommand({ type: "set_model", modelId: m.id });
}

/** /model <arg> — exact match applies, fuzzy matches open the popover. */
async function runModelArg(arg) {
    if (!S.current) {
        note("no session open");
        return;
    }
    if (!S.current.connected) {
        if (!(await ensureRpc())) return;
    }
    if (!arg) {
        sendCommand({ type: "get_available_models" });
        return;
    }
    const found = findModels(arg);
    if (found && found.length === 1) {
        applyModel(found[0]);
        return;
    }
    if (found && found.length > 1) {
        S.modelQuery = arg;
        S.modelPopOpen = true;
        renderModelList(arg);
        note("multiple matches — pick in the model list");
        return;
    }
    note("model not found: " + arg);
}

function openModelPop() {
    closeForkPop();
    S.modelPopOpen = !S.modelPopOpen;
    if (S.modelPopOpen) {
        S.modelQuery = "";
        renderModelList("");
    }
}
function closeModelPop() {
    S.modelPopOpen = false;
}

async function thinkSelect(key) {
    if (!S.current || !S.current.connected) {
        if (!(await ensureRpc())) return;
    }
    if (!S.current || S.current.key !== key) return;
    const lv = S.levelList[key];
    if (!lv) return;
    sendCommand({ type: "set_thinking_level", level: lv });
    S.sessionState = { ...(S.sessionState || {}), thinkingLevel: lv };
    if (S.current) {
        const tb = S.tabs.find((x) => x.key === S.current.key);
        if (tb) tb.thinkingLevel = lv;
    }
    fillLevels(null);
}

/* ================= thinking levels ================= */

function fillLevels(levels) {
    if (Array.isArray(levels)) S.levelList = levels.slice();
    if (!S.levelList.length) {
        S.thinkBtnText = "thinking";
        S.thinkBtnTitle = "";
        return;
    }
    const cur = S.sessionState && S.sessionState.thinkingLevel;
    S.thinkIndex = Math.max(0, S.levelList.indexOf(cur));
    S.thinkBtnText = S.levelList[S.thinkIndex];
    S.thinkBtnTitle = "thinking: " + S.thinkBtnText + " — click to choose";
    // Models without reasoning only return ["off"]: no slider.
    S.thinkHasSlider = S.levelList.length > 1;
    S.thinkName = S.levelList[S.thinkIndex];
    debugNote("levels=" + S.levelList.length + " selected=" + cur);
}

function loadCachedLevels() {
    try {
        const arr = JSON.parse(lsGet(LS.levels, "null"));
        if (Array.isArray(arr) && arr.length) fillLevels(arr);
    } catch {
        /* ignore */
    }
}

function cycleThinkingLevel() {
    if (!S.current) {
        note("no session open");
        return;
    }
    if (!S.current.connected) {
        ensureRpc().then((ok) => {
            if (ok) sendCommand({ type: "cycle_thinking_level" });
        });
        return;
    }
    sendCommand({ type: "cycle_thinking_level" });
}

/* ================= context window / compaction ================= */

function ctxWindow() {
    const cu =
        S.sessionState &&
        S.sessionState.stats &&
        S.sessionState.stats.contextUsage;
    const m = S.sessionState && S.sessionState.model;
    return (cu && cu.contextWindow) || (m && m.contextWindow) || 0;
}

/** Header chip: % used + tokens (w/c). warn ≥70, danger ≥90. */
function updateStats(data) {
    if (S.current) {
        S.sessionState = { ...(S.sessionState || {}), stats: data || {} };
        // Per-tab cache: the popover aggregates tokens/cost without a new RPC.
        const tb = S.tabs.find((x) => x.key === S.current.key);
        if (tb) tb.stats = data || {};
    }
    const cu = data && data.contextUsage;
    if (!cu || cu.percent == null) {
        S.ctxChip = { text: "—", title: "context unavailable", cls: "" };
        if (S.ctxPopOpen) renderCtxPop();
        return;
    }
    const pct = Math.round(cu.percent);
    S.ctxChip = {
        text:
            pct +
            "% · " +
            fmtTokens(cu.tokens) +
            "/" +
            fmtTokens(cu.contextWindow),
        title:
            cu.tokens +
            " / " +
            cu.contextWindow +
            " tokens (" +
            pct +
            "%) — click for details",
        cls: pct >= 90 ? "danger" : pct >= 70 ? "warn" : "",
    };
    if (data && typeof data.autoCompactionEnabled === "boolean") {
        S.sessionState = {
            ...(S.sessionState || {}),
            autoCompactionEnabled: data.autoCompactionEnabled,
            stats: data,
        };
        S.autocompactOn = data.autoCompactionEnabled;
    }
    if (S.ctxPopOpen) renderCtxPop();
}

/** Details popover content (S.rows + alert + aggregate across S.tabs). */
function renderCtxPop() {
    const st = (S.sessionState && S.sessionState.stats) || null;
    if (!st || !st.tokens) {
        S.ctxPopRows = [];
        S.ctxPopAlert = null;
        // No stats for the S.current session: still show the aggregate of S.tabs that have some.
        renderSessAggregate(null);
        return;
    }
    const cu = st.contextUsage || {};
    const t = st.tokens || {};
    const rows2 = [];
    rows2.push({
        k: "Context window",
        v:
            (cu.percent != null ? Math.round(cu.percent) + "% used · " : "") +
            fmtTokens(cu.tokens) +
            " / " +
            fmtTokens(cu.contextWindow) +
            " tokens",
    });
    if (cu.percent != null && Math.round(cu.percent) >= 70) {
        const pct = Math.round(cu.percent);
        S.ctxPopAlert =
            pct >= 90
                ? {
                      cls: "danger",
                      text:
                          "Context nearly full (" +
                          pct +
                          "%) — run /compact now",
                  }
                : {
                      cls: "warn",
                      text: "Context at " + pct + "% — consider /compact",
                  };
    } else {
        S.ctxPopAlert = null;
    }
    rows2.push({
        k: "Auto-compaction",
        v:
            S.sessionState && S.sessionState.autoCompactionEnabled
                ? "on"
                : "off",
        dim: true,
    });
    rows2.push({
        k: "Prompt cache (session)",
        v:
            "read " +
            fmtTokens(t.cacheRead) +
            " · write " +
            fmtTokens(t.cacheWrite),
        dim: true,
    });
    rows2.push({
        k: "Input / Output",
        v: fmtTokens(t.input) + " / " + fmtTokens(t.output),
    });
    rows2.push({ k: "Cost", v: fmtCost(st.cost) });
    rows2.push({ k: "Messages", v: String(st.totalMessages || 0), dim: true });
    renderSessAggregate(S.current && S.current.key);
    renderLimitSelect(cu.contextWindow || ctxWindow());
}

/** Per-session aggregate (tokens/cost) from the S.tabs cache, top 8 by usage. */
function renderSessAggregate(curKey) {
    const withStats = S.tabs.filter((x) => x.stats && x.stats.tokens);
    if (!withStats.length) {
        S.sessAgg = [];
        return;
    }
    let totTok = 0,
        totCost = 0,
        totMsg = 0;
    for (const x of withStats) {
        totTok += Number(x.stats.tokens && x.stats.tokens.total) || 0;
        if (typeof x.stats.cost === "number") totCost += x.stats.cost;
        totMsg += Number(x.stats.totalMessages) || 0;
    }
    const ordered = withStats.slice().sort((a, b) => {
        const pa = (a.stats.contextUsage && a.stats.contextUsage.percent) || 0;
        const pb = (b.stats.contextUsage && b.stats.contextUsage.percent) || 0;
        return pb - pa;
    });
    S.sessAgg = {
        total:
            withStats.length +
            (withStats.length === 1 ? " session" : " sessions") +
            " · " +
            fmtTokens(totTok) +
            " · " +
            fmtCost(totCost) +
            " · " +
            totMsg +
            " msg",
        items: ordered.slice(0, 8).map((x) => {
            const p =
                x.stats.contextUsage && x.stats.contextUsage.percent != null
                    ? Math.round(x.stats.contextUsage.percent)
                    : null;
            return {
                name: (x.key === curKey ? "● " : "") + sessShort(x),
                cls:
                    p == null ? "" : p >= 90 ? "danger" : p >= 70 ? "warn" : "",
                text:
                    (p == null ? "—" : p + "%") +
                    " · " +
                    fmtTokens(x.stats.tokens.total) +
                    " · " +
                    fmtCost(x.stats.cost),
                title: x.key,
                cur: x.key === curKey,
            };
        }),
    };
}

function renderLimitSelect(win) {
    const options = [["", "pi default"]];
    let matched = "";
    for (const p of LIMIT_PRESETS) {
        const reserve = win ? Math.round((win * (100 - p)) / 100) : 0;
        options.push([
            String(p),
            p + "%" + (reserve ? " · reserve " + fmtTokens(reserve) : ""),
        ]);
        if (
            S.compactReserve != null &&
            reserve &&
            Math.abs(S.compactReserve - reserve) <= Math.max(1, win * 0.004)
        )
            matched = String(p);
    }
    if (S.compactReserve != null && !matched)
        options.push([
            "custom",
            "custom · reserve " + fmtTokens(S.compactReserve),
        ]);
    S.ctxLimitOptions = options;
    S.ctxLimit = S.compactReserve == null ? "" : matched || "custom";
    S.ctxLimitDisabled =
        !(S.sessionState && S.sessionState.model && S.current) || !(win > 0);
}

async function saveLimit(value) {
    const model = S.sessionState && S.sessionState.model;
    const win = ctxWindow();
    if (!S.current || !model || !(win > 0) || value === "custom") return;
    const pct = value === "" ? null : Number(value);
    const reserve =
        pct == null ? null : Math.max(0, Math.round((win * (100 - pct)) / 100));
    S.ctxLimitDisabled = true;
    try {
        const raw = await inv("compaction_set", {
            cwd: S.current.cwd,
            provider: model.provider,
            model: model.id,
            reserveTokens: reserve,
        });
        const st = JSON.parse(String(raw));
        S.compactReserve =
            typeof st.reserveTokens === "number" ? st.reserveTokens : null;
        note(
            pct == null
                ? "compaction: pi default (applies on restart ↻)"
                : "compacting at " +
                      pct +
                      "% of context · reserve " +
                      fmtTokens(S.compactReserve) +
                      " (applies on restart ↻)",
        );
    } catch (e) {
        note("failed to save the compaction limit: " + e);
    }
    renderCtxPop();
}

async function refreshCompactLimit() {
    try {
        const st = JSON.parse(String(await inv("compaction_get")));
        S.compactReserve =
            st && typeof st.reserveTokens === "number"
                ? st.reserveTokens
                : null;
    } catch {
        S.compactReserve = null;
    }
    renderLimitSelect(ctxWindow());
}

function compactNow() {
    if (!S.current) {
        note("no session open");
        return;
    }
    if (S.compactBusy) return;
    S.compactBusy = true;
    sendCommand({ type: "compact" });
}

function resetCompact() {
    S.compactBusy = false;
}

function endCompact(text) {
    resetCompact();
    note(text);
    sendCommand({ type: "get_session_stats" });
}

function toggleAutocompact() {
    const next = !(S.sessionState && S.sessionState.autoCompactionEnabled);
    sendCommand({ type: "set_auto_compaction", enabled: next });
    S.sessionState = { ...(S.sessionState || {}), autoCompactionEnabled: next };
    S.autocompactOn = next;
}

function ctxBtnClick() {
    S.statsNoteRequested = true;
    if (S.current && S.current.connected)
        sendCommand({ type: "get_session_stats" });
    renderCtxPop();
    refreshCompactLimit();
    S.ctxPopOpen = !S.ctxPopOpen;
    closeModelPop();
}

/* ================= slash palette (per session) ================= */

function loadRecents() {
    try {
        return JSON.parse(lsGet(LS.recents, "[]"));
    } catch {
        return [];
    }
}
function saveRecents(list) {
    lsSet(LS.recents, JSON.stringify(list.slice(0, RECENT_MAX)));
}
function pushRecent(line) {
    const list = loadRecents().filter((x) => x !== line);
    list.unshift(line);
    saveRecents(list);
}
function recentRank(name) {
    const list = loadRecents();
    const i = list.indexOf(name);
    return i < 0 ? 999 : i;
}

function loadCachedCommands() {
    try {
        const arr = JSON.parse(lsGet(LS.commands, "null"));
        if (Array.isArray(arr) && arr.length) S.commandsCache = arr;
    } catch {
        /* ignore */
    }
}
function saveCommands(list) {
    S.commandsCache = Array.isArray(list) ? list : [];
    try {
        localStorage.setItem(LS.commands, JSON.stringify(S.commandsCache));
    } catch {
        /* ignore */
    }
}

function checkCommands(list) {
    const has = (list || []).some((c) =>
        String((c && c.sourceInfo && c.sourceInfo.source) || "").includes(
            "pi-subagents",
        ),
    );
    S.caps.subagents = has;
    S.subsWarn = !has;
    debugNote("pi-subagents loaded=" + has);
}

/** Detect the slash token at the caret: { start, text } or null. */
function slashTokenFor(value) {
    const caret = value == null ? "" : value;
    const i = caret.lastIndexOf(" ");
    const start = i < 0 ? 0 : i + 1;
    const tok = value.slice(start);
    if (!tok.startsWith("/")) return null;
    return { start: start + 1, text: tok.slice(1) };
}

function hidePalette() {
    S.paletteOpen = false;
    S.paletteItems = [];
    S.paletteIndex = 0;
    S.paletteFoot = "↑↓ select · Tab complete · Enter run · Esc close";
}

/** Recompute palette items for the S.current input (port of renderPalette). */
function onInputChange() {
    // Global Cmd-K mode has its own input; the composer palette is composer-only.
    if (S.cmdkOpen) return;
    const v = S.inputText;
    const tok = slashTokenFor(v);
    if (!tok || tok.text.includes(" ")) {
        hidePalette();
        return;
    }
    const q = tok.text.toLowerCase().slice(0, 120);
    const all = [
        ...APP_COMMANDS.filter((c) => !c.hidden),
        ...S.commandsCache.filter((c) => c && c.name && !c.app),
    ];
    const items = all
        .map((c) => ({ c, s: fuzzyScore(String(c.name).toLowerCase(), q) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => {
            if (a.s !== b.s) return b.s - a.s;
            const ra = recentRank("/" + a.c.name);
            const rb = recentRank("/" + b.c.name);
            if (ra !== rb) return ra - rb;
            return a.c.name.localeCompare(b.c.name);
        })
        .slice(0, 60)
        .map((x) => x.c);
    if (!items.length) {
        hidePalette();
        return;
    }
    S.paletteItems = items;
    if (S.paletteIndex >= items.length) S.paletteIndex = 0;
    S.paletteOpen = true;
}

/** Tab-complete or run the selected palette item. */
function applyPaletteItem(run) {
    const v = S.inputText;
    const tok = slashTokenFor(v);
    const cmd = S.paletteItems[S.paletteIndex];
    if (!tok || !cmd) return;
    const head = v.slice(0, tok.start - 1);
    S.inputText = head + "/" + cmd.name + " ";
    hidePalette();
    onInputChange(); // complete the token (some commands show arg hints)
    if (run) send();
}

function paletteNav(dir) {
    if (!S.paletteOpen || !S.paletteItems.length) return;
    S.paletteIndex =
        (S.paletteIndex + dir + S.paletteItems.length) % S.paletteItems.length;
}

function palettePick(i) {
    S.paletteIndex = i;
    applyPaletteItem(false);
}

/* ================= global palette (Cmd-K) ================= */

function cmdkCandidates() {
    const out = [];
    const seen = new Set();
    for (const c of [...APP_COMMANDS, ...S.commandsCache]) {
        if (!c || !c.name || seen.has(c.name)) continue;
        seen.add(c.name);
        out.push({
            kind: "cmd",
            cmd: c,
            title: "/" + c.name,
            desc: c.description || "",
            src: c.app ? "pi" : c.source || "",
        });
    }
    return out;
}

function openCmdk() {
    S.cmdkOpen = true;
    S.cmdkIndex = 0;
    S.cmdkText = "";
    S.paletteOpen = false;
    S.paletteFoot =
        "↑↓ navigate · Enter run · Esc close · no search: recents first";
    // First time without cache: needs a live session to request get_commands.
    if (!S.commandsCache.length) {
        ensureRpc().then((ok) => {
            if (ok) sendCommand({ type: "get_commands" });
        });
    }
    renderCmdk();
}

function closeCmdk() {
    S.cmdkOpen = false;
    S.paletteFoot = "↑↓ select · Tab complete · Enter run · Esc close";
}

function toggleCmdk() {
    S.cmdkOpen ? closeCmdk() : openCmdk();
}

/** Build the Cmd-K groups for the S.current query (port of renderCmdk). */
function renderCmdk() {
    const raw = S.cmdkText.trim().toLowerCase();
    const q = raw.replace(/^\/model\s+/, "").slice(0, 120); // cap against giant pastes
    const cmds = cmdkCandidates();
    const groups = [];
    if (!raw) {
        // No search: recents (only ones that still exist) + commands A–Z.
        const byTitle = new Map(cmds.map((c) => [c.title.toLowerCase(), c]));
        const seenR = new Set();
        const recentRows = [];
        for (const r of loadRecents()) {
            const base = r.split(" ")[0].toLowerCase();
            let it = null;
            if (base === "/model" && r.length > 7) {
                const hit = (Array.isArray(S.allModels) ? allModels : []).find(
                    (m) =>
                        m &&
                        m.id &&
                        ("/model " + m.id).toLowerCase() === r.toLowerCase(),
                );
                if (hit)
                    it = {
                        kind: "model",
                        model: hit,
                        title: "/model " + hit.id,
                        desc:
                            (hit.provider ? hit.provider + " · " : "") +
                            (hit.name || hit.id),
                        src: hit.provider || "",
                    };
            } else if (byTitle.has(base)) {
                const c = byTitle.get(base);
                it = {
                    kind: "cmd",
                    cmd: c.cmd,
                    title: r,
                    desc: c.desc,
                    src: c.src,
                    args: r.slice(base.length).trim(),
                };
            }
            if (it && !seenR.has(it.title)) {
                seenR.add(it.title);
                recentRows.push(it);
            }
            if (recentRows.length >= RECENT_MAX) break;
        }
        if (recentRows.length)
            groups.push({ label: "RECENT", rows: recentRows });
        groups.push({
            label: "COMMANDS",
            rows: cmds
                .filter(
                    (c) =>
                        ![...seenR].some(
                            (t) =>
                                t.split(" ")[0].toLowerCase() ===
                                c.title.toLowerCase(),
                        ),
                )
                .sort((a, b) => a.title.localeCompare(b.title)),
        });
    } else {
        const cmdRows = cmds
            .map((c) => ({
                c,
                s: fuzzyScore((c.title + " " + c.desc).toLowerCase(), raw),
            }))
            .filter((x) => x.s >= 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 30)
            .map((x) => ({
                kind: "cmd",
                cmd: x.c.cmd,
                title: x.c.title,
                desc: x.c.desc,
                src: x.c.src,
            }));
        if (cmdRows.length) groups.push({ label: "COMMANDS", rows: cmdRows });
        const mRows = (Array.isArray(S.allModels) ? allModels : [])
            .map((m) => ({
                m,
                s:
                    m && m.id
                        ? fuzzyScore(
                              (
                                  m.id +
                                  " " +
                                  (m.name || "") +
                                  " " +
                                  (m.provider || "")
                              ).toLowerCase(),
                              q,
                          )
                        : -1,
            }))
            .filter((x) => x.s >= 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 15)
            .map((x) => ({
                kind: "model",
                model: x.m,
                title: "/model " + x.m.id,
                desc:
                    (x.m.provider ? x.m.provider + " · " : "") +
                    (x.m.name || x.m.id),
                src: x.m.provider || "",
            }));
        if (mRows.length) groups.push({ label: "MODELS", rows: mRows });
    }
    S.cmdkGroups = groups;
    S.cmdkItems = groups.flatMap((g) => g.rows);
    if (S.cmdkIndex >= S.cmdkItems.length) S.cmdkIndex = 0;
}

function cmdkNav(dir) {
    if (!S.cmdkItems.length) return;
    S.cmdkIndex = (S.cmdkIndex + dir + S.cmdkItems.length) % S.cmdkItems.length;
}

/** Run a Cmd-K item: models apply directly; commands fill the composer. */
function runCmdkItem(i) {
    const it = S.cmdkItems[typeof i === "number" ? i : S.cmdkIndex];
    if (!it) return;
    if (it.kind === "model") {
        const m = it.model;
        closeCmdk();
        applyModel(m);
        pushRecent("/model " + m.id);
        return;
    }
    const line = "/" + it.cmd.name + (it.args ? " " + it.args : "");
    if (!it.cmd.app) pushRecent(line);
    closeCmdk();
    if (!it.cmd.app) {
        // Extension command: complete in the composer (template may take args) without sending.
        S.inputText = line + " ";
        onInputChange();
        return;
    }
    S.inputText = line;
    send(); // the app branch of send() records the recent and executes
}

/* ================= app commands ================= */
// Local commands: executed by the app, never sent to the model.

function runLogin(arg) {
    const p = (arg || "").trim();
    if (!p) {
        setStatus("usage: /login <provider>");
        return;
    }
    startLogin(p);
}

// App commands: run in the deck, never sent to the model. `needsRpc` commands
// need the pi process alive — send() connects first when required.

/** Recognize `/name args` as an app command. */
function parseAppCommand(message) {
    const m = String(message || "").match(/^\/([A-Za-z0-9:_-]+)\s*([\s\S]*)$/);
    if (!m) return null;
    const cmd = APP_COMMANDS.find((c) => c.name === m[1]);
    return cmd ? { cmd, args: m[2].trim() } : null;
}

/** /undo — returns queued messages to the composer (clear_queue without abort). */
async function desfazerFila() {
    if (!S.current) {
        note("no session open");
        return;
    }
    if (!S.current.connected && !(await ensureRpc())) return;
    const t = S.tabs.find((x) => S.current && x.key === S.current.key);
    const empty =
        !(t && t.queue && t.queue.length) &&
        !localRows(t).some((e) => e.state === "queued");
    if (empty) {
        note("nothing queued to undo");
        return;
    }
    sendCommand({ type: "clear_queue" });
}

/* ================= sidebar (project tree) ================= */

async function loadSessions() {
    try {
        const groups = JSON.parse(await inv("list_sessions"));
        // A project opened now (+ New / + Folder) has no .jsonl yet — pi only writes
        // on the first message. Without this the project never shows in the list.
        for (const t of S.tabs) {
            if (!t.cwd || groups.some((g) => g.path === t.cwd)) continue;
            groups.push({
                path: t.cwd,
                name: t.cwd.split("/").pop() || t.cwd,
                sessions: [],
            });
        }
        const visible = groups.filter(
            (g) => !hiddenProjects.has(g.path) || S.uiSettings.showHidden,
        );
        if (!visible.length) {
            S.sidebarGroups = [];
            S.sidebarEmpty = "no sessions in ~/.pi/agent/sessions";
            S.sidebarError = "";
            return;
        }
        // Titles are cached: the open tab shows the same name as the list.
        for (const g of visible) {
            for (const s of g.sessions) {
                if (s.title) sessionTitles.set(s.id, s.title);
                const tab = S.tabs.find((t) => t.key === s.id);
                if (tab && s.title && tab.label !== s.title)
                    tab.label = s.title;
            }
        }
        const treeInit = lsGet(LS.treeInit, null);
        if (treeInit == null) {
            for (const g of visible) collapsedProjects.add(g.path);
            saveTreeState();
            lsSet(LS.treeInit, "1");
        }
        S.sidebarError = "";
        S.sidebarEmpty = "";
        S.sidebarGroups = visible.map((g) => {
            const isCollapsed = collapsedProjects.has(g.path);
            const isHome = S.homeDir && g.path === S.homeDir;
            const shown = expandedProjects.has(g.path)
                ? g.sessions
                : g.sessions.slice(0, SESS_PAGE);
            return {
                path: g.path,
                name: isHome ? "no project" : g.name || g.path,
                isHome,
                collapsed: isCollapsed,
                hidden: hiddenProjects.has(g.path),
                count: g.sessions.length,
                sessions: shown,
                moreCount: g.sessions.length - shown.length,
            };
        });
    } catch (e) {
        S.sidebarGroups = [];
        S.sidebarEmpty = "";
        S.sidebarError = String(e);
    }
}

function toggleGroup(path) {
    if (collapsedProjects.has(path)) collapsedProjects.delete(path);
    else collapsedProjects.add(path);
    saveTreeState();
    loadSessions();
}

function hideToggle(path) {
    if (hiddenProjects.has(path)) hiddenProjects.delete(path);
    else hiddenProjects.add(path);
    saveTreeState();
    loadSessions();
}

function loadMoreProjects(path) {
    expandedProjects.add(path);
    saveTreeState();
    loadSessions();
}

function sessionClick(g, s) {
    openSession(s.cwd || g.path, s);
}
function searchResultClick(r) {
    openSession(r.cwd, r);
}

/* ================= global session search ================= */

function searchActive() {
    return (
        S.searchFilter.trim() !== "" ||
        S.toolFilter.trim() !== "" ||
        S.errorsOnly
    );
}

function scheduleSearch() {
    // Filters show on focus/S.typing; with no criteria the normal tree comes back.
    const on = searchActive();
    if (!on) {
        S.searchResults = [];
        S.searchMeta = { on: false, text: "" };
        S.searchMore = { on: false, count: 0 };
        loadSessions();
        return;
    }
    S.searchMeta = { on: true, text: "searching…" };
    S.searchMore = { on: false, count: 0 };
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(false), 300);
}

async function runSearch(append) {
    if (!append) searchOffset = 0;
    S.searchMeta = { on: true, text: "searching…" };
    try {
        const raw = await inv("search_sessions", {
            query: S.searchFilter,
            tool: S.toolFilter,
            errorsOnly: S.errorsOnly,
            limit: SEARCH_PAGE,
            offset: searchOffset,
        });
        const res = JSON.parse(raw);
        const items = (res && res.results) || [];
        if (!append) S.searchResults = [];
        for (const r of items) S.searchResults.push(r);
        searchOffset += items.length;
        const total = (res && res.total) || 0;
        let meta = total + " session(s)";
        if (res && res.truncated) meta += " · read cap reached";
        if (searchOffset < total) meta += " · showing " + searchOffset;
        S.searchMeta = { on: true, text: meta };
        S.searchMore =
            searchOffset < total
                ? { on: true, count: total - searchOffset }
                : { on: false, count: 0 };
        if (!items.length && !append && searchOffset === 0)
            S.searchMeta = { on: true, text: "nothing found" };
    } catch (e) {
        S.searchMeta = { on: true, text: String(e) };
        S.searchMore = { on: false, count: 0 };
    }
}

function clearSearch() {
    S.searchFilter = "";
    S.toolFilter = "";
    S.errorsOnly = false;
    scheduleSearch();
}

/* ================= session lifecycle ================= */

async function start(cwd, key, refValue, refFlag, childrenDir) {
    // New session / switch: reset pagination and hide the bar inherited from before.
    resetPaged();

    // Clicking the already-open session: reload history instead of ignoring.
    if (S.current && S.current.key === key) {
        if (refFlag !== "--session-id" && refValue)
            await loadHistoryFromDisk(refValue);
        if (await ensureRpc()) sendCommand({ type: "get_messages" });
        return;
    }
    // Yes, the previous session ends — but never mid-turn and always with state
    // cleaned up (otherwise the tab stays "connected" to a dead process).
    if (S.current) {
        const prev = S.tabs.find((x) => x.key === S.current.key);
        if (!(prev && prev.working)) {
            try {
                await inv("stop_session", { sessionId: S.current.key });
            } catch {
                /* already stopped */
            }
            stopLive(S.current.key);
        }
    }
    stashDraft();
    S.viewSeq++;
    S.current = {
        key,
        cwd,
        childrenDir,
        refValue,
        refFlag: refFlag || "--session",
    };
    cards.clear();
    pendingPromptRows.clear();
    lastSnap = null;
    lastDiskList = null;
    resetFiles();
    S.stream = null;
    S.sessionState = null;
    // A fresh session has no cache: clear the list so it doesn't show the previous
    // model's thinking levels.
    fillLevels([]);
    S.allModels = [];
    S.rows = [];
    S.childRows = [];
    S.detail = null;
    extRowsByKey.clear();
    setTyping(false);
    restoreDraft(S.tabs.find((t) => t.key === key) || null);
    // `+`, `+ New` and `+ Folder` open a session without history; the empty-state
    // overlay is opaque and covers #log, so without this it looks like nothing opened.
    setEmptyState(false);
    S.subsError = "";
    renderSubs();
    setStatus("starting… " + prettyId(key));

    // History comes from disk first: it doesn't depend on the RPC responding.
    if (refFlag !== "--session-id" && refValue)
        await loadHistoryFromDisk(refValue);

    try {
        await inv("start_session", {
            sessionId: key,
            cwd,
            refFlag: refFlag || "--session",
            refValue,
        });
        // The process already exists: register the tab and the LRU queue even if the
        // view changed, or it becomes an orphan (no ✕, no eviction, counts in procinfo).
        if (!S.tabs.find((t) => t.key === key)) {
            S.tabs = [
                ...S.tabs,
                {
                    key,
                    cwd,
                    childrenDir,
                    refValue,
                    refFlag: refFlag || "--session",
                    file:
                        (refFlag || "--session") === "--session"
                            ? refValue
                            : null,
                    label: sessionTitles.get(key) || "",
                },
            ];
        }
        const tab = S.tabs.find((t) => t.key === key);
        if (tab) tab.connected = true;
        if (!S.liveOrder.includes(key)) S.liveOrder = [...S.liveOrder, key];
        updateProcCount();
        // Another session took the view while the process was starting: don't steal back.
        if (!S.current || S.current.key !== key) return;
        setStatus("connected · " + prettyId(key));
        setState("ready");
        S.current.connected = true;
        S.activeTab = tab || null;
        if (childrenDir) await loadChildren(childrenDir);
        // A new session only gets its .jsonl on the first message: get_state brings
        // sessionFile, without which "load earlier" and the Files pane have no path.
        sendCommand({ type: "get_state" });
        if (S.panelPane === "files") loadEdits();
    } catch (e) {
        // An error from another session must not land in this one's transcript.
        if (!S.current || S.current.key !== key) return;
        setStatus("error");
        note(e);
    }
}

/** Open a session = read-only. No `pi` process is spawned here. */
async function openSession(cwd, s) {
    if (S.current && S.current.key === s.id) {
        await loadHistoryFromDisk(s.file);
        return;
    }

    stashDraft();
    S.viewSeq++;
    resetPaged();
    S.current = {
        key: s.id,
        cwd,
        childrenDir: s.file.replace(/\.jsonl$/, ""),
        refValue: s.file,
        refFlag: "--session",
        file: s.file,
        connected: false,
    };
    cards.clear();
    pendingPromptRows.clear();
    lastSnap = null;
    lastDiskList = null;
    extRowsByKey.clear();
    resetFiles();
    S.stream = null;
    S.sessionState = null;
    // openSession is read-only: clear the list so it doesn't inherit the previous
    // view's thinking levels.
    fillLevels([]);
    S.allModels = S.allModels; // keep cached models
    S.rows = [];
    S.childRows = [];
    S.detail = null;
    setEmptyState(false);
    setTyping(false);
    setStatus("read-only");
    setState("off");

    const existing = S.tabs.find((t) => t.key === s.id);
    if (!existing) {
        S.tabs = [
            ...S.tabs,
            {
                key: s.id,
                cwd,
                childrenDir: S.current.childrenDir,
                refValue: s.file,
                refFlag: "--session",
                file: s.file,
                connected: false,
                label: s.title || "",
            },
        ];
    } else {
        existing.file = s.file;
        existing.childrenDir = S.current.childrenDir;
        if (s.title) existing.label = s.title;
    }
    S.activeTab = S.tabs.find((t) => t.key === s.id) || null;
    if (
        S.activeTab &&
        Array.isArray(S.activeTab.levelList) &&
        S.activeTab.levelList.length
    )
        fillLevels(S.activeTab.levelList.slice());
    if (S.activeTab && S.activeTab.model) {
        S.sessionState = {
            model: S.activeTab.model,
            thinkingLevel: S.activeTab.thinkingLevel || null,
        };
        updateModelButton(S.activeTab.model);
    }
    restoreDraft(S.activeTab);

    await loadHistoryFromDisk(s.file);

    // History model (no RPC) + cached catalog so the selector is already filled.
    if (!modelsByProvider.size) loadCachedModels();
    try {
        const parsed = JSON.parse(
            String(await inv("session_model", { path: s.file })),
        );
        if (S.current && S.current.key !== s.id) return; // switched sessions while reading
        if (parsed && parsed.id) {
            const full = S.allModels.find((m) => m.id === parsed.id) || parsed;
            S.sessionState = {
                ...(S.sessionState || {}),
                model: { ...full, provider: parsed.provider || full.provider },
            };
            updateModelButton(S.sessionState.model);
        }
    } catch {
        /* session without model_change */
    }

    await loadChildren(S.current.childrenDir);

    // Connect on open: context, thinking, model and commands come from pi.
    await ensureRpc();
    checkAuth();
    if (S.panelPane === "files") loadEdits();
}

function newSessionIn(cwd) {
    const key = "ui-" + Date.now().toString(36);
    return start(cwd, key, key, "--session-id", null);
}

function newsession() {
    let cwd = "/";
    (async () => {
        try {
            cwd = await inv("home_dir");
        } catch {
            /* root */
        }
        await newSessionIn(cwd);
    })();
}

async function addProject() {
    let path = "";
    try {
        path = String(await inv("pick_directory")).trim();
    } catch (e) {
        if (!String(e).includes("cancelado")) setStatus(e);
        return;
    }
    if (!path) return;
    // Chosen project: open expanded when the list reloads.
    collapsedProjects.delete(path);
    hiddenProjects.delete(path);
    saveTreeState();
    await newSessionIn(path);
    setTimeout(() => loadSessions(), 1200);
}

function askDeleteSession(s) {
    confirmRun("move to trash: " + s.file, async () => {
        if (S.current && S.current.key === s.id) {
            try {
                await closeTab(s.id);
            } catch {
                /* already closed */
            }
        }
        try {
            const out = await inv("delete_session", { file: s.file });
            setStatus(String(out));
            await loadSessions();
        } catch (e) {
            setStatus("error: " + e);
        }
    });
}

async function ensureRpc() {
    if (!S.current) return false;
    if (S.current.connected) return true;
    const key = S.current.key;
    // A repeated key (reconnect after a dead process) inflated the count and
    // evicted a live session with fewer than MAX_LIVE real processes.
    S.liveOrder = [...new Set(S.liveOrder)];

    // Shrink to the cap. Wrong victim here kills an in-flight turn (bug: send in A,
    // send in B, A dies) — only idle S.tabs leave, never the S.current one.
    while (S.liveOrder.length >= MAX_LIVE) {
        const victim = S.liveOrder.find(
            (k) =>
                k !== key && !(S.tabs.find((t) => t.key === k) || {}).working,
        );
        if (!victim) break; // all busy: prefer exceeding the cap over losing work
        S.liveOrder = S.liveOrder.filter((k) => k !== victim);
        try {
            await inv("stop_session", { sessionId: victim });
        } catch {
            /* already stopped */
        }
        const t = S.tabs.find((x) => x.key === victim);
        if (t) t.connected = false;
    }

    const { cwd, refValue, refFlag, file } = S.current;
    // The process belongs to this key; if the view changed meanwhile, the previous
    // session's state must not be announced as if it were the S.current one.
    const isCurrent = () => !!S.current && S.current.key === key;
    try {
        await inv("start_session", {
            sessionId: key,
            cwd,
            refFlag: refFlag || "--session",
            refValue: refValue || file,
        });
    } catch (e) {
        if (isCurrent()) {
            setStatus("error starting pi");
            note(e);
        }
        return false;
    }
    if (isCurrent()) S.current.connected = true;
    const tab = S.tabs.find((t) => t.key === key);
    if (tab) tab.connected = true;
    // Dedupe: a leftover key from a dead process inflated the queue and triggered
    // premature eviction of a live session.
    if (!S.liveOrder.includes(key)) S.liveOrder = [...S.liveOrder, key];
    updateProcCount();
    if (isCurrent()) {
        setStatus("connected · " + prettyId(key));
        setState("ready");
        // Fresh process: the session's model/context/file come from here.
        sendCommand({ type: "get_state" });
    }
    return true;
}

function stopLive(key) {
    S.liveOrder = S.liveOrder.filter((k) => k !== key);
    const t = S.tabs.find((x) => x.key === key);
    if (t) t.connected = false;
    setTurn(key, false);
    updateProcCount();
}

async function reloadSession() {
    if (!S.current) return;
    const { key, cwd, childrenDir, refValue, refFlag } = S.current;
    setStatus("restarting…");
    try {
        await inv("stop_session", { sessionId: key });
    } catch {
        /* already stopped */
    }
    S.current = null;
    S.sessionState = null;
    S.allModels = [];
    await start(cwd, key, refValue, refFlag, childrenDir);
}

/* ================= S.tabs ================= */

let lastTabsSave = 0;

function stashDraft() {
    const t = S.current && S.tabs.find((x) => x.key === S.current.key);
    if (!t) return;
    t.draft = S.inputText;
    t.images = S.pendingImages.slice();
    // In-flight partial answer: keep it per tab so it can be re-attached on return.
    if (S.stream && S.stream.text)
        t.streamText = String(S.stream.text).slice(-STREAM_CAP);
    saveTabs();
}

/** Restore the draft of the tab that just got focus (empty for a new tab). */
function restoreDraft(t) {
    S.inputText = (t && t.draft) || "";
    // S.inputText is the single source of truth (bound in the composer)
    S.pendingImages.splice(
        0,
        S.pendingImages.length,
        ...(t && Array.isArray(t.images) ? t.images : []),
    );
    hidePalette();
    onInputChange();
}

/** Tab state: a running turn outranks the connection. */
function tabState(t) {
    if (t.working) return { label: "running", dot: " busy" };
    if (t.connected) return { label: "connected", dot: " live" };
    return { label: "read-only", dot: "" };
}

async function switchTab(key) {
    const t = S.tabs.find((x) => x.key === key);
    if (!t || (S.current && S.current.key === key)) return;

    stashDraft();
    S.viewSeq++;
    resetPaged();
    S.current = {
        key: t.key,
        cwd: t.cwd,
        childrenDir: t.childrenDir,
        refValue: t.refValue,
        refFlag: t.refFlag,
        file: t.file,
        connected: !!t.connected,
    };
    S.activeTab = t;
    cards.clear();
    // pendingPromptRows is NOT cleared here: the prompt answer can arrive after the
    // tab switch and still needs to mark the row as "queued".
    lastSnap = null;
    lastDiskList = null;
    extRowsByKey.clear();
    resetFiles();
    S.stream = null;
    S.sessionState = null;
    // Session switch: never paint the previous session's thinking list.
    fillLevels([]);
    if (Array.isArray(t.levelList) && t.levelList.length)
        fillLevels(t.levelList.slice());
    if (t.model) {
        S.sessionState = {
            model: t.model,
            thinkingLevel: t.thinkingLevel || null,
        };
        updateModelButton(t.model);
    }
    // Context chip is per session: repaint from cache; get_session_stats below refreshes.
    if (t.stats) {
        S.sessionState = { ...(S.sessionState || {}), stats: t.stats };
        updateStats(t.stats);
    }
    S.rows = [];
    restoreLocalRows();
    setStatus(t.connected ? "connected · " + prettyId(t.key) : "read-only");
    setState(t.connected ? "ready" : "off");
    applyTurnUi();
    restoreDraft(t);

    if (t.file) await loadHistoryFromDisk(t.file);
    // Always verify the process before talking to it (the `connected` flag can be
    // stale after exit/eviction). ensureRpc returns true immediately when alive.
    if (await ensureRpc()) {
        sendCommand({ type: "get_messages" });
        sendCommand({ type: "get_state" });
        sendCommand({ type: "get_session_stats" });
    }
    if (t.childrenDir) await loadChildren(t.childrenDir);
    if (S.panelPane === "files") loadEdits();
    // Every tab mutation persists (the original renderTabs path did this too).
    saveTabs();
}

async function closeTab(key) {
    try {
        await inv("stop_session", { sessionId: key });
    } catch {
        /* already stopped */
    }
    stopLive(key);
    const wasActive = S.current && S.current.key === key;
    S.tabs = S.tabs.filter((t) => t.key !== key);

    if (wasActive) {
        // New generation: an in-flight read of the closed tab must not paint the empty view.
        S.viewSeq++;
        S.current = null;
        S.activeTab = null;
        cards.clear();
        pendingPromptRows.clear();
        lastSnap = null;
        lastDiskList = null;
        extRowsByKey.clear();
        resetPaged();
        resetFiles();
        S.rows = [];
        S.stream = null;
        S.detail = null;
        const next = S.tabs[S.tabs.length - 1];
        if (next) await switchTab(next.key);
        else {
            setStatus("disconnected");
            setTyping(false);
            setState("off");
        }
        saveTabs();
        return;
    }
    saveTabs();
}

/** Serialize S.tabs (data only: no DOM, no images, no live flags). */
function saveTabs() {
    try {
        const slim = S.tabs.map((t) => ({
            key: t.key,
            cwd: t.cwd || null,
            childrenDir: t.childrenDir || null,
            refValue: t.refValue || null,
            refFlag: t.refFlag || "--session",
            file: t.file || null,
            label: t.label || "",
            draft: String(t.draft || "").slice(-DRAFT_CAP),
            streamText: String(t.streamText || "").slice(-STREAM_CAP),
            model: t.model || null,
            thinkingLevel: t.thinkingLevel || null,
            levelList: Array.isArray(t.levelList)
                ? t.levelList.slice(0, 50)
                : [],
            stats: t.stats || null,
            queue: Array.isArray(t.queue) ? t.queue.slice(0, 20) : [],
        }));
        const activeKey = S.activeTab
            ? S.activeTab.key
            : S.current
              ? S.current.key
              : null;
        lsSet(LS.tabs, JSON.stringify({ tabs: slim, activeKey }));
        lastTabsSave = Date.now();
    } catch {
        /* no storage */
    }
}

function maybeSaveTabs() {
    if (Date.now() - lastTabsSave > 3000) saveTabs();
}

/** Restore S.tabs as read-only: nothing connects here, focus reconnects via ensureRpc. */
function restoreTabs() {
    let raw = null;
    try {
        raw = JSON.parse(lsGet(LS.tabs, "null"));
    } catch {
        raw = null;
    }
    const list = raw && Array.isArray(raw.tabs) ? raw.tabs : [];
    S.tabs = list
        .filter((t) => t && typeof t.key === "string" && t.key)
        .map((t) => ({
            key: t.key,
            cwd: t.cwd || null,
            childrenDir: t.childrenDir || null,
            refValue: t.refValue || null,
            refFlag: t.refFlag || "--session",
            file: t.file || null,
            label: t.label || "",
            draft: t.draft || "",
            images: [],
            streamText: t.streamText || "",
            model: t.model || null,
            thinkingLevel: t.thinkingLevel || null,
            levelList: Array.isArray(t.levelList) ? t.levelList : [],
            stats: t.stats || null,
            queue: Array.isArray(t.queue) ? t.queue : [],
            connected: false,
            working: false,
            phase: "",
        }));
    const key = raw && raw.activeKey;
    S.activeTab = S.tabs.find((t) => t.key === key) || null;
}

/* ================= history (paged, from disk) ================= */

function resetPaged() {
    loadedConsumed = 0;
    S.loadMore = { on: false, text: "", busy: false };
}

function resetFiles() {
    S.editedFiles = [];
    S.editsError = "";
    S.filesCount = 0;
}

function updateLoadMore(meta) {
    if (!meta || !meta.hasMore) {
        S.loadMore = { on: false, text: "", busy: false };
        return;
    }
    loadedConsumed = meta.consumed || messages0(meta);
    const left = Math.max(0, (meta.total || 0) - loadedConsumed);
    S.loadMore = {
        on: true,
        text: "load earlier (" + left + " of " + (meta.total || 0) + ")",
        busy: false,
    };
}

function messages0(meta) {
    return (meta.total || 0) - (meta.omitted || 0) - (meta.oversized || 0);
}

async function loadEarlier() {
    const file = S.current && S.current.file;
    if (!file) return;
    const seq = S.viewSeq;
    S.loadMore = { ...S.loadMore, busy: true };
    try {
        const raw = await inv("read_session_messages", {
            path: file,
            limit: 250,
            skip: loadedConsumed,
        });
        if (seq !== S.viewSeq) return; // session changed: don't insert into the new log
        const { messages, meta } = parseSessionFile(raw);
        if (!messages.length) {
            updateLoadMore(meta);
            return;
        }
        const older = buildRows(messages, { main: false, store: new Map() });
        S.rows = [...older, ...S.rows];
        updateLoadMore(meta);
        // Keep the reading position anchored to what was on top before the prepend.
        const l = S.refs.log;
        if (l) {
            const before = l.scrollTop;
            requestAnimationFrame(() => {
                l.scrollTop += l.scrollHeight - before;
            });
        }
    } catch (e) {
        if (seq !== S.viewSeq) return;
        note(e);
    } finally {
        S.loadMore = { ...S.loadMore, busy: false };
    }
}

async function loadHistoryFromDisk(file) {
    const seq = S.viewSeq;
    try {
        loadedConsumed = 0;
        const raw = await inv("read_session_messages", {
            path: file,
            limit: 250,
        });
        // Switched sessions while reading: this history is no longer for the view.
        if (seq !== S.viewSeq) return;
        const { messages, meta } = parseSessionFile(raw);
        if (messages.length) {
            cards.clear();
            S.stream = null;
            S.rows = buildRows(messages, { main: true, keepNote: true });
            restoreLocalRows();
            reattachStream();
            setEmptyState(false);
            scrollBottom(true);
        }
        updateLoadMore(meta);
        if (S.current && !messages.length) setEmptyState(true, "newsession");
    } catch {
        /* the RPC may still fill it in */
    }
}

/* ================= streaming ================= */
// S.stream = { mdRowId, thinkRowId, text, thinkText } — the in-flight answer of the
// focused session. Per-tab `streamText` keeps partials across tab switches.

function applyTurnUi() {
    const t = S.current ? S.tabs.find((x) => x.key === S.current.key) : null;
    const on = !!(t && t.working);
    setTyping(on, (t && t.phase) || "thinking…");
    if (on) {
        setStatus("working");
        setState("busy");
    }
}

let streamRenderRaf = 0;

/** Coalesce markdown re-renders of the streamed text to one per frame. */
function scheduleStreamRender() {
    if (streamRenderRaf) return;
    streamRenderRaf = requestAnimationFrame(() => {
        streamRenderRaf = 0;
        if (!S.stream) return;
        if (S.stream.mdRowId) {
            const row = S.rows.find((r) => r.id === S.stream.mdRowId);
            if (row) {
                row.raw = S.stream.text;
                row.html = renderMarkdown(S.stream.text);
            }
        }
        if (S.stream.thinkRowId) {
            const row = S.rows.find((r) => r.id === S.stream.thinkRowId);
            if (row) row.text = S.stream.thinkText || "";
        }
    });
}

/** Re-attach the partial answer when switching back (disk history doesn't have it). */
function reattachStream() {
    if (S.stream || !S.current) return;
    const t = S.tabs.find((x) => x.key === S.current.key);
    if (!t || !t.streamText) return;
    const row = {
        id: nextId(),
        kind: "md",
        raw: t.streamText,
        html: renderMarkdown(t.streamText),
        forkText: "",
        forkMsg: "",
        forkIndex: -1,
    };
    S.rows.push(row);
    S.stream = {
        mdRowId: row.id,
        thinkRowId: null,
        text: t.streamText,
        thinkText: "",
    };
    scrollBottom(true);
}

/* ================= diagnostics ================= */

let debugEnabled = false;

function debugNote(text) {
    if (!debugEnabled) return;
    try {
        inv("debug_note", { msg: String(text) }).catch(() => {});
    } catch {
        /* ignore */
    }
}

function diagPush(cmd, lat, res) {
    diagSeq += 1;
    S.diagBuf.push({
        _k: diagSeq,
        cmd: String(cmd == null ? "" : cmd).slice(0, 220),
        lat: lat || "—",
        res: res || "",
    });
    if (S.diagBuf.length > DIAG_MAX)
        S.diagBuf.splice(0, S.diagBuf.length - DIAG_MAX);
    if (S.panelPane === "diag") renderDiag();
}

function renderDiag() {
    S.diagHead = S.diagBuf.length + " line(s) (max " + DIAG_MAX + ")";
}

function diagClear() {
    S.diagBuf.splice(0, S.diagBuf.length);
    diagPending.clear();
    renderDiag();
}

/* ================= RPC command sending ================= */

function sendCommand(payload) {
    if (!S.current) {
        note("no session open");
        return;
    }
    payload.id = "ui-" + ++seq;
    // Diagnostics: mark the send to measure latency on the response.
    try {
        diagPending.set(payload.id, Date.now());
        diagPush("→ " + (payload.type || "?"), "—", payload.id);
    } catch {
        /* ignore */
    }
    inv("rpc_command", {
        sessionId: S.current.key,
        payload: JSON.stringify(payload),
    }).catch((e) => {
        note("failed to send " + (payload.type || "command") + ": " + e);
        if (payload.type === "compact") resetCompact();
    });
}

/* ================= RPC responses ================= */

function renderMainMessages(data) {
    // Don't let an empty RPC answer wipe the history already rendered from disk.
    const messages = (data && data.messages) || [];
    if (!Array.isArray(messages) || !messages.length) return;
    cards.clear();
    S.stream = null;
    S.rows = buildRows(messages, { main: true, keepNote: false });
    restoreLocalRows();
    reattachStream();
    setEmptyState(false);
    scrollBottom(true);
}

function handleResponse(rec) {
    const data = rec.data || {};
    // Diagnostics: command latency (record only; the switch below is unchanged).
    try {
        const t0 = diagPending.get(rec.id);
        if (t0 != null) diagPending.delete(rec.id);
        diagPush(
            "← " + (rec.command || "?"),
            t0 == null ? "—" : Date.now() - t0 + "ms",
            rec.success ? "ok" : "failed",
        );
    } catch {
        /* diagnostics never break the response */
    }
    switch (rec.command) {
        case "prompt": {
            // disposition: started | queued | handled. Only "queued" gets the queue mark.
            const entry = pendingPromptRows.get(rec.id);
            if (entry) {
                pendingPromptRows.delete(rec.id);
                if (data.disposition === "queued") markRow(entry, "queued");
            }
            break;
        }
        case "clear_queue": {
            // Returns what was queued: the last one goes back to the composer.
            const back = [].concat(data.steering || [], data.followUp || []);
            const ct = S.tabs.find((x) => S.current && x.key === S.current.key);
            if (ct) {
                ct.queue = [];
                for (const entry of ct.localRows || [])
                    if (entry.state === "queued") markRow(entry, "cancelled");
            }
            if (!back.length) break;
            note("queue returned: " + back.length + " message(s)");
            const last = back.at(-1);
            S.inputText = last;
            S.inputText = last;
            const t = S.tabs.find((x) => S.current && x.key === x.key);
            if (t) t.draft = last;
            break;
        }
        case "get_fork_messages": {
            // Fork list (getUserMessagesForForking in pi): user messages with entryId.
            // Picking one creates a new session (case 'fork').
            const msgs = (data && data.messages) || [];
            // From a row-level button: try to resolve directly; no match, fall to picker.
            if (pendingForkAnchor) {
                const akey = pendingForkAnchor.key;
                if (!S.current || S.current.key !== akey) {
                    pendingForkAnchor = null;
                    break;
                }
                if (resolveForkAnchor(msgs)) break;
                note(
                    "could not find the message to fork — pick it from the list",
                );
            }
            if (!msgs.length) {
                note("nothing to fork: no user messages in this session");
                break;
            }
            openForkPop(msgs);
            break;
        }
        case "fork": {
            // Creation, not undo: pi rebinds the RPC to the new file (rebindSession) and
            // the original stays on disk. Position "before": the text returns to composer.
            if (rec.success === false) {
                note("fork failed");
                break;
            }
            if (data.cancelled) {
                note("fork cancelled");
                break;
            }
            const ft = data.text || "";
            if (ft) {
                S.inputText = ft;
                S.inputText = ft;
                const ft0 = S.tabs.find(
                    (x) => S.current && x.key === S.current.key,
                );
                if (ft0) ft0.draft = ft;
            }
            note(
                "fork created in a new session — the original was preserved" +
                    (ft ? " (text restored in the composer)" : ""),
            );
            pendingForkReload = true;
            sendCommand({ type: "get_state" });
            break;
        }
        case "get_messages":
            renderMainMessages(data);
            break;
        case "get_state":
            S.sessionState = data;
            if (S.current) {
                const tb = S.tabs.find((x) => x.key === S.current.key);
                if (tb) {
                    if (data.model) tb.model = data.model;
                    if (data.thinkingLevel)
                        tb.thinkingLevel = data.thinkingLevel;
                }
            }
            // Thinking is per session/model: always ask for the right list, not only after set_model.
            sendCommand({ type: "get_available_thinking_levels" });
            if (data.model) updateModelButton(data.model);
            // The real session file: a new session only gets its .jsonl on the 1st message.
            if (data.sessionFile) {
                const dir = data.sessionFile.replace(/\.jsonl$/, "");
                if (S.activeTab) {
                    S.activeTab.file = data.sessionFile;
                    S.activeTab.childrenDir = dir;
                }
                if (S.current) {
                    S.current.file = data.sessionFile;
                    S.current.childrenDir = dir;
                }
                // A session created with `+ New` is born without childrenDir: without this
                // the subagent pane has no source and lists nothing until reopened from sidebar.
                if (S.current) loadChildren(dir);
                if (S.panelPane === "files") loadEdits();
                // Post-fork: open the resulting new session (history + sidebar).
                if (pendingForkReload) {
                    pendingForkReload = false;
                    loadSessions();
                    loadHistoryFromDisk(data.sessionFile);
                }
            }
            fillLevels(null);
            S.autocompactOn = data.autoCompactionEnabled !== false;
            break;
        case "get_session_stats":
            updateStats(data);
            if (S.current) {
                const tb = S.tabs.find((x) => x.key === S.current.key);
                if (tb) tb.stats = data;
            }
            // Only narrate in the transcript when the user asked (/session or context chip).
            if (S.statsNoteRequested && data && data.tokens) {
                S.statsNoteRequested = false;
                const c =
                    typeof data.cost === "number"
                        ? " · US$ " + data.cost.toFixed(2)
                        : "";
                note(
                    "session: " +
                        data.totalMessages +
                        " messages · " +
                        data.tokens.total +
                        " tokens" +
                        c,
                );
            }
            break;
        case "get_last_assistant_text": {
            const text = (data && (data.text || data.content)) || "";
            if (!text) {
                note("no answer to copy");
                break;
            }
            inv("copy_text", { text })
                .then(() =>
                    note("answer copied (" + text.length + " characters)"),
                )
                .catch((e) => note("copy failed: " + e));
            break;
        }
        case "cycle_thinking_level":
            note(
                data && data.level
                    ? "thinking: " + data.level
                    : "model without thinking levels",
            );
            if (data && data.level) {
                S.sessionState = {
                    ...(S.sessionState || {}),
                    thinkingLevel: data.level,
                };
                if (S.current) {
                    const tb = S.tabs.find((x) => x.key === S.current.key);
                    if (tb) tb.thinkingLevel = data.level;
                }
                fillLevels(null);
            }
            break;
        case "set_model":
            // Thinking levels are per model (xhigh/max only exist on some): without this
            // the list would keep the previous model's and xhigh would never appear.
            if (rec.success) {
                sendCommand({ type: "get_available_thinking_levels" });
                sendCommand({ type: "get_state" });
            } else {
                note("set_model: failed");
            }
            break;
        case "compact":
            endCompact(rec.success ? "context compacted" : "failed to compact");
            break;
        case "export_html":
            note(
                "exported: " +
                    ((data && (data.path || data.outputPath)) || "ok"),
            );
            break;
        case "set_session_name":
            note("session renamed");
            break;
        case "abort":
            note("turn interrupted");
            setStatus("ready");
            setTurn(S.current && S.current.key, false);
            setState("ready");
            break;
        case "get_available_models":
            fillModels(
                data.models || [],
                !S.allModels.length ? data.models && data.models[0] : null,
            );
            break;
        case "get_available_thinking_levels":
            fillLevels(data.levels || []);
            if (S.current) {
                const tb = S.tabs.find((x) => x.key === S.current.key);
                if (tb) tb.levelList = (data.levels || []).slice();
            }
            break;
        case "get_commands":
            saveCommands(data.commands || []);
            checkCommands(data.commands || []);
            onInputChange();
            break;
        default:
            // No command may be silent: without a specific handler, record the result.
            if (rec.command)
                note(rec.command + ": " + (rec.success ? "ok" : "failed"));
            break;
    }
}

/* ================= composer ================= */

async function send() {
    const typed = S.inputText.trim();
    const hasImages = S.pendingImages.length > 0;
    if ((!typed && !hasImages) || !S.current) return;
    // Notification permission is requested on the gesture (the popup needs prior interaction).
    if (window.Notification && Notification.permission === "default") {
        try {
            Promise.resolve(Notification.requestPermission()).catch(() => {});
        } catch {
            /* ignore */
        }
    }
    // An image without text is valid: pi accepts an ImageContent-only prompt.
    const message = typed || "Attached image.";

    // An app command (/compact, /login, ...) runs here, never reaching the model.
    const app = parseAppCommand(message);
    if (app) {
        S.inputText = "";
        hidePalette();
        S.rows.push({
            id: nextId(),
            kind: "user",
            text: "▸ " + message,
            dataText: message,
            images: [],
            queueTag: null,
            forkText: "",
            forkMsg: "",
            forkIndex: -1,
        });
        scrollBottom(true);
        // A command that talks to pi needs the process alive (the session may be read-only).
        if (app.cmd.needsRpc && !(await ensureRpc())) {
            note("could not connect to pi to run /" + app.cmd.name);
            return;
        }
        pushRecent("/" + app.cmd.name + (app.args ? " " + app.args : ""));
        app.cmd.run(app.args);
        return;
    }

    if (!(await ensureRpc())) return;

    // Zero the tab's draft along with it: otherwise switching S.tabs and coming back
    // would resurrect the sent text.
    const t = S.tabs.find((x) => x.key === S.current.key);
    const wasWorking = !!(t && t.working);
    if (t) {
        t.draft = "";
        t.images = [];
    }

    // The RPC expects [base64, mimeType] pairs; capture before clearing.
    const sentImages = S.pendingImages.slice();
    S.pendingImages.splice(0, S.pendingImages.length);
    S.inputText = "";
    hidePalette();

    const id = "ui-" + ++seq;
    const key = S.current.key;
    // Local row: the queued message shows up in the transcript before it exists on disk.
    const row = {
        id: nextId(),
        kind: "user",
        text: "▸ " + message,
        dataText: message,
        images: sentImages.map((img) => img.dataUrl),
        queueTag: null,
        forkText: "",
        forkMsg: "",
        forkIndex: -1,
    };
    S.rows.push(row);
    // The row belongs to the tab (not just the global map): a tab switch must not
    // drop it before pi persists the message to the .jsonl.
    const entry = { key, text: message, row, state: "pending" };
    pendingPromptRows.set(id, entry);
    if (t) localRows(t).push(entry);
    scrollBottom();
    try {
        // Rust sends `streamingBehavior: "steer"`: with a running turn pi queues
        // (disposition "queued"); when idle it is ignored and the turn starts.
        await inv("send_prompt", {
            sessionId: key,
            message,
            id,
            images: sentImages.map((i) => [i.data, i.mime]),
        });
        if (!!S.current && S.current.key === key) {
            setStatus("working");
            setState("busy");
        }
        // A queued message does not restart the label of the turn that is already running.
        setTurn(
            key,
            true,
            wasWorking ? (t && t.phase) || "thinking…" : "sent…",
        );
        // A new session without a title yet: use the 1st message (same rule as read_title in Rust).
        if (t && !t.label) {
            t.label = message
                .split("\n")[0]
                .replace(/`/g, "")
                .trim()
                .slice(0, 48);
        }
    } catch (e) {
        pendingPromptRows.delete(id);
        if (S.current && S.current.key === key) note(String(e));
    }
}

/* ================= subagent pane ================= */

function noSubsMessage() {
    return S.caps.subagents === false
        ? "pi-subagents did not load in this session (possible tool conflict). See ⚙ → Packages & MCP."
        : "no subagents";
}

function renderChildren(list) {
    lastDiskList = Array.isArray(list) ? list : [];
    paintSubs();
}

/* Live and history merge: each source only updates its own state, and the paint
   draws both halves. A live run that matches a disk entry (by exact id) is not
   duplicated. */
function paintSubs() {
    const live = lastSnap && Array.isArray(lastSnap.runs) ? lastSnap.runs : [];
    const disk = (lastDiskList || []).filter(
        (c) => !live.some((r) => sameSub(r, c)),
    );
    if (!live.length && !disk.length) {
        S.subsList = [];
        S.subsError = "";
        S.subsWarn = S.caps.subagents === false;
        return;
    }
    S.subsError = "";
    S.subsWarn = false;
    const now = Date.now();
    const items = live.map((run) => ({ kind: "live", run, now }));
    if (disk.length) {
        items.push({ kind: "head", count: disk.length });
        for (const c of disk) items.push({ kind: "disk", c });
    }
    S.subsList = items;
}

function sameSub(r, c) {
    // Conservative dedupe: only hide the disk item when the id is exactly equal to
    // the live run's. The widget's run.id format is not verified (the producer is the
    // external pi-subagents extension), so loose equality could hide a real item.
    return (
        !!r &&
        !!c &&
        r.id != null &&
        c.id != null &&
        String(r.id) === String(c.id)
    );
}

function renderSubs(snap) {
    lastSnap =
        snap && Array.isArray(snap.runs) && snap.runs.length ? snap : null;
    paintSubs();
}

async function loadChildren(dir) {
    if (!dir) return;
    const seq = S.viewSeq;
    try {
        const list = JSON.parse(await inv("list_children", { dir }));
        // Comparing only the generation is not enough: `switchTab` calls this AFTER
        // the history await, so the read is born with the new generation and would
        // paint the previous tab's runs in the S.current one.
        if (seq !== S.viewSeq || !S.current || S.current.childrenDir !== dir)
            return;
        // Empty also renders: the merged paint keeps the live widget visible.
        renderChildren(list);
    } catch (e) {
        if (seq !== S.viewSeq) return;
        S.subsError = String(e);
        S.subsList = [];
        paintSubs();
    }
}

/* ================= files (edited) pane ================= */

async function loadEdits() {
    const file = S.current && S.current.file;
    const seq = S.viewSeq;
    if (!file) {
        S.editedFiles = [];
        S.editsError = "";
        renderFiles();
        return;
    }
    try {
        const list = JSON.parse(
            String(await inv("session_edits", { path: file })),
        );
        if (seq !== S.viewSeq) return; // switched sessions while reading
        S.editedFiles = Array.isArray(list) ? list : [];
        S.editsError = "";
    } catch (e) {
        if (seq !== S.viewSeq) return;
        S.editedFiles = [];
        S.editsError = String(e);
    }
    renderFiles();
}

function renderFiles() {
    const groups = new Map();
    for (const e of S.editedFiles) {
        if (!e || !e.file) continue;
        const g = groups.get(e.file) || { file: e.file, items: [], at: 0 };
        g.items.push(e);
        g.at = Math.max(g.at, Number(e.at) || 0);
        groups.set(e.file, g);
    }
    const list = [...groups.values()].sort((a, b) => b.at - a.at);
    S.filesCount = list.length || 0;
    S.fileGroups = list;
}

/** Opens the diff in the same S.detail panel as the subagents. */
function openDiffs(g) {
    const [name, dir] = splitPath(g.file);
    const items = g.items
        .slice()
        .reverse()
        .map((e) => ({
            tool: String(e.tool || "edit"),
            src: String(e.src || ""),
            at: Number(e.at) || 0,
            blocks: renderPatchBlocks(e.patch, g.file),
        }));
    S.detail = {
        kind: "file",
        title: name + (dir ? "  ·  " + dir : ""),
        file: g.file,
        items,
    };
}

/** Split a patch into header + @@ hunks, one undo button per undoable hunk.
    The backend refuses synthetic (only +) and truncated patches anyway. */
function renderPatchBlocks(patch, file) {
    const text = String(patch || "");
    const lines = text.split("\n");
    const blocks = [];
    if (!text.trim()) {
        blocks.push({
            line: "no diff (new file or content not recorded)",
            cls: "diff-meta",
        });
        return blocks;
    }
    const MAX = 1200;
    const truncated = text.includes("… patch truncado"); // marker written by the Rust backend
    const groups = [];
    let cur = { head: [], hunk: null };
    for (const line of lines.slice(0, MAX)) {
        if (line.startsWith("@@")) {
            if (cur.hunk || cur.head.length) groups.push(cur);
            cur = { head: [], hunk: [] };
        }
        if (cur.hunk) cur.hunk.push(line);
        else cur.head.push(line);
    }
    groups.push(cur);
    for (const g of groups) {
        for (const line of g.head)
            blocks.push({ line, cls: diffLineCls(line) });
        if (!g.hunk) continue;
        const undoable =
            !truncated &&
            !!file &&
            g.hunk.some((l) => l.startsWith("-") && !l.startsWith("---"));
        if (undoable) blocks.push({ undo: true, hunkText: g.hunk.join("\n") });
        for (const line of g.hunk)
            blocks.push({ line, cls: diffLineCls(line) });
    }
    if (lines.length > MAX) {
        blocks.push({
            line: "… " + (lines.length - MAX) + " line(s) omitted",
            cls: "diff-meta",
        });
    }
    return blocks;
}

function diffLineCls(line) {
    if (line.startsWith("+++") || line.startsWith("---")) return "diff-meta";
    if (line.startsWith("@@")) return "diff-hunk";
    if (line.startsWith("+")) return "diff-add";
    if (line.startsWith("-")) return "diff-del";
    return "diff-ctx";
}

async function revertHunk(file, hunkText) {
    if (!confirm("Revert this hunk in " + file + "?")) return;
    try {
        const res = await inv("revert_hunk", {
            cwd: S.current && S.current.cwd,
            file,
            hunk: hunkText,
        });
        note(String(res));
        loadEdits();
    } catch (e) {
        note("revert: " + e);
    }
}

async function openFileActions(action) {
    if (!S.detail || S.detail.kind !== "file") return;
    if (action === "copy") copyText(S.detail.file);
    if (action === "open") {
        try {
            await inv("open_file", {
                cwd: S.current && S.current.cwd,
                path: S.detail.file,
            });
        } catch (e) {
            note("open: " + e);
        }
    }
}

/* ================= missions pane ================= */

async function loadMissions() {
    try {
        const list = JSON.parse(String(await inv("missions_status")));
        S.missionsList = Array.isArray(list) ? list : [];
        S.missionsError = "";
    } catch (e) {
        S.missionsList = [];
        S.missionsError = String(e);
    }
}

/** Mission details in the same panel as diffs (display only, no runner). */
function openMission(m) {
    S.detail = {
        kind: "mission",
        title: String(m.title || m.id || "mission"),
        head: String(m.status || "?") + " · " + String(m.runs || 0) + " run(s)",
        rows: [
            ["project", m.cwd || m.project || "—"],
            ["id", m.id || "—"],
            ["updated", m.updatedAt || "—"],
        ],
    };
}

/* ================= S.detail panel ================= */

async function openChild(c) {
    if (!c || !c.file) return;
    const seq = S.viewSeq;
    S.detail = {
        kind: "child",
        title: (c.label || c.id.slice(0, 8)) + "  ·  " + c.run,
    };
    S.childError = "loading transcript…";
    S.childRows = [];
    try {
        const raw = await inv("read_session_messages", { path: c.file });
        if (seq !== S.viewSeq) return;
        const { messages } = parseSessionFile(raw);
        if (!messages.length) {
            S.childError = "empty transcript (file without messages)";
            return;
        }
        S.childError = "";
        S.childRows = buildRows(messages, { main: false, store: new Map() });
    } catch (e) {
        if (seq !== S.viewSeq) return;
        S.childError = String(e);
    }
}

function closeDetail() {
    S.detail = null;
}

/* ================= right panel switching ================= */

function switchPanel(name) {
    S.panelPane =
        name === "diag"
            ? "diag"
            : name === "missions"
              ? "missions"
              : name === "files"
                ? "files"
                : "subs";
    lsSet(LS.pane, S.panelPane);
    // Clicking a tab is also a "refresh": a subagent run appears on disk while the
    // turn runs, without waiting for the next agent_settled.
    if (S.panelPane === "subs" && S.current && S.current.childrenDir)
        loadChildren(S.current.childrenDir);
    if (S.panelPane === "files") loadEdits();
    if (S.panelPane === "missions") loadMissions();
    if (S.panelPane === "diag") renderDiag();
}

/* ================= packages / MCP / catalog / hooks ================= */

async function loadPkgs(highlight) {
    S.pkgListText = "loading…";
    try {
        const text = String(await inv("pi_list"));
        S.pkgListText = text;
        installedSet.clear();
        for (const s of parseInstalledSources(text)) installedSet.add(s);
    } catch (e) {
        S.pkgListText = String(e);
    }

    try {
        const raw = String(await inv("pi_mcp_list"));
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            /* came as error text */
        }
        S.mcpJson = parsed ? JSON.stringify(parsed, null, 2) : raw;
        S.mcpError = "";
        S.mcpServers =
            parsed && Array.isArray(parsed.servers) ? parsed.servers : [];
        S.mcpHighlight = highlight || null;
    } catch (e) {
        S.mcpError = String(e);
        S.mcpServers = [];
    }

    if (S.catalogObjects) renderCatalog();
}

function renderCatalog() {
    if (!S.catalogObjects) return;
    const q = String(S.catFilter || "").toLowerCase();
    S.catalogRows = S.catalogObjects.filter(
        (p) => !q || (p.name + " " + p.description).toLowerCase().includes(q),
    );
    debugNote(
        "catalog=" + S.catalogRows.length + "/" + S.catalogObjects.length,
    );
}

async function loadCatalog(force) {
    if (!force) {
        const cached = catalogFromCache();
        if (cached) {
            S.catalogObjects = cached;
            renderCatalog();
            return;
        }
    }
    S.catLoading = true;
    S.catError = "";
    try {
        const res = await fetch(
            "https://registry.npmjs.org/-/v1/search?text=keywords:pi-package&size=250",
        );
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const items = (data.objects || [])
            .filter(
                (o) =>
                    o &&
                    o.package &&
                    (o.package.keywords || []).includes("pi-package"),
            )
            .map((o) => ({
                name: o.package.name,
                version: o.package.version,
                description: o.package.description || "",
                downloads: (o.downloads && o.downloads.monthly) || 0,
            }));
        S.catalogObjects = items;
        try {
            lsSet(CATALOG_KEY, JSON.stringify({ at: Date.now(), items }));
        } catch {
            /* no storage */
        }
        renderCatalog();
    } catch (e) {
        S.catError = "registry lookup failed: " + String(e);
    }
    S.catLoading = false;
}

function catalogFromCache() {
    try {
        const raw = JSON.parse(lsGet(CATALOG_KEY, "null"));
        if (
            raw &&
            raw.at &&
            Date.now() - raw.at < CATALOG_TTL &&
            Array.isArray(raw.items)
        )
            return raw.items;
    } catch {
        /* ignore */
    }
    return null;
}

/* Explicit confirmation before writing anything. */
function confirmRun(cmdText, action) {
    pendingAction = action;
    S.confirmCmd = cmdText;
    S.confirmBar = true;
}

function closeConfirm() {
    pendingAction = null;
    S.confirmBar = false;
}

async function confirmOk() {
    const action = pendingAction;
    closeConfirm();
    if (action) await action();
}

function askInstall(p) {
    const spec = "npm:" + p.name + "@" + p.version;
    confirmRun("pi install " + spec, async () => {
        switchPkgPane("installed");
        S.pkgListText = "installing " + spec + "…";
        try {
            S.pkgListText = String(
                await inv("pi_install", { spec, local: false }),
            );
            await loadPkgs();
        } catch (e) {
            S.pkgListText = String(e);
        }
    });
}

function askRemove(p) {
    const spec = "npm:" + p.name;
    const extra =
        p.name === "pi-subagents"
            ? "\n(the subagent pane depends on this package)"
            : "";
    confirmRun("pi remove " + spec + extra, async () => {
        switchPkgPane("installed");
        S.pkgListText = "removing " + spec + "…";
        try {
            S.pkgListText = String(
                await inv("pi_remove", { spec, local: false }),
            );
            await loadPkgs();
        } catch (e) {
            S.pkgListText = String(e);
        }
    });
}

function askInstallBy(p) {
    askInstall(p);
}
function askRemoveBy(p) {
    askRemove(p);
}

function confirmRemoveMcp(s) {
    const local = s.scope === "project";
    confirmRun("pi mcp remove " + s.name + (local ? " -l" : ""), async () => {
        S.mcpOut = "removing…";
        try {
            S.mcpOut = String(
                await inv("pi_mcp_remove", { name: s.name, local }),
            );
            await loadPkgs();
        } catch (e) {
            S.mcpOut = String(e);
        }
    });
}

function mcpAdd() {
    const name = S.mcpForm.name.trim();
    const target = S.mcpForm.target.trim();
    const extra = splitArgs(S.mcpForm.args);
    const env = S.mcpForm.envRows
        .map((r) => (r.key.trim() ? r.key.trim() + "=" + r.value : null))
        .filter(Boolean);
    const local = S.mcpForm.local;

    if (!name) {
        S.mcpOut = "enter a name";
        return;
    }
    if (!target) {
        S.mcpOut = "enter a URL or a command";
        return;
    }

    const isUrl = /^https?:\/\//i.test(target);
    const url = isUrl ? target : "";
    const argv = isUrl ? [] : splitArgs(target).concat(extra);

    const shown =
        "pi mcp add " +
        name +
        (local ? " -l" : "") +
        env.map((e) => " --env " + e).join("") +
        (url ? " --url " + url : " -- " + argv.join(" "));

    confirmRun(shown, async () => {
        S.mcpOut = "running…";
        try {
            S.mcpOut = String(
                await inv("pi_mcp_add", {
                    name,
                    url,
                    argv,
                    env,
                    headers: [],
                    local,
                }),
            );
            await loadPkgs(name);
        } catch (e) {
            S.mcpOut = String(e);
        }
    });
}

function mcpRemove() {
    const name = S.mcpForm.name.trim();
    const local = S.mcpForm.local;
    if (!name) {
        S.mcpOut = "enter a name";
        return;
    }
    confirmRun("pi mcp remove " + name + (local ? " -l" : ""), async () => {
        try {
            S.mcpOut = String(await inv("pi_mcp_remove", { name, local }));
            await loadPkgs();
        } catch (e) {
            S.mcpOut = String(e);
        }
    });
}

function mcpApplyPreset(id) {
    const p = MCP_PRESETS[id];
    if (!p) return;
    S.mcpForm = { ...S.mcpForm, name: p.name, target: p.target };
}

function mcpAddEnvRow() {
    S.mcpForm = {
        ...S.mcpForm,
        envRows: [...S.mcpForm.envRows, { key: "", value: "" }],
    };
}

function mcpRemoveEnvRow(i) {
    const envRows = S.mcpForm.envRows.filter((_, j) => j !== i);
    S.mcpForm = { ...S.mcpForm, envRows };
}

function mcpSetEnvRow(i, field, value) {
    const envRows = S.mcpForm.envRows.map((r, j) =>
        j === i ? { ...r, [field]: value } : r,
    );
    S.mcpForm = { ...S.mcpForm, envRows };
}

/* ---------- hooks ---------- */

async function loadHooks() {
    try {
        const raw = String(await inv("hooks_tail", { lines: 200 }));
        S.hooksText = raw.trim()
            ? raw
            : "(no records yet) — send a message and come back";
    } catch (e) {
        S.hooksText = String(e);
    }
}

async function refreshHooksStatus() {
    try {
        const st = JSON.parse(String(await inv("hooks_status")));
        S.hooksInstalled = !!st.installed;
        S.hooksStatusText =
            (st.installed ? "logger active · " : "logger inactive · ") + st.log;
    } catch {
        /* ignore */
    }
}

function setHooksEnabled(on) {
    const cmd = on
        ? "write ~/.pi/agent/extensions/pi-pi-pi-hooks.js"
        : "remove ~/.pi/agent/extensions/pi-pi-pi-hooks.js";
    confirmRun(cmd, async () => {
        try {
            const out = await inv(on ? "hooks_install" : "hooks_remove");
            setStatus(String(out));
            await refreshHooksStatus();
            await loadHooks();
        } catch (e) {
            setStatus("error: " + e);
        }
    });
}

function switchPkgPane(name) {
    S.pkgsPane = name;
    if (hooksTimer) {
        clearInterval(hooksTimer);
        hooksTimer = null;
    }
    if (name === "catalog" && !S.catalogObjects) loadCatalog(false);
    if (name === "hooks") {
        loadHooks();
        refreshHooksStatus();
        hooksTimer = setInterval(loadHooks, 2500);
    }
}

function openPkgs() {
    S.settingsOpen = false;
    S.pkgsOpen = true;
    switchPkgPane("installed");
    loadPkgs();
    if (!S.mcpForm.envRows.length) mcpAddEnvRow();
}

function refreshPkgs() {
    loadPkgs();
    if (S.pkgsPane === "catalog") loadCatalog(true);
}

function closePkgs() {
    S.pkgsOpen = false;
}

/* ================= provider auth ================= */

async function openProvPicker() {
    S.provOpen = true;
    S.provFilter = "";
    S.provCurrent = authProvider ? "current: " + authProvider : "";
    S.provProviders = [];
    S.provLoading = true;
    try {
        authProvidersCache = JSON.parse(String(await inv("auth_providers")));
    } catch {
        authProvidersCache = [];
    }
    S.provLoading = false;
}

function closeProvPicker() {
    S.provOpen = false;
}

function startLogin(provider) {
    const p = (provider || authProvider || "").trim();
    if (!p) {
        setStatus("usage: /login <provider>");
        return;
    }
    inv("open_terminal_login", { provider: p })
        .then((out) => setStatus(String(out)))
        .catch((e) => setStatus(String(e)));

    if (authTimer) clearInterval(authTimer);
    let ticks = 0;
    authTimer = setInterval(async () => {
        ticks += 1;
        await checkAuth();
        if (S.authChip.cls === "ok" || ticks > 40) {
            clearInterval(authTimer);
            authTimer = null;
        }
    }, 3000);
}

async function checkAuth() {
    let provider =
        S.sessionState && S.sessionState.model && S.sessionState.model.provider;
    if (!provider) {
        try {
            const m = JSON.parse(lsGet("last-model", "null"));
            provider = m && m.provider;
        } catch {
            /* ignore */
        }
    }
    if (!provider) {
        S.authChip = { hidden: true, cls: "", label: "", title: "" };
        return;
    }
    authProvider = provider;

    try {
        const st = JSON.parse(String(await inv("auth_status", { provider })));
        const ready = !!st && st.status === "ready";
        S.authChip = {
            hidden: false,
            cls: ready ? "ok" : "warn",
            label: ready ? "auth ok" : "login " + provider,
            title: ready
                ? "provider " + provider + " authenticated"
                : "click to open a terminal and run pi auth login " + provider,
        };
    } catch {
        /* no pi in PATH */
    }
}

function authChipClick() {
    if (S.authChip.cls === "ok") checkAuth();
    else openProvPicker();
}

/* ================= pi CLI update ================= */

async function runUpdate(scope) {
    S.updOut = "running… (may take a while)";
    try {
        S.updOut = String(await inv("pi_update", { scope }));
        try {
            S.piVersion = "pi " + (await inv("pi_version"));
        } catch {
            /* ignore */
        }
    } catch (e) {
        S.updOut = String(e);
    }
}

/* ================= attachments / images ================= */

function removeImage(i) {
    S.pendingImages.splice(i, 1);
}

function openImage(src) {
    S.imageViewerSrc = src;
    S.imageViewerOn = true;
}

function closeImage() {
    S.imageViewerOn = false;
}

function addImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const url = String(reader.result || "");
        const comma = url.indexOf(",");
        if (comma < 0) return;
        // dataUrl is only for the thumbnail; the RPC wants raw base64.
        S.pendingImages = [
            ...S.pendingImages,
            {
                dataUrl: url,
                data: url.slice(comma + 1),
                mime: file.type || "image/png",
            },
        ];
    };
    reader.readAsDataURL(file);
}

function addPastedImage(data, mime) {
    S.pendingImages = [
        ...S.pendingImages,
        { dataUrl: "data:" + mime + ";base64," + data, data, mime },
    ];
}

async function attachFile() {
    try {
        const path = String(await inv("pick_file")).trim();
        if (!path) return;
        const sep = S.inputText && !/\s$/.test(S.inputText) ? " " : "";
        S.inputText = S.inputText + sep + "@" + path + " ";
        // S.inputText is the single source of truth (bound in the composer)
        onInputChange();
    } catch (e) {
        if (!String(e).includes("cancelado")) setStatus(String(e));
    }
}

/**
 * Composer keydown. `insertNewline` is a component-supplied callback that puts
 * a real "\n" at the caret (setRangeText keeps the undo stack); state stays DOM-free.
 */
function onComposerKeydown(e, insertNewline) {
    if (S.paletteOpen) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            paletteNav(1);
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            paletteNav(-1);
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            applyPaletteItem(false);
            return;
        }
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            applyPaletteItem(true);
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            hidePalette();
            return;
        }
    }
    if (e.key === "Enter") {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            insertNewline();
            return;
        }
        if (!e.shiftKey) {
            e.preventDefault();
            send();
        }
    }
}

/** Pasted print in the composer: pi accepts ImageContent in the prompt. */
function onComposerPaste(e) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    const files = [];
    for (const it of items) {
        if (it.kind === "file" && String(it.type).startsWith("image/")) {
            const f = it.getAsFile();
            if (f) files.push(f);
        }
    }
    if (!files.length) return; // pure text follows the normal path
    e.preventDefault();
    files.forEach(addImageFile);
}

/**
 * WebKitGTK does not deliver `image/*` in the webview paste event: query the
 * system clipboard on Ctrl+V. Without an image the promise rejects and the
 * native text paste proceeds untouched.
 */
function onComposerPasteImageCheck(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "v") return;
    inv("paste_image")
        .then(([data, mime]) => addPastedImage(data, mime))
        .catch(() => {
            /* clipboard without an image */
        });
}

function onComposerBlur() {
    setTimeout(hidePalette, 150);
}

/** Fork button: ask for the forkable messages (original is preserved). */
async function forkBtnClick() {
    closeModelPop();
    if (!S.current) return note("no session open");
    if (!S.current.connected && !(await ensureRpc())) return;
    sendCommand({ type: "get_fork_messages" });
}

function modelToggleClick() {
    openModelPop();
}

function modelSearchInput(value) {
    renderModelList(value);
}

function thinkSliderInput(value) {
    const lv = S.levelList[Number(value)];
    if (lv) S.thinkName = lv;
}

function thinkSliderChange(value) {
    thinkSelect(Number(value));
}

/* ================= subs pane visibility (Ctrl+B) ================= */

function applySubsVisibility(hidden) {
    S.subsHidden = hidden;
    S.subsHiddenBtn = { on: !hidden };
    lsSet(LS.subsHidden, hidden ? "1" : "0");
}

function toggleSubs() {
    applySubsVisibility(!S.subsHidden);
}

/* ================= resizable side panels ================= */

function clampPanelW(w) {
    return Math.max(PANEL_W.min, Math.min(PANEL_W.max, Math.round(w)));
}

function setPanelW(side, w) {
    if (side === "left") S.sidebarW = clampPanelW(w);
    else S.rightW = clampPanelW(w);
}

function commitPanelW(side) {
    const val = side === "left" ? S.sidebarW : S.rightW;
    lsSet(side === "left" ? LS.sidebarW : LS.rightW, String(val));
}

// "0" means "not set": loadPanelW() treats 0 as the built-in default.
function resetPanelW(side) {
    if (side === "left") S.sidebarW = PANEL_W.left;
    else S.rightW = PANEL_W.right;
    lsSet(side === "left" ? LS.sidebarW : LS.rightW, "0");
}

// Persisted width < min (or 0/missing) falls back to the built-in default.
function loadPanelW(key, fallback) {
    const n = Number(lsGet(key, "0"));
    return n >= PANEL_W.min ? clampPanelW(n) : fallback;
}

/* ================= fatal JS errors ================= */

function showFatal(msg) {
    S.fatalVisible = true;
    S.fatalMsg = String(msg);
}

function fatalDismiss() {
    S.fatalVisible = false;
    S.fatalMsg = "";
}

/* ================= RPC event listeners ================= */

function attachListeners() {
    listen("rpc-line", (ev) => {
        const [sessionId, line] = ev.payload;
        // Diagnostics: only record in the circular buffer; the routing below is unchanged.
        try {
            const rec = JSON.parse(line);
            const fg =
                S.current && sessionId === S.current.key
                    ? "S.current"
                    : "background";
            diagPush(
                rec.type || rec.command || line.slice(0, 120),
                "—",
                rec.command
                    ? (rec.success ? "ok" : "failed") + " · " + fg
                    : String(rec.type || "event") + " · " + fg,
            );
        } catch {
            diagPush(line.slice(0, 160), "—", "raw");
        }
        if (!S.current || sessionId !== S.current.key) {
            // The queue also changes in background tabs: without this the state would
            // never leave "queued" when coming back to the tab.
            if (line.includes('"type":"queue_update"')) {
                let rec = null;
                try {
                    rec = JSON.parse(line);
                } catch {
                    return;
                }
                syncQueue(
                    sessionId,
                    [].concat(rec.steering || [], rec.followUp || []),
                );
                return;
            }
            // Background tab: its transcript comes back via get_messages, but the turn
            // state must survive the switch — otherwise the indicator freezes.
            if (line.includes('"type":"agent_settled"')) {
                maybeNotifyDone(sessionId);
                setTurn(sessionId, false);
                const bst = S.tabs.find((x) => x.key === sessionId);
                if (bst && bst.streamText) {
                    bst.streamText = "";
                    saveTabs();
                }
            } else if (line.includes("thinking_delta")) {
                setTurn(sessionId, true, "thinking…");
            } else if (line.includes("text_delta")) {
                setTurn(sessionId, true, "responding…");
            }
            return;
        }

        if (line.includes('"type":"response"') && !line.includes(PREFIX)) {
            let resp = null;
            try {
                resp = JSON.parse(line);
            } catch {
                /* not a response */
            }
            if (resp && resp.command) {
                if (resp.success) handleResponse(resp);
                else {
                    note(resp.command + ": failed");
                    // Diagnostics pays for itself in an incident: opens on failure.
                    if (S.panelPane !== "diag") switchPanel("diag");
                }
                return;
            }
        }

        const snap = extractSnapshot(line);
        if (snap) {
            renderSubs(snap);
            return;
        }

        if (!line.includes('"type":"')) return;
        let rec;
        try {
            rec = JSON.parse(line);
        } catch {
            return;
        }

        switch (rec.type) {
            case "message_start":
                if (rec.message && rec.message.role === "assistant") {
                    S.stream = {
                        mdRowId: null,
                        thinkRowId: null,
                        text: "",
                        thinkText: "",
                    };
                    // New turn: the stored partial was from the previous one (already on disk).
                    const mt = S.tabs.find(
                        (x) => S.current && x.key === S.current.key,
                    );
                    if (mt) mt.streamText = "";
                }
                break;

            case "message_update": {
                const d = rec.assistantMessageEvent;
                if (!d || !d.delta) break;

                if (d.type === "thinking_delta") {
                    if (!S.stream)
                        S.stream = {
                            mdRowId: null,
                            thinkRowId: null,
                            text: "",
                            thinkText: "",
                        };
                    setTurn(S.current.key, true, "thinking…");
                    if (!S.stream.thinkRowId) {
                        const row = {
                            id: nextId(),
                            kind: "think",
                            text: "",
                            collapsed: !S.uiSettings.expandThink,
                        };
                        S.rows.push(row);
                        S.stream.thinkRowId = row.id;
                    }
                    const r = S.rows.find((x) => x.id === S.stream.thinkRowId);
                    if (r) r.text = (r.text || "") + d.delta;
                    S.stream.thinkText = (S.stream.thinkText || "") + d.delta;
                    scrollBottom();
                    break;
                }

                if (d.type === "text_delta") {
                    if (!S.stream)
                        S.stream = {
                            mdRowId: null,
                            thinkRowId: null,
                            text: "",
                            thinkText: "",
                        };
                    setTurn(S.current.key, true, "responding…");
                    if (!S.stream.mdRowId) {
                        const row = {
                            id: nextId(),
                            kind: "md",
                            raw: "",
                            html: "",
                            forkText: "",
                            forkMsg: "",
                            forkIndex: -1,
                        };
                        S.rows.push(row);
                        S.stream.mdRowId = row.id;
                    }
                    S.stream.text += d.delta;
                    // Per-tab storage: switching S.tabs mid-S.stream does not lose the partial.
                    const tt = S.tabs.find(
                        (x) => S.current && x.key === S.current.key,
                    );
                    if (tt) tt.streamText = S.stream.text.slice(-STREAM_CAP);
                    maybeSaveTabs();
                    scheduleStreamRender();
                    scrollBottom();
                }
                break;
            }

            case "tool_execution_start": {
                cardRow(
                    rec.toolCallId,
                    rec.toolName,
                    rec.args,
                    cards,
                    Date.now(),
                );
                S.stream = null;
                // Previous text chunk is already rendered: do not re-attach on return.
                const tst = S.tabs.find(
                    (x) => S.current && x.key === S.current.key,
                );
                if (tst) tst.streamText = "";
                if (rec.toolName === "subagent")
                    setStatus("subagent dispatched…");
                break;
            }

            case "tool_execution_update": {
                const entry = cards.get(rec.toolCallId);
                if (entry) {
                    const out = outputText(rec.partialResult);
                    if (out) entry.resultText = out;
                }
                break;
            }

            case "tool_execution_end": {
                const entry =
                    cards.get(rec.toolCallId) ||
                    cardRow(
                        rec.toolCallId,
                        rec.toolName,
                        rec.args,
                        cards,
                        Date.now(),
                    );
                entry.state = rec.isError ? "err" : "ok";
                const out = outputText(rec.result);
                if (out) entry.resultText = out;
                if (S.uiSettings.expandTools) entry.expanded = true;
                scrollBottom();
                break;
            }

            case "agent_settled":
                maybeNotifyDone(sessionId);
                setStatus("ready");
                setState("ready");
                setTurn(sessionId, false);
                // Full answer went to disk: the stored partial is stale.
                {
                    const st = S.tabs.find((x) => x.key === sessionId);
                    if (st && st.streamText) {
                        st.streamText = "";
                        saveTabs();
                    }
                }
                if (S.current && S.current.childrenDir)
                    loadChildren(S.current.childrenDir);
                // The turn may have edited files: the diffs pane updates itself.
                if (S.panelPane === "files") loadEdits();
                sendCommand({ type: "get_session_stats" });
                break;

            case "extension_ui_request": {
                if (rec.method === "notify" && rec.message) {
                    extActivity(rec.message, null);
                } else if (rec.method === "setStatus" && rec.statusText) {
                    extActivity(rec.statusText, rec.statusKey || "status");
                }
                break;
            }

            case "queue_update":
                syncQueue(
                    sessionId,
                    [].concat(rec.steering || [], rec.followUp || []),
                );
                break;

            case "auto_retry_start":
                note("retry " + rec.attempt + "/" + rec.maxAttempts);
                break;

            default:
                break;
        }
    });

    listen("rpc-stderr", (ev) => {
        const [sessionId, line] = ev.payload;
        if (!S.current || sessionId !== S.current.key) return;
        // Benign warning: a new session created by the app itself.
        if (
            /No project session found with id .*creating a new session/i.test(
                line,
            )
        )
            return;
        note("[stderr] " + line);
    });

    listen("rpc-exit", (ev) => {
        const key = ev.payload;
        const t = S.tabs.find((x) => x.key === key);
        const wasWorking = !!(t && t.working);
        // Process died: zero the tab state, otherwise the next switch sends commands
        // to a session Rust no longer has ("session '...' not started").
        S.liveOrder = S.liveOrder.filter((k) => k !== key);
        if (t) t.connected = false;
        if (S.current && S.current.key === key) S.current.connected = false;
        setTurn(key, false);
        const dead = S.tabs.find((x) => x.key === key);
        if (dead)
            for (const entry of dead.localRows || [])
                if (entry.state === "queued") markRow(entry, "cancelled");
        pendingPromptRows.clear();
        updateProcCount();
        if (S.current && key === S.current.key) {
            setStatus("process ended");
            setTyping(false, "");
            setState("off");
            S.rows.push({
                id: nextId(),
                kind: "note",
                text: wasWorking
                    ? "the pi process ended mid-turn — incomplete answer (send again to continue)"
                    : "pi process ended",
            });
            scrollBottom(true);
        }
    });

    document.addEventListener("keydown", onGlobalKeydown);
    document.addEventListener("click", onGlobalClick);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("error", onError);
}

function onGlobalKeydown(e) {
    if (e.key === "Escape") {
        if (S.imageViewerOn) {
            S.imageViewerOn = false;
            return;
        }
        if (S.cmdkOpen) {
            closeCmdk();
            return;
        }
        if (S.paletteOpen) {
            hidePalette();
            return;
        }
        if (S.modelPopOpen) {
            closeModelPop();
            return;
        }
        if (S.forkPopOpen) {
            closeForkPop();
            return;
        }
        if (S.ctxPopOpen) {
            S.ctxPopOpen = false;
            return;
        }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleSubs();
        return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        toggleCmdk();
    }
}

// Outside-click closing, ported from the original's per-popover listeners.
// Marker classes live in the Svelte components (.modelpop, .modelpill, ...).
function onGlobalClick(e) {
    const t = e.target;
    if (S.modelPopOpen && !t.closest(".modelpop") && !t.closest(".modelpill"))
        closeModelPop();
    if (S.forkPopOpen && !t.closest(".forkpop")) closeForkPop();
    if (S.ctxPopOpen && !t.closest(".ctxpop") && !t.closest(".ctxchip"))
        S.ctxPopOpen = false;
}

function onPageHide() {
    try {
        stashDraft();
    } catch {
        /* ignore */
    }
    try {
        saveTabs();
    } catch {
        /* ignore */
    }
}

function onError(e) {
    showFatal(e.message || String(e.error || e));
}

/* ================= init ================= */

function init() {
    if (initDone) return;
    initDone = true;
    attachListeners();

    applySubsVisibility(lsGet(LS.subsHidden, "0") === "1");
    S.sidebarW = loadPanelW(LS.sidebarW, PANEL_W.left);
    S.rightW = loadPanelW(LS.rightW, PANEL_W.right);
    switchPanel(lsGet(LS.pane, "subs"));
    setEmptyState(true, "nosession");

    loadSettings();
    loadTreeState();
    loadCachedModels();
    loadLastModel();
    loadCachedLevels();
    loadCachedCommands();
    warmModels();

    (async () => {
        try {
            S.piVersion = "pi " + (await inv("pi_version"));
        } catch {
            /* no version */
        }
        try {
            S.systemFonts = (await inv("list_system_fonts")) || [];
        } catch {
            /* browser dev */
        }
        try {
            await inv("kill_orphans");
        } catch {
            /* nothing to clean */
        }
        checkAuth();
        try {
            S.homeDir = await inv("home_dir");
        } catch {
            S.homeDir = null;
        }
        restoreTabs();
        await loadSessions();
        // Tabs from the previous run come back as read-only; focus reconnects via ensureRpc.
        if (!S.current && S.activeTab) {
            try {
                await switchTab(S.activeTab.key);
            } catch {
                /* orphan tab: stays in the bar to be closed */
            }
        }
        try {
            const flags = String(await inv("debug_flags"));
            debugEnabled = flags.includes("debug");
            if (flags.includes("autonew")) newsession();
        } catch {
            /* no flags */
        }
    })();
}

/* attach functions to S so components can use S.<fn>() */
S.updateProcCount = updateProcCount;
S.warmModels = warmModels;
S.applyModel = applyModel;
S.runModelArg = runModelArg;
S.thinkSelect = thinkSelect;
S.saveLimit = saveLimit;
S.refreshCompactLimit = refreshCompactLimit;
S.desfazerFila = desfazerFila;
S.loadSessions = loadSessions;
S.runSearch = runSearch;
S.start = start;
S.openSession = openSession;
S.addProject = addProject;
S.ensureRpc = ensureRpc;
S.reloadSession = reloadSession;
S.switchTab = switchTab;
S.closeTab = closeTab;
S.loadEarlier = loadEarlier;
S.loadHistoryFromDisk = loadHistoryFromDisk;
S.send = send;
S.loadChildren = loadChildren;
S.loadEdits = loadEdits;
S.revertHunk = revertHunk;
S.openFileActions = openFileActions;
S.loadMissions = loadMissions;
S.openChild = openChild;
S.loadPkgs = loadPkgs;
S.loadCatalog = loadCatalog;
S.confirmOk = confirmOk;
S.loadHooks = loadHooks;
S.refreshHooksStatus = refreshHooksStatus;
S.openProvPicker = openProvPicker;
S.checkAuth = checkAuth;
S.runUpdate = runUpdate;
S.attachFile = attachFile;
S.forkBtnClick = forkBtnClick;
S.childStateMeta = childStateMeta;
S.setLogEl = setLogEl;
S.isInstalled = isInstalled;
S.projectName = projectName;
S.settingChange = settingChange;
S.openExternal = openExternal;
S.setStatus = setStatus;
S.setState = setState;
S.scrollBottom = scrollBottom;
S.updateScrollBtn = updateScrollBtn;
S.onLogScroll = onLogScroll;
S.scrollToBottom = scrollToBottom;
S.setEmptyState = setEmptyState;
S.setTurn = setTurn;
S.note = note;
S.buildRows = buildRows;
S.syncQueue = syncQueue;
S.restoreLocalRows = restoreLocalRows;
S.openForkPop = openForkPop;
S.closeForkPop = closeForkPop;
S.forkRowClick = forkRowClick;
S.forkPick = forkPick;
S.updateModelButton = updateModelButton;
S.loadLastModel = loadLastModel;
S.loadCachedModels = loadCachedModels;
S.fillModels = fillModels;
S.renderModelList = renderModelList;
S.findModels = findModels;
S.openModelPop = openModelPop;
S.closeModelPop = closeModelPop;
S.fillLevels = fillLevels;
S.loadCachedLevels = loadCachedLevels;
S.cycleThinkingLevel = cycleThinkingLevel;
S.updateStats = updateStats;
S.renderCtxPop = renderCtxPop;
S.compactNow = compactNow;
S.toggleAutocompact = toggleAutocompact;
S.ctxBtnClick = ctxBtnClick;
S.pushRecent = pushRecent;
S.loadCachedCommands = loadCachedCommands;
S.checkCommands = checkCommands;
S.hidePalette = hidePalette;
S.onInputChange = onInputChange;
S.applyPaletteItem = applyPaletteItem;
S.paletteNav = paletteNav;
S.palettePick = palettePick;
S.openCmdk = openCmdk;
S.closeCmdk = closeCmdk;
S.toggleCmdk = toggleCmdk;
S.renderCmdk = renderCmdk;
S.cmdkNav = cmdkNav;
S.runCmdkItem = runCmdkItem;
S.parseAppCommand = parseAppCommand;
S.toggleGroup = toggleGroup;
S.hideToggle = hideToggle;
S.loadMoreProjects = loadMoreProjects;
S.sessionClick = sessionClick;
S.searchResultClick = searchResultClick;
S.searchActive = searchActive;
S.scheduleSearch = scheduleSearch;
S.clearSearch = clearSearch;
S.newSessionIn = newSessionIn;
S.newsession = newsession;
S.askDeleteSession = askDeleteSession;
S.stopLive = stopLive;
S.tabState = tabState;
S.maybeSaveTabs = maybeSaveTabs;
S.restoreTabs = restoreTabs;
S.applyTurnUi = applyTurnUi;
S.reattachStream = reattachStream;
S.renderDiag = renderDiag;
S.diagClear = diagClear;
S.sendCommand = sendCommand;
S.handleResponse = handleResponse;
S.noSubsMessage = noSubsMessage;
S.paintSubs = paintSubs;
S.renderSubs = renderSubs;
S.openDiffs = openDiffs;
S.openMission = openMission;
S.closeDetail = closeDetail;
S.switchPanel = switchPanel;
S.renderCatalog = renderCatalog;
S.closeConfirm = closeConfirm;
S.askInstallBy = askInstallBy;
S.askRemoveBy = askRemoveBy;
S.confirmRemoveMcp = confirmRemoveMcp;
S.mcpAdd = mcpAdd;
S.mcpRemove = mcpRemove;
S.mcpApplyPreset = mcpApplyPreset;
S.mcpAddEnvRow = mcpAddEnvRow;
S.mcpRemoveEnvRow = mcpRemoveEnvRow;
S.mcpSetEnvRow = mcpSetEnvRow;
S.setHooksEnabled = setHooksEnabled;
S.switchPkgPane = switchPkgPane;
S.openPkgs = openPkgs;
S.refreshPkgs = refreshPkgs;
S.closePkgs = closePkgs;
S.closeProvPicker = closeProvPicker;
S.startLogin = startLogin;
S.authChipClick = authChipClick;
S.removeImage = removeImage;
S.openImage = openImage;
S.closeImage = closeImage;
S.addImageFile = addImageFile;
S.addPastedImage = addPastedImage;
S.onComposerKeydown = onComposerKeydown;
S.onComposerPaste = onComposerPaste;
S.onComposerPasteImageCheck = onComposerPasteImageCheck;
S.onComposerBlur = onComposerBlur;
S.modelToggleClick = modelToggleClick;
S.modelSearchInput = modelSearchInput;
S.thinkSliderInput = thinkSliderInput;
S.thinkSliderChange = thinkSliderChange;
S.applySubsVisibility = applySubsVisibility;
S.toggleSubs = toggleSubs;
S.setPanelW = setPanelW;
S.commitPanelW = commitPanelW;
S.resetPanelW = resetPanelW;
S.showFatal = showFatal;
S.fatalDismiss = fatalDismiss;
S.attachListeners = attachListeners;
S.init = init;
S.APP_COMMANDS = APP_COMMANDS;
