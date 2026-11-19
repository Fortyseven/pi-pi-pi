<script>
    import { onMount } from "svelte";
    import Row from "./rows/Row.svelte";
    import SessionTabs from "./SessionTabs.svelte";
    import { contextLabel } from "../lib/util.js";
    import { S } from "../lib/state.svelte.js";

    let logEl = $state(null);
    let inputEl = $state(null);

    onMount(() => {
        S.setLogEl(logEl);
        return () => S.setLogEl(null);
    });

    // Ctrl/Cmd+Enter: insert a real newline at the caret. setRangeText keeps the
    // browser undo stack (assigning .value would destroy it).
    function insertNewline() {
        const el = inputEl;
        if (!el) return;
        el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function onInputKeydown(e) {
        S.onComposerKeydown(e, insertNewline);
    }

    const currentModelId = () =>
        S.sessionState && S.sessionState.model && S.sessionState.model.id;
</script>

<main>
    <SessionTabs />
    {#if S.loadMore.on}
        <div class="load-more">
            <button
                class="ghost"
                disabled={S.loadMore.busy}
                onclick={S.loadEarlier}
            >
                {S.loadMore.busy
                    ? "loading…"
                    : S.loadMore.text || "load earlier messages"}
            </button>
        </div>
    {/if}

    <div
        class="log"
        bind:this={logEl}
        onscroll={S.onLogScroll}
    >
        {#each S.rows as row (row.id)}
            <Row {row} />
        {/each}
    </div>

    {#if S.emptyState.on}
        <div class="empty-state">
            <img
                src="icon.png"
                alt=""
                width="50%"
                height="auto"
            />
            <div class="es-title">pi-pi-pi</div>
            <div class="es-sub">
                Select a session in the left bar<br />
                or create a new one with <b>+ New</b> / <b>+</b> in the project.
            </div>
            <div class="es-keys">
                <span
                    ><kbd>Enter</kbd> send · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> newline</span
                >
                <span><kbd>Ctrl</kbd>+<kbd>B</kbd> panel</span>
                <span><kbd>Esc</kbd> close the picker</span>
            </div>
        </div>
    {/if}

    <button
        class="scroll-bottom"
        class:hidden={!S.scrollBottomOn}
        title="Go to the end (bottom of the transcript)"
        onclick={S.scrollToBottom}>↓</button
    >

    {#if S.typing.on}
        <div class="typing">
            <span class="tdot"></span><span class="tdot"></span><span
                class="tdot"
            ></span>
            <span class="tlabel">{S.typing.label}</span>
        </div>
    {/if}

    <div class="composer">
        {#if S.paletteOpen || S.cmdkOpen}
            <div class="palette">
                {#if S.cmdkOpen}
                    <div class="cmdk-bar">
                        <input
                            class="model-search"
                            placeholder="command, /model …  ·  Esc closes"
                            autocomplete="off"
                            bind:value={S.cmdkText}
                            oninput={S.renderCmdk}
                            onkeydown={(e) => {
                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    S.cmdkNav(1);
                                } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    S.cmdkNav(-1);
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    S.runCmdkItem(S.cmdkIndex);
                                } else if (e.key === "Escape") {
                                    S.closeCmdk();
                                }
                            }}
                        />
                    </div>
                    <div class="palette-list">
                        {#each S.cmdkGroups as g (g.label)}
                            {@const gBase = S.cmdkGroups
                                .slice(0, S.cmdkGroups.indexOf(g))
                                .reduce((a, x) => a + x.rows.length, 0)}
                            <div class="palette-group">{g.label}</div>
                            {#each g.rows as it, i (g.label + it.title)}
                                {@const gi = gBase + i}
                                <div
                                    class="palette-row"
                                    class:sel={S.cmdkIndex === gi}
                                    onclick={() => S.runCmdkItem(gi)}
                                >
                                    <span class="pname">{it.title}</span>
                                    <span class="pdesc">{it.desc}</span>
                                    <span class="psrc">{it.src}</span>
                                </div>
                            {/each}
                        {/each}
                    </div>
                {:else}
                    <div class="palette-list">
                        {#each S.paletteItems as c, i (c.name)}
                            <div
                                class="palette-row"
                                class:sel={S.paletteIndex === i}
                                onclick={() => S.palettePick(i)}
                            >
                                <span class="pname">/{c.name}</span>
                                <span class="pdesc">{c.description || ""}</span>
                                <span class="psrc"
                                    >{c.app ? "pi" : c.source || ""}</span
                                >
                            </div>
                        {/each}
                    </div>
                {/if}
                <div class="palette-foot">{S.paletteFoot}</div>
            </div>
        {/if}

        <div class="composer-card">
            {#if S.pendingImages.length}
                <div class="attach-row">
                    {#each S.pendingImages as img (img.dataUrl)}
                        <div class="attach">
                            <img
                                src={img.dataUrl}
                                alt="attached image"
                            />
                            <button
                                type="button"
                                title="Remove image"
                                onclick={() =>
                                    S.removeImage(S.pendingImages.indexOf(img))}
                                >×</button
                            >
                        </div>
                    {/each}
                </div>
            {/if}

            <textarea
                id="input"
                bind:this={inputEl}
                placeholder="message to pi  ·  Enter sends · Ctrl+Enter new line"
                bind:value={S.inputText}
                onkeydown={(e) => {
                    onInputKeydown(e);
                    S.onComposerPasteImageCheck(e);
                }}
                oninput={S.onInputChange}
                onblur={S.onComposerBlur}
                onpaste={S.onComposerPaste}></textarea>

            <div class="composer-bar">
                <button
                    class="pill modelpill"
                    title={S.modelBtnTitle || "Model"}
                    onclick={S.modelToggleClick}
                >
                    <span class="model-name">{S.modelBtnText || "model…"}</span>
                    <span class="dim">{S.modelCtxText}</span>
                    <span class="chev">⌄</span>
                </button>
                <button
                    class="chip-btn"
                    title={S.thinkBtnTitle || "Thinking level"}
                    onclick={S.cycleThinkingLevel}>{S.thinkBtnText}</button
                >
                <span class="spacer"></span>
                <button
                    class="chip-btn ctxchip"
                    title={S.ctxChip.title}
                    class:warn={S.ctxChip.cls === "warn"}
                    class:danger={S.ctxChip.cls === "danger"}
                    onclick={S.ctxBtnClick}>{S.ctxChip.text || "—"}</button
                >
                <button
                    class="chip-btn"
                    title="Compact now (summarizes the history)"
                    disabled={S.compactBusy}
                    class:busy={S.compactBusy}
                    onclick={S.compactNow}>⤓</button
                >
                <button
                    class="chip-btn"
                    title="Auto-compaction"
                    class:on={S.autocompactOn}
                    onclick={S.toggleAutocompact}>⤾</button
                >
                <button
                    class="chip-btn"
                    title="Restart pi (reloads extensions)"
                    onclick={S.reloadSession}>↻</button
                >
                <button
                    class="chip-btn"
                    title="Attach a file as context (inserts the path into the text)"
                    onclick={S.attachFile}>@</button
                >
                <button
                    class="chip-btn"
                    title="Undo queue: returns queued messages to the composer without interrupting the turn"
                    onclick={S.desfazerFila}>↩</button
                >
                <button
                    class="chip-btn"
                    title="Create a fork (new session) from an earlier message — the original is preserved"
                    onclick={S.forkBtnClick}>fork</button
                >
                <button
                    class="primary send"
                    title="Send (Enter)"
                    onclick={S.send}>↑</button
                >
            </div>

            {#if S.modelPopOpen}
                <div class="model-pop modelpop">
                    <input
                        class="model-search"
                        placeholder="Search models…"
                        value={S.modelQuery}
                        oninput={(e) => S.renderModelList(e.target.value)}
                    />
                    <div class="model-list">
                        {#each S.modelGroups as g (g.provider)}
                            <div class="model-group">{g.provider}</div>
                            {#each g.rows as m (m.id)}
                                <div
                                    class="model-row"
                                    class:current={m.id === currentModelId()}
                                    onclick={() => S.applyModel(m)}
                                >
                                    <span class="model-name"
                                        >{m.name || m.id}</span
                                    >
                                    <span class="model-ctx"
                                        >{contextLabel(m.contextWindow)}</span
                                    >
                                </div>
                            {/each}
                        {/each}
                        {#if !S.modelGroups.length}
                            <div class="model-empty">
                                {S.modelError || "no models found"}
                            </div>
                        {/if}
                    </div>
                    {#if S.thinkHasSlider}
                        <div class="think-foot">
                            <div class="think-foot-row">
                                <span>Thinking</span><span class="think-name"
                                    >{S.thinkName}</span
                                >
                            </div>
                            <input
                                type="range"
                                min="0"
                                max={S.levelList.length - 1}
                                step="1"
                                value={S.thinkIndex}
                                oninput={(e) =>
                                    S.thinkSliderInput(Number(e.target.value))}
                                onchange={(e) =>
                                    S.thinkSliderChange(Number(e.target.value))}
                            />
                        </div>
                    {/if}
                </div>
            {/if}

            {#if S.ctxPopOpen}
                <div class="model-pop ctx-pop ctxpop">
                    <div class="ctx-rows">
                        {#if !S.ctxPopRows.length && !S.sessAgg}
                            <div class="model-empty">no stats yet</div>
                        {:else}
                            {#each S.ctxPopRows as r (r.k)}
                                {#if r.k === "Auto-compaction" && S.ctxPopAlert}
                                    <div
                                        class="ctx-alert"
                                        class:warn={S.ctxPopAlert.cls ===
                                            "warn"}
                                        class:danger={S.ctxPopAlert.cls ===
                                            "danger"}
                                    >
                                        {S.ctxPopAlert.text}
                                    </div>
                                {/if}
                                <div class="ctx-row">
                                    <div class="k">{r.k}</div>
                                    <div
                                        class="v"
                                        class:dim={r.dim}
                                    >
                                        {r.v}
                                    </div>
                                </div>
                                {#if r.k === "Auto-compaction"}
                                    <div class="ctx-row">
                                        <div class="k">Compact at</div>
                                        <div class="v">
                                            <select
                                                class="ctx-sel"
                                                disabled={S.ctxLimitDisabled}
                                                value={S.ctxLimit}
                                                onchange={(e) =>
                                                    S.saveLimit(e.target.value)}
                                            >
                                                {#each S.ctxLimitOptions as opt (opt[0])}
                                                    <option
                                                        value={opt[0]}
                                                        selected={opt[0] ===
                                                            S.ctxLimit}
                                                        >{opt[1]}</option
                                                    >
                                                {/each}
                                            </select>
                                        </div>
                                    </div>
                                {/if}
                            {/each}
                            {#if S.sessAgg}
                                <div class="ctx-total">
                                    <span>{S.sessAgg.total}</span>
                                </div>
                                {#each S.sessAgg.items as it (it.title)}
                                    <div
                                        class="ctx-sess"
                                        title={it.title}
                                    >
                                        <span class="n">{it.name}</span>
                                        <span
                                            class="m"
                                            class:warn={it.cls === "warn"}
                                            class:danger={it.cls === "danger"}
                                            >{it.text}</span
                                        >
                                    </div>
                                {/each}
                            {/if}
                        {/if}
                    </div>
                </div>
            {/if}

            {#if S.forkPopOpen}
                <div class="model-pop forkpop">
                    <div class="model-group">
                        fork from… · creates a new session · the original is
                        preserved
                    </div>
                    <div class="model-list">
                        {#if S.forkPopEmpty}
                            <div class="model-empty">no forkable messages</div>
                        {:else}
                            {#each S.forkItems as f (f.entryId)}
                                <div
                                    class="model-row"
                                    title={f.full}
                                    onclick={() => S.forkPick(f.entryId)}
                                >
                                    <span class="model-name">{f.label}</span>
                                    <span class="model-ctx">{f.shortId}</span>
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</main>

<style lang="scss">
    main {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
    }

    .load-more {
        flex: none;
        padding: 6px 12px;
        text-align: center;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        button {
            font-size: calc(11px * var(--s-ui));
            padding: 4px 12px;
        }
    }

    /* transcript */
    .log {
        background-color: var(--chat-bg);
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 26px 32px 32px;
        > * {
            width: 100%;
            max-width: 820px;
            margin-left: auto;
            margin-right: auto;
        }
    }

    /* no-session state (top offset = session-tab strip height) */
    .empty-state {
        position: absolute;
        inset: 30px 0 0 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        z-index: 5;
        background: var(--ui-bg);
        pointer-events: none;
        .es-title {
            font-family: var(--font-ui);
            font-size: calc(15px * var(--s-ui));
            color: #c4cbdb;
            letter-spacing: 0.06em;
        }
        .es-sub {
            color: var(--mute);
            font-size: calc(12px * var(--s-ui));
            text-align: center;
            line-height: 1.9;
            b {
                color: var(--dim);
                font-weight: 600;
            }
        }
        .es-keys {
            display: flex;
            gap: 16px;
            margin-top: 6px;
            color: #4d5568;
            font-family: var(--font-ui);
            font-size: calc(10.5px * var(--s-ui));
        }
        kbd {
            background: #1a1f2b;
            border: 1px solid var(--line);
            border-radius: 3px;
            padding: 1px 5px;
            color: var(--dim);
            font-family: var(--font-ui);
            font-size: calc(10px * var(--s-ui));
        }
    }

    .scroll-bottom {
        position: absolute;
        right: 22px;
        bottom: 92px;
        width: 34px;
        height: 34px;
        z-index: 15;
        border-radius: 50%;
        border: 1px solid var(--line);
        background: #1a1f2b;
        color: var(--dim);
        font-size: calc(15px * var(--s-ui));
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
        transition:
            color 0.12s,
            border-color 0.12s,
            transform 0.12s;
        &:hover {
            color: #fff;
            border-color: var(--accent);
            transform: translateY(-1px);
        }
        &.hidden {
            display: none;
        }
    }

    /* activity indicator: thinking / responding */
    .typing {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 2px 32px 8px;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        color: var(--dim);
        .tdot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--accent);
            opacity: 0.4;
            animation: bounce 1.1s infinite ease-in-out;
            &:nth-child(2) {
                animation-delay: 0.15s;
            }
            &:nth-child(3) {
                animation-delay: 0.3s;
            }
        }
        .tlabel {
            margin-left: 6px;
        }
    }
    @keyframes bounce {
        0%,
        70%,
        100% {
            transform: translateY(0);
            opacity: 0.35;
        }
        35% {
            transform: translateY(-4px);
            opacity: 1;
        }
    }

    /* composer */
    .composer {
        position: relative;
        // padding: 12px 32px 18px;
        padding-block-start: 10px;
        border-top: 1px solid var(--line);
        background: var(--ui-bg);
    }

    /* slash-command / Cmd-K palette */
    .palette {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: min(820px, 100%);
        max-height: 340px;
        display: flex;
        flex-direction: column;
        background: #11151e;
        border: 1px solid #2a3244;
        border-radius: 8px 8px 0 0;
        box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        z-index: 25;
    }
    .cmdk-bar {
        padding: 6px 8px 2px;
    }
    .palette-list {
        overflow-y: auto;
        padding: 4px 0;
    }
    .palette-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 5px 10px;
        font-family: var(--font-ui);
        font-size: calc(11.5px * var(--s-ui));
        color: #c4cbdb;
        cursor: pointer;
        .pname {
            color: var(--accent);
            flex: none;
        }
        .pdesc {
            color: var(--mute);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .psrc {
            color: #4d5568;
            font-size: calc(9.5px * var(--s-ui));
            flex: none;
        }
        &.sel {
            background: #1b2233;
        }
    }
    .palette-foot {
        padding: 5px 10px;
        border-top: 1px solid var(--line-soft);
        font-family: var(--font-ui);
        font-size: calc(10px * var(--s-ui));
        color: var(--mute);
    }
    .palette-group {
        padding: 7px 10px 2px;
        font-family: var(--font-ui);
        font-size: calc(9.5px * var(--s-ui));
        letter-spacing: 0.08em;
        color: var(--mute);
    }

    .composer-card {
        position: relative;
        width: 100%;
        margin: 0 auto;
        background: #000;
        border: 1px solid var(--line);
        border-top: 4px solid var(--secondary);
        padding: 8px 10px 6px;
    }
    .composer-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;
        .spacer {
            flex: 1;
        }
    }

    /* pasted / clipboard image thumbnails */
    .attach-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        padding-bottom: 6px;
    }
    .attach {
        position: relative;
        width: 58px;
        height: 58px;
        border-radius: 5px;
        overflow: hidden;
        border: 1px solid var(--line);
        background: #0d1017;
        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        button {
            position: absolute;
            top: 1px;
            right: 1px;
            width: 16px;
            height: 16px;
            padding: 0;
            font-size: calc(11px * var(--s-ui));
            line-height: 1;
            border-radius: 3px;
            cursor: pointer;
        }
    }

    textarea {
        width: 100%;
        resize: none;
        height: 44px;
        background: transparent;
        color: var(--fg);
        border: none;
        padding: 2px 2px 6px;
        font-family: var(--font-ui);
        font-size: calc(12.5px * var(--s-ui));
        line-height: 1.5;
        outline: none;
        &::placeholder {
            color: #4d5568;
        }
    }

    .dim {
        color: var(--mute);
    }
    .pill {
        display: flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: 1px solid transparent;
        color: #c4cbdb;
        border-radius: 5px;
        padding: 3px 7px;
        font-family: var(--font-ui);
        font-size: calc(11.5px * var(--s-ui));
        max-width: 280px;
        &:hover {
            border-color: var(--line);
            background: #161b26;
        }
        .model-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .chev {
            color: var(--mute);
            font-size: calc(10px * var(--s-ui));
        }
    }

    .think-foot {
        border-top: 1px solid var(--line);
        padding: 8px 10px 10px;
        .think-foot-row {
            display: flex;
            justify-content: space-between;
            font-family: var(--font-ui);
            font-size: calc(11px * var(--s-ui));
            color: var(--dim);
            margin-bottom: 6px;
        }
        .think-name {
            color: var(--accent);
        }
        input[type="range"] {
            width: 100%;
            margin: 0;
            accent-color: var(--accent);
        }
    }

    .chip-btn {
        background: transparent;
        border: 1px solid transparent;
        color: var(--mute);
        border-radius: 5px;
        padding: 3px 6px;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        &:hover {
            border-color: var(--line);
            color: var(--fg);
            background: #161b26;
        }
        &.on {
            color: var(--accent);
        }
        &.warn {
            color: var(--warn);
        }
        &.danger {
            color: var(--err);
        }
        &.busy {
            opacity: 0.6;
        }
        &:disabled {
            cursor: default;
        }
    }

    button.primary.send {
        padding: 2px 9px;
        font-size: calc(14px * var(--s-ui));
        line-height: 1.2;
        border-radius: 5px;
    }

    /* popovers (model / context / fork) */
    .model-pop {
        position: absolute;
        bottom: 46px;
        left: 8px;
        right: 8px;
        max-width: 520px;
        background: #11151e;
        border: 1px solid #2a3244;
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
        overflow: hidden;
        z-index: 30;
    }
    .model-search {
        width: 100%;
        background: #0c0f16;
        border: none;
        border-bottom: 1px solid var(--line);
        color: var(--fg);
        padding: 8px 10px;
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        outline: none;
        box-sizing: border-box;
    }
    .model-list {
        max-height: 320px;
        overflow-y: auto;
        padding: 4px 0 6px;
    }
    .model-group {
        padding: 8px 10px 3px;
        font-family: var(--font-ui);
        font-size: calc(9.5px * var(--s-ui));
        letter-spacing: 0.08em;
        color: var(--mute);
    }
    .model-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        padding: 5px 10px;
        font-family: var(--font-ui);
        font-size: calc(12px * var(--s-ui));
        color: #c4cbdb;
        cursor: pointer;
        &:hover {
            background: #1a2030;
        }
        &.current {
            color: var(--accent);
        }
    }
    .model-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .model-ctx {
        color: var(--mute);
        font-size: calc(10.5px * var(--s-ui));
        flex: none;
    }
    .model-empty {
        padding: 10px;
        color: var(--mute);
        font-size: calc(11px * var(--s-ui));
    }

    /* context popover */
    .ctx-pop {
        max-width: 340px;
        left: auto;
        right: 8px;
        padding: 4px 0;
    }
    .ctx-row {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--line-soft);
        font-family: var(--font-ui);
        &:last-child {
            border-bottom: none;
        }
        .k {
            color: var(--mute);
            font-size: calc(9.5px * var(--s-ui));
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }
        .v {
            color: #c4cbdb;
            font-size: calc(11.5px * var(--s-ui));
            &.dim {
                color: var(--dim);
            }
        }
    }
    .ctx-sel {
        background: #0c0f16;
        border: 1px solid var(--line);
        color: #c4cbdb;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        padding: 2px 4px;
        border-radius: 4px;
        outline: none;
        max-width: 210px;
        &:disabled {
            color: var(--mute);
        }
    }
    .ctx-alert {
        margin: 6px 10px;
        padding: 6px 8px;
        border-radius: 5px;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        line-height: 1.5;
        &.warn {
            border: 1px solid #3d2f18;
            background: #241d10;
            color: var(--warn);
        }
        &.danger {
            border: 1px solid #4a2226;
            background: #2a1518;
            color: var(--err);
        }
    }
    .ctx-total {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 10px;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        color: #c4cbdb;
        border-top: 1px solid var(--line);
    }
    .ctx-sess {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 4px 10px;
        font-family: var(--font-ui);
        font-size: calc(11px * var(--s-ui));
        .n {
            color: #c4cbdb;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .m {
            color: var(--mute);
            flex: none;
            &.warn {
                color: var(--warn);
            }
            &.danger {
                color: var(--err);
            }
        }
    }
</style>
