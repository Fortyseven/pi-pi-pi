<script>
    import { S } from "../../lib/state.svelte.js";

    // row: { kind:'user', text, dataText, images[], queueTag, forkText, forkMsg, forkIndex }
    export let row;

    // A sent message can still be in the pi queue; the tag mirrors its state.
    const queued = () => !!(row.queueTag && row.queueTag.cls === "");
</script>

<div
    class="row user"
    class:queued
    data-text={row.dataText}
>
    ▸ {row.text}
    {#if row.queueTag}
        <span
            class="queue-tag"
            class:delivered={row.queueTag.cls === "delivered"}
            class:cancelled={row.queueTag.cls === "cancelled"}
            >{row.queueTag.text}</span
        >
    {/if}
    {#if row.forkText}
        <button
            class="tiny forkrow"
            title={row.forkText}
            onclick={() => S.forkRowClick(row)}>fork</button
        >
    {/if}
    {#each row.images as src (src)}
        <div class="msg-img">
            <img
                {src}
                alt="attached image"
                title="click to enlarge"
                onclick={() => S.openImage(src)}
            />
        </div>
    {/each}
</div>

<style>
    .user {
        color: var(--user);
        font-weight: bold;
        font-size: 1rem;
        color: var(--accent);
    }
</style>
