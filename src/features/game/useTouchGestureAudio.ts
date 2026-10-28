import { useEffect, type MutableRefObject } from 'react';
import { TOUCH_GESTURE_EVENT } from '@/features/game/touchStick';

/** Retry game audio inside the touch that unlocked the phone's media policy. */
export function useTouchGestureAudio(
  audioRef: MutableRefObject<{ resumeFromGesture: () => void } | null>
): void {
  useEffect(() => {
    const onGesture = () => audioRef.current?.resumeFromGesture();
    window.addEventListener(TOUCH_GESTURE_EVENT, onGesture);
    return () => window.removeEventListener(TOUCH_GESTURE_EVENT, onGesture);
  }, [audioRef]);
}
