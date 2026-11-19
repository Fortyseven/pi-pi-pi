<script>
    import { prettyId } from "../lib/util.js";
    import { S } from "../lib/state.svelte.js";

    // Search filters appear on focus/typing; with no criteria the tree comes back.
    let searchFocused = $state(false);
</script>

<aside class="sidebar">
    <div class="side-head">
        <span>Sessions</span>
        <span class="side-actions">
            <button
                class="ghost small"
                title="Open a folder as a project"
                onclick={S.addProject}>+ Folder</button
            >
            <button
                class="ghost small"
                title="New session without a project (starts in ~)"
                onclick={S.newsession}>+ New</button
            >
        </span>
    </div>

    <div class="side-search">
        <input
            class="side-input"
            placeholder="search sessions…"
            autocomplete="off"
            bind:value={S.searchFilter}
            oninput={S.scheduleSearch}
            onfocus={() => {
                searchFocused = true;
                S.scheduleSearch();
            }}
            onblur={() => {
                searchFocused = false;
                S.scheduleSearch();
            }}
        />
        <div
            class="side-filters"
            class:hidden={!(S.searchActive() || searchFocused)}
        >
            <input
                class="side-input"
                placeholder="tool (ex: edit)"
                autocomplete="off"
                bind:value={S.toolFilter}
                oninput={S.scheduleSearch}
            />
            <label class="erronly"
                ><input
                    type="checkbox"
                    bind:checked={S.errorsOnly}
                    onchange={() => S.runSearch(false)}
                /> errors</label
            >
            <button
                class="tiny"
                title="clear search"
                onclick={S.clearSearch}>×</button
            >
        </div>
        <div
            class="search-meta"
            class:hidden={!S.searchMeta.on}
        >
            {S.searchMeta.text}
        </div>
        {#if S.searchMeta.on}
            <div class="sess-list search-results">
                {#each S.searchResults as r (r.id + r.file)}
                    <div
                        class="sess"
                        class:active={S.current && S.current.key === r.id}
                        title={(r.title || r.id) + "\n" + r.file}
                        onclick={() => S.searchResultClick(r)}
                    >
                        <div class="sess-title">{r.title || "untitled"}</div>
                        {#if r.snippet}<div class="snippet">
                                {r.snippet}
                            </div>{/if}
                        <div class="sess-meta">
                            <span
                                >{prettyId(r.id)} · {r.matches} snippet(s)</span
                            >
                            <span class="badges">
                                {#if r.tools && r.tools.length}<span
                                        class="badge"
                                        >{r.tools.slice(0, 3).join(",")}</span
                                    >{/if}
                                {#if r.hasError}<span class="badge">error</span
                                    >{/if}
                            </span>
                        </div>
                    </div>
                {/each}
                {#if S.searchMore.on}
                    <button
                        class="sess-more"
                        onclick={() => S.runSearch(true)}
                        >show more ({S.searchMore.count})</button
                    >
                {/if}
            </div>
        {/if}
    </div>

    <div class="sess-list tree">
        {#if S.sidebarError}
            <div class="empty err">{S.sidebarError}</div>
        {:else if !S.sidebarGroups.length}
            <div class="empty">{S.sidebarEmpty || "loading…"}</div>
        {:else}
            {#each S.sidebarGroups as g (g.path)}
                <div
                    class="group"
                    class:collapsed={g.collapsed}
                >
                    <div
                        class="group-head"
                        onclick={() => S.toggleGroup(g.path)}
                    >
                        <span class="caret">{g.collapsed ? "▸" : "▾"}</span>
                        <span
                            class="proj-name"
                            title={g.path}>{g.name}</span
                        >
                        {#if g.count > 0}<span class="proj-count"
                                >{g.count}</span
                            >{/if}
                        <button
                            class="tiny plus"
                            title={"New session in this project (" +
                                g.path +
                                ")"}
                            onclick={(e) => {
                                e.stopPropagation();
                                S.newSessionIn(g.path);
                            }}>+</button
                        >
                        <button
                            class="tiny"
                            title={g.hidden
                                ? "Show project"
                                : "Hide project (deletes nothing)"}
                            onclick={(e) => {
                                e.stopPropagation();
                                S.hideToggle(g.path);
                            }}
                        >
                            {g.hidden ? "↺" : "⊘"}
                        </button>
                    </div>
                    <div class="sess-list">
                        {#each g.sessions as s (s.id)}
                            <div
                                class="sess"
                                class:active={S.current &&
                                    S.current.key === s.id}
                                title={(s.title || s.id) + "\n" + s.id}
                                onclick={() => S.sessionClick(g, s)}
                            >
                                <div class="sess-title">
                                    {s.title || "untitled"}
                                </div>
                                <div class="sess-meta">
                                    <span>{prettyId(s.id)}</span>
                                    <span class="badges">
                                        {#if s.children > 0}<span
                                                class="badge"
                                                title="subagent runs in this session"
                                                >{s.children}</span
                                            >{/if}
                                        <button
                                            class="tiny"
                                            title="Move this session to the trash"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                S.askDeleteSession(s);
                                            }}>×</button
                                        >
                                    </span>
                                </div>
                            </div>
                        {/each}
                        {#if g.moreCount > 0}
                            <button
                                class="sess-more"
                                onclick={() => S.loadMoreProjects(g.path)}
                                >load more ({g.moreCount})</button
                            >
                        {/if}
                    </div>
                </div>
            {/each}
        {/if}
    </div>

    <div class="side-foot">
        <span>{S.piVersion || "pi …"}</span>
        {#if !S.authChip.hidden}
            <span
                class="auth-chip"
                class:ok={S.authChip.cls === "ok"}
                class:warn={S.authChip.cls === "warn"}
                title={S.authChip.title}
                onclick={S.authChipClick}>{S.authChip.label}</span
            >
        {/if}
    </div>
</aside>

<style lang="scss">
    .sidebar {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--line);
        background: var(--panel);
        min-height: 0;
    }
    .side-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex: none;
        padding: 8px 14px;
        font-family: var(--font-ui);
        font-size: calc(10.5px * var(--s-ui));
        letter-spacing: 0.04em;
        color: var(--mute);
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        .side-actions {
            display: flex;
            gap: 4px;
        }
    }
    .side-search {
        flex: none;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        padding: 6px 8px;
    }
    .side-input {
        width: 100%;
        box-sizing: border-box;
        background: #0c0f16;
        border: 1px solid var(--line);
        border-radius: 4px;
        color: var(--dim);
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        padding: 4px 8px;
        outline: none;
        &::placeholder {
            color: #4d5568;
        }
        &:focus {
            border-color: var(--accent);
        }
    }
    .side-filters {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-top: 6px;
        &.hidden {
            display: none;
        }
        .side-input {
            flex: 1;
            min-width: 0;
        }
        .erronly {
            display: flex;
            gap: 4px;
            align-items: center;
            font-family: var(--font-ui);
            font-size: calc(10.5px * var(--s-ui));
            color: var(--mute);
            white-space: nowrap;
        }
    }
    .search-meta {
        font-family: var(--font-ui);
        font-size: calc(10px * var(--s-ui));
        color: var(--mute);
        padding: 6px 2px 0;
        &.hidden {
            display: none;
        }
    }
    .group-head {
        display: flex;
        align-items: baseline;
        gap: 6px;
        padding: 6px 10px 6px 12px;
        cursor: pointer;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        color: #9aa3b8;
        &:hover {
            background: #1a1e2b;
        }
        .caret {
            color: var(--mute);
            font-size: calc(9px * var(--s-ui));
            width: 9px;
            flex: none;
        }
        .proj-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: white;
            font-weight: 800;
        }
        .proj-count {
            color: var(--muted);
            font-size: calc(9.5px * var(--s-ui));
            flex: none;
        }
    }
    .group.collapsed .sess-list {
        display: none;
    }
    .sess-list {
        border-left: 1px solid var(--line-soft);
        margin-left: 16px;
        &.tree {
            border-left: none;
            margin-left: 0;
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
        }
        &.search-results {
            margin-left: 0;
            border-left: none;
            max-height: 40vh;
            overflow-y: auto;
        }
    }
    .sess {
        padding: 5px 8px;
        cursor: pointer;
        border-bottom: 1px solid var(--line-soft);
        border-left: 2px solid transparent;
        &:hover {
            background: rgba(255, 255, 255, 0.08);
        }
        &.active {
            background: rgba(255, 255, 255, 0.15);
            color: var(--fg);
            border-left-color: var(--accent);
        }
        .sess-title {
            font-size: calc(11.5px * var(--s-ui));
            color: var(--muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        &.active .sess-title {
            color: #fff;
        }
        .sess-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
            margin-top: 2px;
            font-family: var(--font-ui);
            font-size: calc(10px * var(--s-ui));
            color: var(--mute);
            > span:first-child {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .badges {
                display: flex;
                gap: 4px;
                align-items: center;
                flex: none;
            }
        }
        .snippet {
            font-size: calc(10.5px * var(--s-ui));
            color: var(--mute);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 2px;
        }
    }
    .sess-more {
        display: block;
        width: calc(100% - 16px);
        margin: 6px 8px;
        background: transparent;
        border: 1px solid var(--line);
        color: var(--dim);
        padding: 3px 0;
        font-size: calc(10.5px * var(--s-ui));
        border-radius: 4px;
        &:hover {
            border-color: var(--accent);
            color: var(--accent);
            background: rgba(255, 255, 255, 0.08);
        }
    }
    .side-foot {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 10px;
        border-top: 1px solid var(--line);
        font-family: var(--font-ui);
        font-size: calc(10.5px * var(--s-ui));
        color: var(--accent-dark);

        .auth-chip {
            font-size: calc(10px * var(--s-ui));
            padding: 2px 7px;
            border-radius: 999px;
            border: 1px solid var(--line);
            cursor: pointer;
            &.ok {
                color: var(--ok);
                border-color: rgba(126, 231, 135, 0.4);
            }
            &.warn {
                color: var(--warn);
                border-color: rgba(227, 179, 65, 0.4);
            }
        }
    }
</style>
