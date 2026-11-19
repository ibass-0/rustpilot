import { createSignal, type JSX } from 'solid-js';
import { layout, setPanelSize } from '../../application/layoutStore';
import type { Side } from '../../domain/layout';

const MAX_FRACTION = 0.6;

/** A draggable divider that resizes the panel docked on `side`. */
export function Splitter(props: { side: Side }): JSX.Element {
  const [dragging, setDragging] = createSignal(false);
  const horizontal = () => props.side === 'bottom';
  let startPos = 0;
  let startSize = 0;

  const position = (event: PointerEvent) => (horizontal() ? event.clientY : event.clientX);

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    startPos = position(event);
    startSize = layout.size[props.side];
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging()) return;
    const delta = position(event) - startPos;
    // Only the left panel grows as the pointer moves in the positive direction.
    const size = props.side === 'left' ? startSize + delta : startSize - delta;
    const viewport = horizontal() ? window.innerHeight : window.innerWidth;
    setPanelSize(props.side, size, viewport * MAX_FRACTION);
  };

  const stop = () => setDragging(false);

  return (
    <div
      class={`splitter ${horizontal() ? 'splitter-horizontal' : 'splitter-vertical'}`}
      role="separator"
      aria-orientation={horizontal() ? 'horizontal' : 'vertical'}
      data-dragging={dragging() ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    />
  );
}
