<script>
  import { S } from '../lib/state.svelte.js';

  // 'left' resizes the session sidebar, 'right' resizes the side panel.
  let { side = 'left' } = $props();

  let dragging = $state(false);

  // Width of the panel this grip controls, derived from the deck rect.
  function widthFor(clientX) {
    const deck = document.querySelector('.deck');
    if (!deck) return null;
    const r = deck.getBoundingClientRect();
    return side === 'left' ? clientX - r.left : r.right - clientX;
  }

  function onDown(e) {
    if (e.button !== 0) return; // primary button only
    if (widthFor(e.clientX) == null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging = true;
    document.body.classList.add('resizing');
  }

  function onMove(e) {
    if (!dragging) return;
    const w = widthFor(e.clientX);
    if (w == null) return;
    S.setPanelW(side, w);
  }

  // pointerup and pointercancel both end the drag and persist the width.
  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    S.commitPanelW(side);
  }
</script>

<div class="grip grip-{side}" class:dragging={dragging}
     role="separator" aria-orientation="vertical"
     title="Drag to resize · double-click to reset"
     onpointerdown={onDown} onpointermove={onMove}
     onpointerup={onUp} onpointercancel={onUp}
     ondblclick={() => S.resetPanelW(side)}>
</div>
