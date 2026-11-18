<script>
  import { prettyId } from '../lib/util.js';
  import { S } from '../lib/state.svelte.js';
</script>

<div class="tabs">
  {#each S.tabs as t (t.key)}
    {@const st = S.tabState(t)}
    {@const title =
      S.projectName(t.cwd) + '\n' + (t.cwd || '—') + '\n' + t.key + '\n' + st.label}
    <div class="tab" class:active={S.activeTab && S.activeTab.key === t.key} {title}
         onclick={() => S.switchTab(t.key)}
         onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); S.closeTab(t.key); } }}
         onmousedown={(e) => { if (e.button === 1) e.preventDefault(); }}>
      <span class="tab-dot" class:busy={st.dot === ' busy'} class:live={st.dot === ' live'}></span>
      <span class="tab-proj">{S.projectName(t.cwd)}</span>
      <span class="tab-title">{t.label || prettyId(t.key)}</span>
      <button class="tab-close" title="close this session"
              onclick={(e) => { e.stopPropagation(); S.closeTab(t.key); }}>✕</button>
    </div>
  {/each}
</div>

<style lang="scss">
  .tabs {
    grid-column: 1 / -1;
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 10px;
    border-right: 1px solid var(--line-soft);
    cursor: pointer;
    min-width: 0;
    max-width: 220px;
    font-size: calc(12px * var(--s-ui));
    color: var(--dim);
    &:hover { background: rgba(255, 255, 255, 0.03); }
    &.active { background: var(--bg); color: var(--fg); }
  }
  .tab-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #4a5568; flex: none;
    &.live { background: var(--ok); }
    &.busy { background: var(--warn); animation: pulse 1.1s ease-in-out infinite; }
  }
  .tab-proj {
    font-size: calc(10px * var(--s-ui)); color: var(--mute); flex: none;
    max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tab-title {
    font-size: calc(12px * var(--s-ui));
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tab-close {
    flex: none;
    background: none; border: none; color: var(--mute);
    cursor: pointer; font-size: calc(11px * var(--s-ui)); padding: 2px 4px; border-radius: 4px;
    &:hover { background: rgba(255, 255, 255, 0.08); color: var(--fg); }
  }
  @keyframes pulse { 50% { opacity: 0.35; } }
</style>
