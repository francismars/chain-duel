import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { confirmKeyCode, slotBindings } from '@/lib/controls/playerControls';
import {
  StickSession,
  TOUCH_GESTURE_EVENT,
  isStickBlockedTarget,
  keyFromCode,
  type StickVisual,
} from '@/features/game/touchStick';
import './touchMatchFrame.css';

type TouchMatchMode = 'off' | 'landscape' | 'portrait';

const PUCK_TRAVEL_PX = 22;

function readTouchMatchMode(): TouchMatchMode {
  if (typeof window === 'undefined') return 'off';
  if (!window.matchMedia('(pointer: coarse)').matches) return 'off';
  return window.matchMedia('(orientation: landscape)').matches
    ? 'landscape'
    : 'portrait';
}

function useTouchMatchMode(): TouchMatchMode {
  const [mode, setMode] = useState(readTouchMatchMode);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const landscape = window.matchMedia('(orientation: landscape)');
    const update = () => setMode(readTouchMatchMode());
    coarse.addEventListener('change', update);
    landscape.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      coarse.removeEventListener('change', update);
      landscape.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return mode;
}

function placeRing(
  ring: HTMLDivElement,
  puck: HTMLDivElement,
  visual: StickVisual | null
): void {
  if (!visual) {
    ring.style.opacity = '0';
    return;
  }
  ring.style.opacity = '1';
  ring.style.transform = `translate(${visual.x}px, ${visual.y}px) translate(-50%, -50%)`;
  const dist = Math.hypot(visual.dx, visual.dy);
  const scale = dist > PUCK_TRAVEL_PX ? PUCK_TRAVEL_PX / dist : 1;
  puck.style.transform = `translate(${visual.dx * scale}px, ${visual.dy * scale}px)`;
}

function dispatchStickKey(type: 'keydown' | 'keyup', code: string): void {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      code,
      key: keyFromCode(code),
      bubbles: true,
      cancelable: true,
    })
  );
}

function useStickPointer(
  mode: TouchMatchMode,
  ringRef: RefObject<HTMLDivElement | null>,
  puckRef: RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    if (mode !== 'landscape') return;

    let session: StickSession | null = null;
    let pointerId: number | null = null;
    let fullscreenTried = false;

    const onVisual = (visual: StickVisual | null) => {
      const ring = ringRef.current;
      const puck = puckRef.current;
      if (!ring || !puck) return;
      placeRing(ring, puck, visual);
    };

    const onDown = (event: PointerEvent) => {
      window.dispatchEvent(new Event(TOUCH_GESTURE_EVENT));
      if (event.pointerType === 'mouse' || event.button !== 0) return;
      if (!fullscreenTried) {
        fullscreenTried = true;
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
      if (isStickBlockedTarget(event.target) || session) return;
      session = new StickSession(
        slotBindings('p1'),
        confirmKeyCode('p1'),
        dispatchStickKey,
        onVisual
      );
      pointerId = event.pointerId;
      session.begin(event.clientX, event.clientY);
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== pointerId) return;
      session.move(event.clientX, event.clientY);
      event.preventDefault();
    };

    const finish = (event: PointerEvent, tap: boolean) => {
      if (!session || event.pointerId !== pointerId) return;
      if (tap) session.end();
      else session.cancel();
      session = null;
      pointerId = null;
    };

    const onUp = (event: PointerEvent) => finish(event, true);
    const onCancel = (event: PointerEvent) => finish(event, false);

    window.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      session?.cancel();
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [mode, puckRef, ringRef]);
}

/** Touch phones: landscape 16:9 stage, portrait rotate gate, finger steering. */
export function TouchMatchFrame({ children }: { children: ReactNode }) {
  const mode = useTouchMatchMode();
  const ringRef = useRef<HTMLDivElement>(null);
  const puckRef = useRef<HTMLDivElement>(null);
  const portraitRef = useRef<HTMLDivElement>(null);
  useStickPointer(mode, ringRef, puckRef);

  useEffect(() => {
    if (mode === 'off') return;
    document.body.classList.add('touch-match-active');
    return () => document.body.classList.remove('touch-match-active');
  }, [mode]);

  useEffect(() => {
    const node = portraitRef.current;
    if (!node) return;
    node.inert = true;
  }, [mode]);

  if (mode === 'off') return children;

  if (mode === 'portrait') {
    return (
      <>
        <div
          ref={portraitRef}
          className="touch-match-portrait-game"
          aria-hidden="true"
        >
          {children}
        </div>
        <div className="touch-match-rotate" role="status">
          <p className="touch-match-rotate__title condensed">Turn sideways</p>
        </div>
      </>
    );
  }

  return (
    <div className="touch-match-root">
      <div className="touch-match-frame touch-match-frame--on">{children}</div>
      <div className="touch-stick" ref={ringRef} aria-hidden>
        <div className="touch-stick__puck" ref={puckRef} />
      </div>
    </div>
  );
}
