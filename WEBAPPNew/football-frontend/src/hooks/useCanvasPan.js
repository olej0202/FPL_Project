import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function useCanvasPan({ viewportRef, zoom, onZoom, minZoom, maxZoom }) {
  const drag = useRef(null);
  const touches = useRef(new Map());
  const pinch = useRef(null);
  const pendingScroll = useRef(null);
  const frame = useRef(null);
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useLayoutEffect(() => {
    if (pendingScroll.current && viewportRef.current) {
      viewportRef.current.scrollLeft = pendingScroll.current.left;
      viewportRef.current.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom, viewportRef]);
  const zoomTo = (value, clientPoint, worldPoint) => {
    const pane = viewportRef.current;
    const next = Math.max(minZoom, Math.min(maxZoom, value));
    if (!pane) { onZoom(next); return; }
    const rect = pane.getBoundingClientRect();
    const x = clientPoint ? clientPoint.x - rect.left - pane.clientLeft : pane.clientWidth / 2;
    const y = clientPoint ? clientPoint.y - rect.top - pane.clientTop : pane.clientHeight / 2;
    const world = worldPoint || { x: (pane.scrollLeft + x) / zoom, y: (pane.scrollTop + y) / zoom };
    const scroll = { left: world.x * next - x, top: world.y * next - y };
    if (next === zoom) {
      pane.scrollLeft = scroll.left;
      pane.scrollTop = scroll.top;
    } else {
      pendingScroll.current = scroll;
      onZoom(next);
    }
  };
  const touchPair = () => {
    const [a, b] = [...touches.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const startDrag = (pane, point, pointerId, canPan = true) => {
    drag.current = { pointerId, ...point, left: pane.scrollLeft, top: pane.scrollTop, canPan };
  };
  const finish = (event) => {
    const pane = event.currentTarget;
    if (event.pointerType === 'touch') {
      if (!touches.current.delete(event.pointerId)) return;
      cancelAnimationFrame(frame.current);
      pinch.current = null;
      if (touches.current.size === 1) {
        const [id, point] = [...touches.current.entries()][0];
        startDrag(pane, point, id);
      } else if (!touches.current.size) {
        drag.current = null;
        setPanning(false);
      }
    } else if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      setPanning(false);
    }
    if (pane.hasPointerCapture?.(event.pointerId)) pane.releasePointerCapture(event.pointerId);
  };
  return {
    panning,
    zoomTo,
    handlers: {
      // Capture touch gestures over nodes too, while preserving ordinary taps.
      onPointerDownCapture(event) {
        if (event.pointerType !== 'touch') return;
        const pane = event.currentTarget;
        const point = { x: event.clientX, y: event.clientY };
        touches.current.set(event.pointerId, point);
        if (touches.current.size === 1) {
          suppressClick.current = false;
          startDrag(pane, point, event.pointerId, !event.target.closest('input, select, textarea, [role="slider"]'));
        } else if (touches.current.size === 2) {
          const pair = touchPair();
          const rect = pane.getBoundingClientRect();
          pinch.current = { distance: Math.max(pair.distance, 1), zoom,
            world: { x: (pane.scrollLeft + pair.x - rect.left - pane.clientLeft) / zoom,
              y: (pane.scrollTop + pair.y - rect.top - pane.clientTop) / zoom } };
          suppressClick.current = true;
          setPanning(true);
          touches.current.forEach((_, id) => pane.setPointerCapture(id));
          event.stopPropagation();
        }
      },
      onPointerMoveCapture(event) {
        if (event.pointerType !== 'touch' || !touches.current.has(event.pointerId)) return;
        const pane = event.currentTarget;
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch.current && touches.current.size >= 2) {
          event.preventDefault();
          event.stopPropagation();
          const pair = touchPair();
          const start = pinch.current;
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => zoomTo(start.zoom * pair.distance / start.distance, pair, start.world));
          return;
        }
        const start = drag.current;
        if (!start?.canPan || start.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6 && !suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = true;
        pane.setPointerCapture(event.pointerId);
        setPanning(true);
        pane.scrollLeft = start.left - (event.clientX - start.x);
        pane.scrollTop = start.top - (event.clientY - start.y);
      },
      onPointerUpCapture: finish,
      onPointerCancelCapture: finish,
      onPointerDown(event) {
        if (event.pointerType === 'touch') return;
        suppressClick.current = false;
        if (event.button !== 0 || event.target.closest('button, input, select, textarea, a, [role="button"], [draggable="true"], [data-tree-node]')) return;
        event.preventDefault();
        const pane = event.currentTarget;
        startDrag(pane, { x: event.clientX, y: event.clientY }, event.pointerId);
        pane.setPointerCapture(event.pointerId);
        setPanning(true);
      },
      onPointerMove(event) {
        if (event.pointerType === 'touch') return;
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4) suppressClick.current = true;
        event.preventDefault();
        event.currentTarget.scrollLeft = start.left - (event.clientX - start.x);
        event.currentTarget.scrollTop = start.top - (event.clientY - start.y);
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture(event) {
        // Ignore implicit touch capture being transferred from a child node.
        if (event.target === event.currentTarget) finish(event);
      },
      onClickCapture(event) {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      },
    },
  };
}
