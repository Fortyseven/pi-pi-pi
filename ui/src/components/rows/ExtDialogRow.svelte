<script>
    import { S } from '../../lib/state.svelte.js';

    /**
     * Interactive extension UI dialog (select/confirm/input/editor) raised by a
     * pi extension via the RPC extension_ui_request sub-protocol. While pending
     * the agent process blocks until an answer is sent back (or its timeout
     * expires and the agent auto-resolves).
     */
    let { row } = $props();

    let now = $state(Date.now());
    $effect(() => {
        if (row.state !== 'pending' || !row.deadline) return;
        const iv = setInterval(() => (now = Date.now()), 1000);
        return () => clearInterval(iv);
    });
    let remaining = $derived(
        row.deadline ? Math.max(0, Math.ceil((row.deadline - now) / 1000)) : null,
    );

    function submit() {
        S.dialogAnswer(row, { value: row.input });
    }
    function onKeydown(e) {
        if (row.method === 'input' && e.key === 'Enter') {
            e.preventDefault();
            submit();
        } else if (row.method === 'editor' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    }
</script>

<div class="row ext-dialog" class:pending={row.state === 'pending'}>
    <b>extension</b>
    <span class="d-title">{row.title || row.method}</span>

    {#if row.state === 'pending'}
        {#if row.message}<span class="d-msg">{row.message}</span>{/if}
        <span class="d-body">
            {#if row.method === 'select'}
                {#each row.options as opt}
                    <button class="primary" onclick={() => S.dialogAnswer(row, { value: opt })}>
                        {opt}
                    </button>
                {/each}
            {:else if row.method === 'confirm'}
                <button class="primary" onclick={() => S.dialogAnswer(row, { confirmed: true })}>Yes</button>
                <button class="ghost" onclick={() => S.dialogAnswer(row, { confirmed: false })}>No</button>
            {:else}
                {#if row.method === 'editor'}
                    <textarea bind:value={row.input} rows="4" onkeydown={onKeydown}></textarea>
                {:else}
                    <input type="text" bind:value={row.input} placeholder={row.placeholder} onkeydown={onKeydown} />
                {/if}
                <button class="primary" onclick={submit}>Send</button>
            {/if}
            <button class="ghost" onclick={() => S.dialogAnswer(row, { cancelled: true })}>Dismiss</button>
            {#if remaining !== null}<span class="d-timeout">{remaining}s</span>{/if}
        </span>
    {:else}
        <span
            class="d-answer"
            class:bad={row.state !== 'sent'}>
            {row.state === 'sent' ? '→ ' : '· '}{row.answerText || row.state}
        </span>
    {/if}
</div>

<style lang="scss">
    .ext-dialog {
        display: block;
        border: 1px solid #3a4258;
        border-radius: 6px;
        padding: 8px 10px;
        margin: 6px 0;
        background: rgba(255, 255, 255, 0.03);
        &.pending {
            border-color: var(--warn, #d9a441);
        }
        b {
            color: var(--mute);
            margin-right: 6px;
        }
        .d-title {
            font-weight: 600;
        }
        .d-msg {
            display: block;
            color: var(--dim);
            margin: 2px 0 0 0;
            white-space: pre-wrap;
        }
        .d-body {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            margin-top: 8px;
            button {
                font-size: calc(11.5px * var(--s-ui));
                padding: 3px 10px;
            }
            input,
            textarea {
                flex: 1;
                min-width: 160px;
                background: #0d1017;
                border: 1px solid var(--line, #2a3244);
                border-radius: 4px;
                color: var(--fg);
                font-family: var(--font-ui);
                font-size: calc(12px * var(--s-ui));
                padding: 4px 8px;
                &:focus {
                    outline: none;
                    border-color: var(--accent);
                }
            }
            textarea {
                resize: vertical;
            }
        }
        .d-timeout {
            color: var(--warn, #d9a441);
            font-size: calc(11px * var(--s-ui));
        }
        .d-answer {
            color: var(--dim);
            &.bad {
                color: var(--warn, #d9a441);
            }
        }
    }
</style>
