<script>
  import { S } from '../lib/state.svelte.js';
  import Row from './rows/Row.svelte';
  import { flashCopy } from '../lib/copy.js';
  import { relTime } from '../lib/util.js';
</script>

{#if S.detail}
  <div class="detail">
    <div class="detail-head">
      <button onclick={S.closeDetail}>← back</button>
      <span class="detail-title">{S.detail.title}</span>
    </div>
    <div class="detail-log">
      {#if S.detail.kind === 'child'}
        {#if S.childError}
          <div class="row note">{S.childError}</div>
        {:else}
          {#each S.childRows as row (row.id)}
            <Row {row} />
          {/each}
        {/if}
      {:else if S.detail.kind === 'file'}
        <div class="file-actions">
          <button class="tiny" onclick={(e) => flashCopy(e.currentTarget, S.detail.file)}>copy path</button>
          <button class="tiny" onclick={() => S.openFileActions('open')}>open</button>
        </div>
        {#each S.detail.items as item, i (i)}
          <div class="diff">
            <div class="diff-head">
              <span class="tool-name">{item.tool}</span>
              <span class="diff-file">{item.src}</span>
              <span class="tool-right">{relTime(item.at)}</span>
            </div>
            <div class="diff-body">
              {#each item.blocks as b, j (j)}
                {#if b.undo}
                  <button class="tiny" onclick={() => S.revertHunk(S.detail.file, b.hunkText)}>undo hunk</button>
                {:else}
                  <div class="diff-line {b.cls}">{b.line || ' '}</div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      {:else if S.detail.kind === 'mission'}
        <div class="history-head">{S.detail.head}</div>
        {#each S.detail.rows as [k, v] (k)}
          <div class="row note">{k}: {v || '—'}</div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .detail {
    position: fixed;
    top: 34px;
    left: var(--sidebar-w);
    right: var(--right-w);
    bottom: 0;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
    z-index: 20;
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
      &:hover { color: #fff; border-color: var(--accent); background: #222a3d; }
    }
  }
  .detail-title { font-family: var(--font-ui); font-size: calc(11.5px * var(--s-ui)); color: var(--dim); overflow: hidden; text-overflow: ellipsis; }
  .detail-log { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 14px 18px 24px;
    > * { max-width: 920px; }
  }

  .file-actions { display: flex; gap: 6px; margin-bottom: 8px; }

  /* edited-file diff */
  .diff { margin: 0 0 14px; border: 1px solid #1e2431; border-radius: 6px; background: #0c0f16; overflow: hidden; }
  .diff-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 9px;
    border-bottom: 1px solid var(--line-soft);
    background: #12151d;
    font-family: var(--font-ui);
    font-size: calc(11px * var(--s-ui));
    color: var(--dim);
    .tool-name { flex: none; color: var(--accent); }
  }
  .diff-file { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool-right { color: var(--mute); font-size: calc(10px * var(--s-ui)); flex: none; }
  .diff-body { max-height: 60vh; overflow: auto; padding: 5px 0; }
  .diff-line { font-family: var(--font-code); font-size: calc(11px * var(--s-code)); line-height: 1.5; white-space: pre; padding: 0 9px; }
  .diff-add { background: #12251a; color: #9ad7a6; }
  .diff-del { background: #2a1519; color: #e2a0a8; }
  .diff-hunk { color: #6f7c99; padding-top: 4px; }
  .diff-meta { color: #6f7c99; }
  .history-head {
    font-family: var(--font-ui);
    font-size: calc(10.5px * var(--s-ui));
    color: var(--mute);
    padding-bottom: 6px;
  }
</style>
