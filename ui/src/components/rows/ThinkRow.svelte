<script>
    let { row } = $props(); // { kind:'think', text, collapsed }

    // Per-row collapsed state (mirrors the original DOM class toggle).
    let collapsed = $state(!!row.collapsed);
</script>

<div
    class="think-block"
    class:collapsed
>
    <button
        class="think-head"
        type="button"
        title="Toggle thinking"
        onclick={() => (collapsed = !collapsed)}
    >
        💭 Hmm... {collapsed ? "▸" : "▾"}
    </button>
    <pre class="think-body">{row.text}</pre>
</div>

<style>
    /* thinking block */
    .think-block {
        margin: 0 0 12px;
        border-left: 2px solid #2b3348;
        padding-left: 10px;

        .think-head {
            background: none;
            border: none;
            color: var(--mute);
            font-family: var(--font-ui);
            font-size: calc(10.5px * var(--s-ui));
            cursor: pointer;
            padding: 0;

            &:hover {
                color: var(--dim);
            }
        }

        .think-body {
            background-color: #000018;
            border-radius: 10px;
            color: var(--thinking);
            font-family: var(--font-chat);
            font-size: var(--fs-chat);
            font-style: italic;
            line-height: 1.2;
            margin: 4px 0 0;
            /* max-height: 260px; */
            overflow: auto;
            padding: 0.5em 1em;
            white-space: pre-wrap;
        }

        &.collapsed .think-body {
            display: none;
        }
    }
</style>
