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
    .think-body {
        color: var(--thinking);
        font-style: italic;
        background-color: #000018;
        font-size: 0.75em;
        line-height: 1.2;
        padding: 0.5em 1em;
        margin: 0.5em 0;
        border-radius: 10px;
    }
</style>
