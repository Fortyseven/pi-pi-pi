<script>
    import { S } from "../lib/state.svelte.js";

    const presets = [
        [
            "filesystem",
            "filesystem — npx @modelcontextprotocol/server-filesystem",
        ],
        ["memory", "memory — npx @modelcontextprotocol/server-memory"],
        [
            "sequential-thinking",
            "sequential-thinking — npx …server-sequential-thinking",
        ],
    ];
</script>

{#if S.pkgsOpen}
    <div class="overlay">
        <div class="detail-head">
            <button onclick={S.closePkgs}>← back</button>
            <span class="detail-title">Packages</span>
            <span class="spacer"></span>
            <button
                class="ghost"
                onclick={S.refreshPkgs}>Refresh</button
            >
        </div>
        <div class="pkg-tabs">
            <button
                class="pkg-tab"
                class:active={S.pkgsPane === "installed"}
                onclick={() => S.switchPkgPane("installed")}>Installed</button
            >
            <button
                class="pkg-tab"
                class:active={S.pkgsPane === "catalog"}
                onclick={() => S.switchPkgPane("catalog")}>Catalog</button
            >
            <button
                class="pkg-tab"
                class:active={S.pkgsPane === "mcp"}
                onclick={() => S.switchPkgPane("mcp")}>MCP</button
            >
            <button
                class="pkg-tab"
                class:active={S.pkgsPane === "hooks"}
                onclick={() => S.switchPkgPane("hooks")}>Hooks</button
            >
        </div>
        <div class="overlay-body">
            {#if S.pkgsPane === "installed"}
                <div class="pane">
                    <pre class="pkgs-pre">{S.pkgListText}</pre>
                </div>
            {/if}

            {#if S.pkgsPane === "catalog"}
                <div class="pane">
                    <input
                        class="model-search cat-search"
                        placeholder="filter the catalog (npm keyword: pi-package)…"
                        value={S.catFilter}
                        oninput={(e) => {
                            S.catFilter = e.target.value;
                            S.renderCatalog();
                        }}
                    />
                    <div class="cat-list">
                        {#if S.catError}
                            <div class="model-empty err">{S.catError}</div>
                        {:else if !S.catalogObjects}
                            <div class="model-empty">loading…</div>
                        {:else if !S.catalogRows.length}
                            <div class="model-empty">nothing found</div>
                        {:else}
                            {#each S.catalogRows as p (p.name)}
                                <div class="cat-row">
                                    <span class="cat-name">{p.name}</span>
                                    <span class="cat-meta">v{p.version}</span>
                                    <span class="cat-desc">{p.description}</span
                                    >
                                    <span class="cat-meta"
                                        >{p.downloads
                                            ? p.downloads + "/mo"
                                            : ""}</span
                                    >
                                    {#if S.isInstalled(p.name)}
                                        <span class="cat-installed"
                                            >installed</span
                                        >
                                        <button
                                            class="ghost"
                                            onclick={() => S.askRemoveBy(p)}
                                            >Remove</button
                                        >
                                    {:else}
                                        <button
                                            class="ghost"
                                            onclick={() => S.askInstallBy(p)}
                                            >Install…</button
                                        >
                                    {/if}
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}

            {#if S.pkgsPane === "mcp"}
                <div class="pane">
                    <div class="mcp-list">
                        {#if S.mcpError}
                            <div class="model-empty err">{S.mcpError}</div>
                        {:else if !S.mcpServers.length}
                            <div class="model-empty">
                                no MCP server configured
                            </div>
                        {:else}
                            {#each S.mcpServers as s (s.name)}
                                {@const state = String(s.state || "?")}
                                <div
                                    class="mcp-row"
                                    class:new={S.mcpHighlight === s.name}
                                >
                                    <span class="mcp-name"
                                        >{String(s.name)}</span
                                    >
                                    <span
                                        class="mcp-chip"
                                        class:ok={state === "connected"}
                                        class:err={/error|fail/i.test(state)}
                                        >{state}</span
                                    >
                                    {#if s.enabled === false}<span
                                            class="mcp-chip off">disabled</span
                                        >{/if}
                                    {#if s.scope}<span class="mcp-chip"
                                            >{String(s.scope)}</span
                                        >{/if}
                                    <span class="mcp-transport"
                                        >{String(s.transport || "")}</span
                                    >
                                    {#if Array.isArray(s.tools)}<span
                                            class="mcp-chip"
                                            >{s.tools.length} tools</span
                                        >{/if}
                                    <span class="spacer"></span>
                                    <button
                                        class="ghost"
                                        onclick={() => S.confirmRemoveMcp(s)}
                                        >Remove</button
                                    >
                                </div>
                            {/each}
                        {/if}
                    </div>
                    <details class="mcp-raw">
                        <summary>raw JSON</summary>
                        <pre class="pkgs-pre">{S.mcpJson}</pre>
                    </details>
                    <h4>Add server</h4>
                    <div class="mcp-form">
                        <select
                            class="mfield"
                            value={S.mcpForm.preset}
                            onchange={(e) => {
                                S.mcpForm.preset = e.target.value;
                                S.mcpApplyPreset(e.target.value);
                            }}
                        >
                            <option value="">preset: custom…</option>
                            {#each presets as [id, label] (id)}
                                <option
                                    value={id}
                                    selected={S.mcpForm.preset === id}
                                    >{label}</option
                                >
                            {/each}
                        </select>
                        <input
                            class="mfield"
                            placeholder="server name"
                            value={S.mcpForm.name}
                            oninput={(e) => (S.mcpForm.name = e.target.value)}
                        />
                        <input
                            class="mfield"
                            placeholder="https://… (HTTP) or command: npx -y package"
                            value={S.mcpForm.target}
                            oninput={(e) => (S.mcpForm.target = e.target.value)}
                        />
                        <input
                            class="mfield"
                            placeholder="extra arguments (e.g. /home/user)"
                            value={S.mcpForm.args}
                            oninput={(e) => (S.mcpForm.args = e.target.value)}
                        />
                        <div class="env-rows">
                            {#each S.mcpForm.envRows as r, i (i)}
                                <div class="env-row">
                                    <input
                                        class="mfield env-k"
                                        placeholder="KEY"
                                        value={r.key}
                                        oninput={(e) =>
                                            S.mcpSetEnvRow(
                                                i,
                                                "key",
                                                e.target.value,
                                            )}
                                    />
                                    <input
                                        class="mfield env-v"
                                        placeholder="value or env var name"
                                        value={r.value}
                                        oninput={(e) =>
                                            S.mcpSetEnvRow(
                                                i,
                                                "value",
                                                e.target.value,
                                            )}
                                    />
                                    <button
                                        class="ghost"
                                        title="remove"
                                        onclick={() => S.mcpRemoveEnvRow(i)}
                                        >×</button
                                    >
                                </div>
                            {/each}
                            <button
                                class="ghost"
                                onclick={S.mcpAddEnvRow}
                                >+ environment variable</button
                            >
                        </div>
                        <label class="mfield checkbox">
                            <input
                                type="checkbox"
                                checked={S.mcpForm.local}
                                onchange={(e) =>
                                    (S.mcpForm.local = e.target.checked)}
                            />
                            project (.pi/mcp.json)
                        </label>
                        <div class="settings-actions">
                            <button
                                class="primary"
                                onclick={S.mcpAdd}>Add and test</button
                            >
                            <button
                                class="ghost"
                                onclick={S.mcpRemove}>Remove by name</button
                            >
                        </div>
                        <p class="hint">
                            The app stores no secrets. For a token, pass the
                            name of the shell environment variable instead of
                            the value.
                        </p>
                        <pre class="upd-out">{S.mcpOut}</pre>
                    </div>
                </div>
            {/if}

            {#if S.pkgsPane === "hooks"}
                <div class="pane">
                    <div
                        class="settings-actions"
                        style="margin-bottom: 8px;"
                    >
                        <button
                            class="ghost"
                            onclick={() => {
                                S.loadHooks();
                                S.refreshHooksStatus();
                            }}>Refresh</button
                        >
                        <span class="hint">{S.hooksStatusText}</span>
                    </div>
                    <pre class="pkgs-pre">{S.hooksText || "—"}</pre>
                    <p class="hint">
                        pi-pi-pi cannot see hook invocations through the RPC.
                        This pane shows the log written by the
                        <code>pi-pi-pi-hooks</code> extension (one line per hook
                        fired). Enable it in ⚙ → Instrument hooks; open
                        sessions need <code>/reload</code>.
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style lang="scss">
    .overlay {
        position: fixed;
        inset: 34px 0 0 0;
        background: var(--ui-bg);
        z-index: 35;
        display: flex;
        flex-direction: column;
    }
    .detail-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 12px;
        border-bottom: 1px solid var(--line);
        flex: none;
        > button {
            background: transparent;
            border: 1px solid var(--line);
            color: var(--dim);
            border-radius: 4px;
            font-size: calc(11px * var(--s-ui));
            padding: 3px 8px;
            cursor: pointer;
            &:hover {
                color: #fff;
                border-color: var(--accent);
                background: #222a3d;
            }
        }
        .spacer {
            flex: 1;
        }
    }
    .detail-title {
        font-family: var(--font-ui);
        font-size: calc(11.5px * var(--s-ui));
        color: var(--dim);
    }

    .pkg-tabs {
        display: flex;
        gap: 2px;
        padding: 0 24px;
        border-bottom: 1px solid var(--line);
        flex: none;
        .pkg-tab {
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--mute);
            font-family: var(--font-ui);
            font-size: calc(11px * var(--s-ui));
            padding: 8px 10px;
            cursor: pointer;
            &:hover {
                color: var(--dim);
            }
            &.active {
                color: var(--fg);
                border-bottom-color: var(--accent);
            }
        }
    }

    .overlay-body {
        flex: 1;
        overflow: auto;
        padding: 16px 24px;
        h4 {
            margin: 18px 0 8px;
            font-size: calc(10px * var(--s-ui));
            color: var(--mute);
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            &:first-child {
                margin-top: 0;
            }
        }
    }

    .pkgs-pre {
        margin: 0;
        padding: 10px 12px;
        background: #0c0f16;
        border: 1px solid var(--line);
        border-radius: 6px;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        color: #c4cbdb;
    }

    .model-search {
        background: #0c0f16;
        border: none;
        color: var(--fg);
        padding: 8px 10px;
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        outline: none;
        border-radius: 5px;
    }
    .cat-search {
        max-width: 520px;
        margin-bottom: 10px;
        border: 1px solid var(--line) !important;
    }
    .model-empty {
        color: var(--mute);
        font-size: calc(11px * var(--s-ui));
        padding: 6px 2px;
        &.err {
            color: var(--err);
        }
    }
    .cat-list {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }
    .cat-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 7px 10px;
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        &:hover {
            background: #151a24;
        }
        button {
            flex: none;
        }
    }
    .cat-name {
        color: #c4cbdb;
        flex: none;
    }
    .cat-desc {
        color: var(--mute);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .cat-meta {
        color: #4d5568;
        flex: none;
        font-size: calc(10.5px * var(--s-ui));
    }
    .cat-installed {
        flex: none;
        color: var(--ok);
        font-size: calc(10.5px * var(--s-ui));
        font-family: var(--font-ui);
    }

    .mcp-list {
        display: flex;
        flex-direction: column;
        margin-bottom: 12px;
    }
    .mcp-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 7px 4px;
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        &.new {
            background: #141d16;
        }
        .spacer {
            flex: 1;
        }
    }
    .mcp-name {
        color: #c4cbdb;
        flex: none;
    }
    .mcp-transport {
        color: var(--mute);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .mcp-chip {
        flex: none;
        font-size: calc(9.5px * var(--s-ui));
        padding: 1px 5px;
        border-radius: 3px;
        background: #1e2130;
        color: var(--dim);
        &.ok {
            background: #16301c;
            color: var(--ok);
        }
        &.err {
            background: #301619;
            color: var(--err);
        }
        &.off {
            background: #241d10;
            color: var(--warn);
        }
    }
    .mcp-raw {
        margin: 0 0 8px;
        summary {
            cursor: pointer;
            color: var(--mute);
            font-family: var(--font-ui);
            font-size: calc(11px * var(--s-ui));
        }
        pre {
            margin-top: 6px;
            max-height: 22vh;
            overflow: auto;
        }
    }

    .env-rows {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .env-row {
        display: flex;
        gap: 6px;
        align-items: center;
        .env-k {
            flex: 0 0 150px;
        }
        .env-v {
            flex: 1;
        }
    }

    .hint {
        margin: 2px 0 0;
        color: var(--mute);
        font-size: calc(10.5px * var(--s-ui));
        line-height: 1.5;
        code {
            font-family: var(--font-code);
            color: var(--dim);
        }
    }
    .mcp-form {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 640px;
    }
    .mfield {
        background: #0c0f16;
        border: 1px solid var(--line);
        border-radius: 5px;
        color: var(--fg);
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        padding: 7px 9px;
        width: 100%;
        box-sizing: border-box;
        &:focus {
            border-color: var(--accent);
            outline: none;
        }
        &.checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            background: none;
            border: none;
            width: auto;
            input {
                width: auto;
            }
        }
    }
    .settings-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 6px;
    }
    .upd-out {
        margin: 0;
        max-width: 640px;
        max-height: 170px;
        overflow: auto;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        white-space: pre-wrap;
        color: var(--dim);
        &:empty {
            display: none;
        }
    }
</style>
