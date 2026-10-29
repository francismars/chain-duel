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
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { glowing, variant, size, block, className = '', style, type, ...props },
    ref
  ) => {
    const animationStyle =
      glowing === true
        ? { ...style, animation: 'glowing 2000ms infinite' as const }
        : (style ?? undefined);

    return (
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
  }
);

Button.displayName = 'Button';
