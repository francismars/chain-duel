import React from 'react';
import './Button.css';
import {
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from './buttonClassName';

export type { ButtonSize, ButtonVariant };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  glowing?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width instead of the shared --btn-w. */
  block?: boolean;
  /** Extra detail shown on hover and keyboard focus. Fades out after 5 seconds. */
  tooltip?: string;
  children: React.ReactNode;
}

const TOOLTIP_VISIBLE_MS = 5000;

function ButtonTip({
  tooltip,
  children,
}: {
  tooltip: string;
  children: React.ReactNode;
}) {
  const [expired, setExpired] = React.useState(false);
  const expiredRef = React.useRef(false);
  const timer = React.useRef<number | null>(null);

  const markExpired = (value: boolean) => {
    expiredRef.current = value;
    setExpired(value);
  };

  const clearTimer = () => {
    if (timer.current == null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  };

  React.useEffect(() => clearTimer, []);

  const arm = (event: React.SyntheticEvent<HTMLSpanElement>) => {
    // A click focuses the button. Don't bring the tip back if it already faded while the pointer stayed.
    if (
      event.type === 'focus' &&
      expiredRef.current &&
      event.currentTarget.matches(':hover')
    ) {
      return;
    }
    markExpired(false);
    clearTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      markExpired(true);
    }, TOOLTIP_VISIBLE_MS);
  };

  const release = (event: React.SyntheticEvent<HTMLSpanElement>) => {
    const next = (event.nativeEvent as MouseEvent | FocusEvent).relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    clearTimer();
    markExpired(false);
  };

  return (
    <span
      className={expired ? 'button-tip button-tip--expired' : 'button-tip'}
      onPointerEnter={arm}
      onPointerLeave={release}
      onFocus={arm}
      onBlur={release}
    >
      {children}
      <span className="button-tip__bubble" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      glowing,
      variant,
      size,
      block,
      tooltip,
      className = '',
      style,
      type,
      ...props
    },
    ref
  ) => {
    const animationStyle =
      glowing === true
        ? { ...style, animation: 'glowing 2000ms infinite' as const }
        : (style ?? undefined);

    const button = (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={buttonClassName({
          variant,
          size,
          block,
          glowing,
          className,
        })}
        style={animationStyle}
        {...props}
      >
        {props.children}
      </button>
    );

    if (!tooltip) return button;

    return <ButtonTip tooltip={tooltip}>{button}</ButtonTip>;
  }
);

Button.displayName = 'Button';
