import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  glowing?: boolean;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ glowing, className = '', style, ...props }, ref) => {
    const animationStyle =
      glowing === true
        ? { ...style, animation: 'glowing 2000ms infinite' as const }
        : style ?? undefined;

    return (
      <button
        ref={ref}
        className={`button ${className}`}
        style={animationStyle}
        {...props}
      >
        {props.children}
      </button>
    );
  }
);

Button.displayName = 'Button';
