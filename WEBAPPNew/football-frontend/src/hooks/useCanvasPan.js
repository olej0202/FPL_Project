import { useRef, useState } from 'react';

export default function useCanvasPan() {
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);
  const finish = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = Boolean(drag.current.moved);
    drag.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return {
    panning,
    handlers: {
      onPointerDown(event) {
        suppressClick.current = false;
        if (event.button !== 0 || event.target.closest('button, input, select, textarea, a, [role="button"], [draggable="true"], [data-tree-node]')) return;
        event.preventDefault();
        const pane = event.currentTarget;
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: pane.scrollLeft, top: pane.scrollTop };
        pane.setPointerCapture(event.pointerId);
        setPanning(true);
      },
      onPointerMove(event) {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4) start.moved = true;
        event.preventDefault();
        event.currentTarget.scrollLeft = start.left - (event.clientX - start.x);
        event.currentTarget.scrollTop = start.top - (event.clientY - start.y);
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onClickCapture(event) {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      },
    },
  };
}
