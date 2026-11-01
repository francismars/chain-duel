import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  confirmKeyCode,
  slotBindings,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import {
  StickSession,
  TOUCH_GESTURE_EVENT,
  createStickKeyEvent,
  isStickBlockedTarget,
  type StickVisual,
} from '@/features/game/touchStick';
import {
  readTouchPlaySlot,
  TOUCH_PLAY_TARGET_EVENT,
} from '@/features/game/touch/touchPlayTarget';
import { readTouchDebugMode } from '@/shared/utils/inputMode';
import './touchMatchFrame.css';

type TouchMatchMode = 'off' | 'landscape' | 'portrait';

const PUCK_TRAVEL_PX = 22;

function readTouchMatchMode(): TouchMatchMode {
  if (typeof window === 'undefined') return 'off';
  const forced = readTouchDebugMode();
  if (forced === 'portrait' || forced === 'landscape') return forced;
  if (!forced && !window.matchMedia('(pointer: coarse)').matches) return 'off';
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
  window.dispatchEvent(createStickKeyEvent(type, code));
}

function touchById(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i += 1) {
    const touch = list.item(i);
    if (touch && touch.identifier === id) return touch;
  }
  return null;
}

function useStickPointer(
  mode: TouchMatchMode,
  ringRef: RefObject<HTMLDivElement | null>,
  puckRef: RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    if (mode === 'off') return;
    // `?touch=` debug: no fingers on a desktop, so the mouse drives the stick.
    const mouseSteers = readTouchDebugMode() !== null;

    let session: StickSession | null = null;
    let sessionSlot: PlayerControlSlot | null = null;
    let touchId: number | null = null;
    let pointerId: number | null = null;

    const onVisual = (visual: StickVisual | null) => {
      const ring = ringRef.current;
      const puck = puckRef.current;
      if (!ring || !puck) return;
      placeRing(ring, puck, visual);
    };

    const begin = (x: number, y: number) => {
      const slot = readTouchPlaySlot();
      if (!slot) return false;
      sessionSlot = slot;
      session = new StickSession(
        slotBindings(slot),
        confirmKeyCode(slot),
        dispatchStickKey,
        onVisual
      );
      session.begin(x, y);
      return true;
    };

    const endTouch = (tap: boolean) => {
      if (!session) return;
      if (tap) session.end();
      else session.cancel();
      session = null;
      sessionSlot = null;
      touchId = null;
      pointerId = null;
    };

    const onTargetChange = () => {
      if (!session) return;
      if (readTouchPlaySlot() !== sessionSlot) endTouch(false);
    };

    // Fingers use touch events. Phones often pointercancel the gesture as soon
    // as the finger moves (scroll, fullscreen), which was dropping the stick.
    const onTouchStart = (event: TouchEvent) => {
      window.dispatchEvent(new Event(TOUCH_GESTURE_EVENT));
      if (isStickBlockedTarget(event.target) || session) return;
      const touch = event.changedTouches.item(0);
      if (!touch || !begin(touch.clientX, touch.clientY)) return;
      touchId = touch.identifier;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!session || touchId == null) return;
      const touch = touchById(event.touches, touchId);
      if (!touch) return;
      session.move(touch.clientX, touch.clientY);
      event.preventDefault();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!session || touchId == null) return;
      if (touchById(event.touches, touchId)) return;
      endTouch(true);
    };

    const onTouchCancel = (event: TouchEvent) => {
      if (!session || touchId == null) return;
      if (touchById(event.touches, touchId)) return;
      endTouch(false);
    };

    // Pens don't emit touch events. A finger's pointer stream is ignored so a
    // pointercancel cannot end the stick while the touch is still down.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (event.pointerType === 'mouse' && !mouseSteers) return;
      if (event.button !== 0 || session) return;
      window.dispatchEvent(new Event(TOUCH_GESTURE_EVENT));
      if (isStickBlockedTarget(event.target)) return;
      if (!begin(event.clientX, event.clientY)) return;
      pointerId = event.pointerId;
      const target = event.target;
      if (target instanceof Element) {
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // The pointer can already be gone on some phones.
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== pointerId) return;
      session.move(event.clientX, event.clientY);
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      endTouch(true);
    };

    document.addEventListener('touchstart', onTouchStart, {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchmove', onTouchMove, {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchend', onTouchEnd, true);
    document.addEventListener('touchcancel', onTouchCancel, true);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener(TOUCH_PLAY_TARGET_EVENT, onTargetChange);
    return () => {
      session?.cancel();
      window.removeEventListener(TOUCH_PLAY_TARGET_EVENT, onTargetChange);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchCancel, true);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [mode, puckRef, ringRef]);
}

/**
 * Touch phones, finger steering. Landscape: 16:9 stage, stick anywhere.
 * Portrait: board pinned to the top, the free area below is the stick pad
 * (a finger can still steer from anywhere that isn't a button).
 */
export function TouchMatchFrame({ children }: { children: ReactNode }) {
  const mode = useTouchMatchMode();
  const ringRef = useRef<HTMLDivElement>(null);
  const puckRef = useRef<HTMLDivElement>(null);
  useStickPointer(mode, ringRef, puckRef);

  useEffect(() => {
    if (mode === 'off') return;
    document.body.classList.add('touch-match-active', `touch-match-${mode}`);
    return () =>
      document.body.classList.remove(
        'touch-match-active',
        `touch-match-${mode}`
      );
  }, [mode]);

  if (mode === 'off') return children;

  const stick = (
    <div className="touch-stick" ref={ringRef} aria-hidden>
      <div className="touch-stick__puck" ref={puckRef} />
    </div>
  );

  if (mode === 'portrait') {
    return (
      <div className="touch-match-root touch-match-root--portrait">
        <div className="touch-match-frame touch-match-frame--portrait">
          {children}
        </div>
        <div className="touch-pad" aria-hidden>
          <div className="touch-pad__hint">
            <span className="touch-pad__ring" />
            <span className="touch-pad__label">
              Drag to steer · tap to start
            </span>
          </div>
        </div>
        {stick}
      </div>
    );
  }

  return (
    <div className="touch-match-root">
      <div className="touch-match-frame touch-match-frame--on">{children}</div>
      {stick}
    </div>
  );
}
