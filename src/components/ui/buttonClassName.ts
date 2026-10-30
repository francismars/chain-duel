export type ButtonVariant =
  /** Outlined, white — the default menu action. */
  | 'primary'
  /** Dimmer outline for back / cancel / secondary actions. */
  | 'secondary'
  /** No box; inline link-style action. */
  | 'text'
  /** Square icon-only control (close, arrows, corner toggles). */
  | 'icon'
  /** Page paints its own colours (e.g. online post-game gradients); size still shared. */
  | 'custom';

export type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  block = false,
  glowing = false,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  glowing?: boolean;
  className?: string;
}): string {
  return [
    'button',
    variant !== 'primary' && `button--${variant}`,
    size !== 'md' && `button--${size}`,
    block && 'button--block',
    glowing && 'button--glow-active',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
