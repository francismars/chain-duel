import { useEffect } from 'react';

/**
 * Hook for gamepad support
 * Polls gamepad state and dispatches keyboard events (matching legacy behavior)
 */
export function useGamepad(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    let gamepad1: Gamepad | null = null;
    let gamepad2: Gamepad | null = null;
    let l1l2Pressed = false; // L1/L2 (buttons 6, 7) for expand QR – gamepad 1
    let l1l2PressedP2 = false; // gamepad 2
    let animationFrameId: number;

    const pollGamepads = () => {
      const gamepads = navigator.getGamepads();
      if (gamepad1 === null && gamepads[0]) {
        console.log('Gamepad 1 connected');
        gamepad1 = gamepads[0];
      }
      if (gamepad2 === null && gamepads[1]) {
        console.log('Gamepad 2 connected');
        gamepad2 = gamepads[1];
      }

      gamepad1 = gamepads[0] || null;
      gamepad2 = gamepads[1] || null;

      if (gamepad1) {
        // L1/L2 (bumpers) – expand QR code for Player 1 (ControlLeft), matching legacy
        const expandP1 = gamepad1.buttons[6]?.pressed || gamepad1.buttons[7]?.pressed;
        if (expandP1 && !l1l2Pressed) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', bubbles: true }));
          l1l2Pressed = true;
        } else if (!expandP1 && l1l2Pressed) {
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft', bubbles: true }));
          l1l2Pressed = false;
        }

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
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'w', bubbles: true })
          );
        }
        if (gamepad1.buttons[13]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 's', bubbles: true })
          );
        }
        if (gamepad1.buttons[14]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'a', bubbles: true })
          );
        }
        if (gamepad1.buttons[15]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'd', bubbles: true })
          );
        }

        // Joystick (axes)
        if (gamepad1.axes[1] < -0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'w', bubbles: true })
          );
        }
        if (gamepad1.axes[1] > 0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 's', bubbles: true })
          );
        }
        if (gamepad1.axes[0] < -0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'a', bubbles: true })
          );
        }
        if (gamepad1.axes[0] > 0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'd', bubbles: true })
          );
        }
      } else {
        if (l1l2Pressed) {
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft', bubbles: true }));
          l1l2Pressed = false;
        }
      }

      if (gamepad2) {
        if (
          gamepad2.buttons[0]?.pressed ||
          gamepad2.buttons[1]?.pressed ||
          gamepad2.buttons[2]?.pressed ||
          gamepad2.buttons[3]?.pressed
        ) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
          );
        }

        if (gamepad2.buttons[12]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
          );
        }
        if (gamepad2.buttons[13]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
          );
        }
        if (gamepad2.buttons[14]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
          );
        }
        if (gamepad2.buttons[15]?.pressed) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
          );
        }

        if (gamepad2.axes[1] < -0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
          );
        }
        if (gamepad2.axes[1] > 0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
          );
        }
        if (gamepad2.axes[0] < -0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
          );
        }
        if (gamepad2.axes[0] > 0.6) {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
          );
        }
      }

      // Gamepad 2 – expand QR for Player 2 (ControlRight), matching legacy
      if (gamepad2?.buttons[6] !== undefined && gamepad2?.buttons[7] !== undefined) {
        const expandP2 = gamepad2.buttons[6].pressed || gamepad2.buttons[7].pressed;
        if (expandP2 && !l1l2PressedP2) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlRight', bubbles: true }));
          l1l2PressedP2 = true;
        } else if (!expandP2 && l1l2PressedP2) {
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlRight', bubbles: true }));
          l1l2PressedP2 = false;
        }
      } else if (l1l2PressedP2) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlRight', bubbles: true }));
        l1l2PressedP2 = false;
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
