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
    let p1FacePressed = false;
    let p1UpPressed = false;
    let p1DownPressed = false;
    let p1LeftPressed = false;
    let p1RightPressed = false;
    let p2FacePressed = false;
    let p2UpPressed = false;
    let p2DownPressed = false;
    let p2LeftPressed = false;
    let p2RightPressed = false;

    const dispatchKeyDown = (key: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    };

    const dispatchKeyUp = (key: string) => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    };

    const dispatchKeyByCode = (type: 'keydown' | 'keyup', code: string) => {
      window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    };

    const pollGamepads = () => {
      const gamepads = navigator.getGamepads();
      if (gamepad1 === null && gamepads[0]) {
        gamepad1 = gamepads[0];
      }
      if (gamepad2 === null && gamepads[1]) {
        gamepad2 = gamepads[1];
      }

      gamepad1 = gamepads[0] || null;
      gamepad2 = gamepads[1] || null;

      if (gamepad1) {
        // L1/L2 (bumpers) – expand QR code for Player 1 (ControlLeft), matching legacy
        const expandP1 = gamepad1.buttons[6]?.pressed || gamepad1.buttons[7]?.pressed;
        if (expandP1 && !l1l2Pressed) {
          dispatchKeyByCode('keydown', 'ControlLeft');
          l1l2Pressed = true;
        } else if (!expandP1 && l1l2Pressed) {
          dispatchKeyByCode('keyup', 'ControlLeft');
          l1l2Pressed = false;
        }

        // Face buttons (A, B, X, Y) - dispatch Space only on press edge.
        const nextP1FacePressed =
          gamepad1.buttons[0]?.pressed ||
          gamepad1.buttons[1]?.pressed ||
          gamepad1.buttons[2]?.pressed ||
          gamepad1.buttons[3]?.pressed;
        if (nextP1FacePressed && !p1FacePressed) {
          dispatchKeyDown(' ');
        }
        p1FacePressed = nextP1FacePressed;

        // D-pad + joystick directions, edge-triggered to avoid event spam.
        const nextP1UpPressed = gamepad1.buttons[12]?.pressed || gamepad1.axes[1] < -0.6;
        if (nextP1UpPressed && !p1UpPressed) {
          dispatchKeyDown('w');
        } else if (!nextP1UpPressed && p1UpPressed) {
          dispatchKeyUp('w');
        }
        p1UpPressed = nextP1UpPressed;

        const nextP1DownPressed = gamepad1.buttons[13]?.pressed || gamepad1.axes[1] > 0.6;
        if (nextP1DownPressed && !p1DownPressed) {
          dispatchKeyDown('s');
        } else if (!nextP1DownPressed && p1DownPressed) {
          dispatchKeyUp('s');
        }
        p1DownPressed = nextP1DownPressed;

        const nextP1LeftPressed = gamepad1.buttons[14]?.pressed || gamepad1.axes[0] < -0.6;
        if (nextP1LeftPressed && !p1LeftPressed) {
          dispatchKeyDown('a');
        } else if (!nextP1LeftPressed && p1LeftPressed) {
          dispatchKeyUp('a');
        }
        p1LeftPressed = nextP1LeftPressed;

        const nextP1RightPressed = gamepad1.buttons[15]?.pressed || gamepad1.axes[0] > 0.6;
        if (nextP1RightPressed && !p1RightPressed) {
          dispatchKeyDown('d');
        } else if (!nextP1RightPressed && p1RightPressed) {
          dispatchKeyUp('d');
        }
        p1RightPressed = nextP1RightPressed;
      } else {
        if (l1l2Pressed) {
          dispatchKeyByCode('keyup', 'ControlLeft');
          l1l2Pressed = false;
        }
        if (p1UpPressed) dispatchKeyUp('w');
        if (p1DownPressed) dispatchKeyUp('s');
        if (p1LeftPressed) dispatchKeyUp('a');
        if (p1RightPressed) dispatchKeyUp('d');
        p1FacePressed = false;
        p1UpPressed = false;
        p1DownPressed = false;
        p1LeftPressed = false;
        p1RightPressed = false;
      }

      if (gamepad2) {
        const nextP2FacePressed =
          gamepad2.buttons[0]?.pressed ||
          gamepad2.buttons[1]?.pressed ||
          gamepad2.buttons[2]?.pressed ||
          gamepad2.buttons[3]?.pressed;
        if (nextP2FacePressed && !p2FacePressed) {
          dispatchKeyDown('Enter');
        }
        p2FacePressed = nextP2FacePressed;

        const nextP2UpPressed = gamepad2.buttons[12]?.pressed || gamepad2.axes[1] < -0.6;
        if (nextP2UpPressed && !p2UpPressed) {
          dispatchKeyDown('ArrowUp');
        } else if (!nextP2UpPressed && p2UpPressed) {
          dispatchKeyUp('ArrowUp');
        }
        p2UpPressed = nextP2UpPressed;

        const nextP2DownPressed = gamepad2.buttons[13]?.pressed || gamepad2.axes[1] > 0.6;
        if (nextP2DownPressed && !p2DownPressed) {
          dispatchKeyDown('ArrowDown');
        } else if (!nextP2DownPressed && p2DownPressed) {
          dispatchKeyUp('ArrowDown');
        }
        p2DownPressed = nextP2DownPressed;

        const nextP2LeftPressed = gamepad2.buttons[14]?.pressed || gamepad2.axes[0] < -0.6;
        if (nextP2LeftPressed && !p2LeftPressed) {
          dispatchKeyDown('ArrowLeft');
        } else if (!nextP2LeftPressed && p2LeftPressed) {
          dispatchKeyUp('ArrowLeft');
        }
        p2LeftPressed = nextP2LeftPressed;

        const nextP2RightPressed = gamepad2.buttons[15]?.pressed || gamepad2.axes[0] > 0.6;
        if (nextP2RightPressed && !p2RightPressed) {
          dispatchKeyDown('ArrowRight');
        } else if (!nextP2RightPressed && p2RightPressed) {
          dispatchKeyUp('ArrowRight');
        }
        p2RightPressed = nextP2RightPressed;
      } else {
        if (p2UpPressed) dispatchKeyUp('ArrowUp');
        if (p2DownPressed) dispatchKeyUp('ArrowDown');
        if (p2LeftPressed) dispatchKeyUp('ArrowLeft');
        if (p2RightPressed) dispatchKeyUp('ArrowRight');
        p2FacePressed = false;
        p2UpPressed = false;
        p2DownPressed = false;
        p2LeftPressed = false;
        p2RightPressed = false;
      }

      // Gamepad 2 – expand QR for Player 2 (ControlRight), matching legacy
      if (gamepad2?.buttons[6] !== undefined && gamepad2?.buttons[7] !== undefined) {
        const expandP2 = gamepad2.buttons[6].pressed || gamepad2.buttons[7].pressed;
        if (expandP2 && !l1l2PressedP2) {
          dispatchKeyByCode('keydown', 'ControlRight');
          l1l2PressedP2 = true;
        } else if (!expandP2 && l1l2PressedP2) {
          dispatchKeyByCode('keyup', 'ControlRight');
          l1l2PressedP2 = false;
        }
      } else if (l1l2PressedP2) {
        dispatchKeyByCode('keyup', 'ControlRight');
        l1l2PressedP2 = false;
      }
    };

    // Poll at 60Hz for responsive gamepad input without RAF recursion.
    const intervalId = setInterval(pollGamepads, 1000 / 60);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled]);
}
