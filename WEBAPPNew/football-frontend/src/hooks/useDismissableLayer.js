import { useEffect } from 'react';

export default function useDismissableLayer({ open, onClose, containerRef, triggerRef }) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event) => {
      if (!containerRef.current?.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { onClose(); triggerRef?.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, containerRef, triggerRef]);
}
