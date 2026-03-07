import { useEffect } from 'react';

/**
 * Hook for gamepad support
 * Polls gamepad state and dispatches keyboard events (matching legacy behavior)
 */
export function useGamepad(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    let gamepad1: Gamepad | null = null;
    let animationFrameId: number;

    const pollGamepads = () => {
      // Get gamepad if not already connected
      if (gamepad1 === null) {
        const gamepads = navigator.getGamepads();
        if (gamepads[0]) {
          console.log('Gamepad 1 connected');
          gamepad1 = gamepads[0];
        }
      }

      // Update gamepad reference
      if (gamepad1 !== null) {
        const gamepads = navigator.getGamepads();
        gamepad1 = gamepads[0] || null;

        if (gamepad1) {
          // Face buttons (A, B, X, Y) - dispatch Space
          if (
            gamepad1.buttons[0]?.pressed ||
            gamepad1.buttons[1]?.pressed ||
            gamepad1.buttons[2]?.pressed ||
            gamepad1.buttons[3]?.pressed
          ) {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: ' ', bubbles: true })
            );
          }

          // D-pad buttons
          if (gamepad1.buttons[12]?.pressed) {
            // Up
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'w', bubbles: true })
            );
          }
          if (gamepad1.buttons[13]?.pressed) {
            // Down
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 's', bubbles: true })
            );
          }
          if (gamepad1.buttons[14]?.pressed) {
            // Left
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'a', bubbles: true })
            );
          }
          if (gamepad1.buttons[15]?.pressed) {
            // Right
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'd', bubbles: true })
            );
          }

          // Joystick (axes)
          if (gamepad1.axes[1] < -0.6) {
            // Up
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'w', bubbles: true })
            );
          }
          if (gamepad1.axes[1] > 0.6) {
            // Down
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 's', bubbles: true })
            );
          }
          if (gamepad1.axes[0] < -0.6) {
            // Left
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'a', bubbles: true })
            );
          }
          if (gamepad1.axes[0] > 0.6) {
            // Right
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'd', bubbles: true })
            );
          }
        }
      }

      animationFrameId = requestAnimationFrame(pollGamepads);
    };

    // Start polling at ~10fps (matching legacy)
    const intervalId = setInterval(pollGamepads, 1000 / 10);

    return () => {
      clearInterval(intervalId);
      cancelAnimationFrame(animationFrameId);
    };
  }, [enabled]);
}
