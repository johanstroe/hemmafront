import { useRef, type TouchEvent } from "react";

type SwipeHandlers = {
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
};

export function useHorizontalSwipe(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  threshold = 60,
): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(e) {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd(e) {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
      if (dx > 0) onSwipeRight?.();
      else onSwipeLeft?.();
    },
  };
}
