<script>
    import { S } from "../lib/state.svelte.js";

    const filtered = () => {
        const q = String(S.provFilter || "").toLowerCase();
        return S.provProviders.filter(
            (p) => p && p.name && p.name.toLowerCase().includes(q),
        );
    };
</script>

{#if S.provOpen}
    <div class="overlay">
        <div class="detail-head">
            <button onclick={S.closeProvPicker}>← back</button>
            <span class="detail-title">Login — choose a provider</span>
            <span class="spacer"></span>
            <span class="hint">{S.provCurrent}</span>
        </div>
        <div class="overlay-body">
            <input
                class="model-search cat-search"
                placeholder="filter providers…"
                value={S.provFilter}
                oninput={(e) => (S.provFilter = e.target.value)}
            />
            <div class="cat-list">
                {#if S.provLoading}
                    <div class="model-empty">loading…</div>
                {:else}
                    {@const rows = filtered()}
                    {#if !rows.length}
                        <div class="model-empty">no provider found</div>
                    {:else}
                        {#each rows as p (p.name)}
                            <div class="cat-row prov-row">
                                <span class="cat-name">{p.name}</span>
                                {#if p.status === "ready"}
                                    <span class="cat-installed">ready</span>
                                {:else if p.configured}
                                    <span class="prov-nocred"
                                        >no credential</span
                                    >
                                {/if}
                                <span class="spacer"></span>
                                <button
                                    class="ghost"
                                    onclick={() => {
                                        S.closeProvPicker();
                                        S.startLogin(p.name);
                                    }}>login</button
                                >
                            </div>
                        {/each}
                    {/if}
                {/if}
            </div>
            <p class="hint">
                Clicking <b>login</b> opens a terminal with
                <code>pi auth login &lt;provider&gt;</code>; the app follows up
                with <code>pi auth check</code> until it is ready.
            </p>
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
    .overlay-body {
        flex: 1;
        overflow: auto;
        padding: 16px 24px;
    }
    .model-search {
        background: #0c0f16;
        border: 1px solid var(--line);
        color: var(--fg);
        padding: 8px 10px;
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        outline: none;
        border-radius: 5px;
        box-sizing: border-box;
    }
    .cat-search {
        max-width: 520px;
        margin-bottom: 10px;
    }
    .model-empty {
        color: var(--mute);
        font-size: calc(11px * var(--s-ui));
        padding: 6px 2px;
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
        .spacer {
            flex: 1;
        }
    }
    .cat-name {
        color: #c4cbdb;
        flex: none;
    }
    .cat-installed {
        flex: none;
        color: var(--ok);
        font-size: calc(10.5px * var(--s-ui));
        font-family: var(--font-ui);
    }
    .prov-row .cat-name {
        min-width: 180px;
    }
    .prov-nocred {
        font-family: var(--font-ui);
        font-size: calc(9.5px * var(--s-ui));
        padding: 1px 6px;
        border-radius: 3px;
        background: #302a16;
        color: var(--warn);
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
        b {
            color: var(--dim);
        }
    }
</style>
