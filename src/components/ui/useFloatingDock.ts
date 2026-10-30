import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { STORAGE_KEY_QUICK_MENU_DOCK } from '@/shared/constants/storageKeys';

export type DockSide = 'left' | 'right';

interface Dock {
  side: DockSide;
  /** Vertical position as a fraction of the free height, so it survives rotation/resize. */
  y: number;
}

/** Finger travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 6;
const EDGE_GAP_PX = 10;
/**
 * Top of the left edge, in the wordmark row. Mid-screen covered LEDGER,
 * room rows, and the nsec field; lower spots land on the menu footers.
 */
const DEFAULT_DOCK: Dock = { side: 'left', y: 0 };

function readDock(): Dock {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUICK_MENU_DOCK);
    if (!raw) return DEFAULT_DOCK;
    const parsed = JSON.parse(raw) as Partial<Dock>;
    const side = parsed.side === 'right' ? 'right' : 'left';
    const y =
      typeof parsed.y === 'number' && parsed.y >= 0 && parsed.y <= 1
        ? parsed.y
        : DEFAULT_DOCK.y;
    return { side, y };
  } catch {
    return DEFAULT_DOCK;
  }
}

function writeDock(dock: Dock): void {
  try {
    localStorage.setItem(STORAGE_KEY_QUICK_MENU_DOCK, JSON.stringify(dock));
  } catch {
    /* ignore */
  }
}

function safeInset(name: 'top' | 'bottom' | 'left' | 'right'): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    `--safe-${name}`
  );
  return parseFloat(value) || 0;
}

function bounds(size: number) {
  const minX = safeInset('left') + EDGE_GAP_PX;
  const maxX = window.innerWidth - safeInset('right') - EDGE_GAP_PX - size;
  const minY = safeInset('top') + EDGE_GAP_PX;
  const maxY = window.innerHeight - safeInset('bottom') - EDGE_GAP_PX - size;
  return { minX, maxX, minY, maxY: Math.max(minY, maxY) };
}

function dockToPoint(dock: Dock, size: number) {
  const b = bounds(size);
  return {
    x: dock.side === 'left' ? b.minX : b.maxX,
    y: b.minY + dock.y * (b.maxY - b.minY),
  };
}

/**
 * A button you can drag anywhere; on release it glides to the nearest side
 * edge and remembers the spot. `consumeDrag()` tells a click handler whether
 * the press was really a drag (so it shouldn't toggle anything).
 */
export function useFloatingDock(size: number, enabled: boolean) {
  const [dock, setDock] = useState<Dock>(readDock);
  const [point, setPoint] = useState(() =>
    typeof window === 'undefined' ? { x: 0, y: 0 } : dockToPoint(dock, size)
  );
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const draggedRef = useRef(false);

  // Re-place on resize / rotation and whenever the dock changes.
  useEffect(() => {
    if (!enabled) return;
    const place = () => setPoint(dockToPoint(dock, size));
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [dock, size, enabled]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: point.x,
        originY: point.y,
        moved: false,
      };
      draggedRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [point]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== event.pointerId) return;
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!g.moved) {
        g.moved = true;
        setDragging(true);
      }
      const b = bounds(size);
      setPoint({
        x: Math.min(b.maxX, Math.max(b.minX, g.originX + dx)),
        y: Math.min(b.maxY, Math.max(b.minY, g.originY + dy)),
      });
    },
    [size]
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = gesture.current;
      if (!g || g.id !== event.pointerId) return;
      gesture.current = null;
      if (!g.moved) return;
      draggedRef.current = true;
      setDragging(false);
      const b = bounds(size);
      const centerX = point.x + size / 2;
      const next: Dock = {
        side: centerX < window.innerWidth / 2 ? 'left' : 'right',
        y:
          b.maxY === b.minY
            ? 0
            : Math.min(1, Math.max(0, (point.y - b.minY) / (b.maxY - b.minY))),
      };
      setDock(next);
      writeDock(next);
    },
    [point, size]
  );

  /** True (once) if the last press was a drag — skip the click it produces. */
  const consumeDrag = useCallback(() => {
    const was = draggedRef.current;
    draggedRef.current = false;
    return was;
  }, []);

  const opensUp =
    typeof window !== 'undefined' &&
    point.y + size / 2 > window.innerHeight / 2;

  return {
    side: dock.side,
    opensUp,
    point,
    dragging,
    consumeDrag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
