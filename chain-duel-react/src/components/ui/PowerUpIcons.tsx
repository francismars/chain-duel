/**
 * Shared SVG icon components for each power-up type.
 * Used by both the in-game power-up key and the Power-Up Arena setup page.
 */

interface IconProps {
  className?: string;
  size?: number;
}

export function SurgeSvg({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <polygon points="13,2 7,13 11.5,13 9,22 17,9 12.5,9" fill="#C8881A" />
    </svg>
  );
}

export function FreezeSvg({ className, size = 24 }: IconProps) {
  const arms = [0, 60, 120, 180, 240, 300];
  const cx = 12, cy = 12, r = 8.5, tick = 2.8;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      {arms.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = cx + r * Math.cos(rad);
        const y2 = cy + r * Math.sin(rad);
        const midX = cx + r * 0.55 * Math.cos(rad);
        const midY = cy + r * 0.55 * Math.sin(rad);
        const perpRad = rad + Math.PI / 2;
        return (
          <g key={deg} stroke="#2878A8" strokeWidth="1.5" strokeLinecap="round">
            <line x1={cx} y1={cy} x2={x2} y2={y2} />
            <line
              x1={midX - tick * Math.cos(perpRad)} y1={midY - tick * Math.sin(perpRad)}
              x2={midX + tick * Math.cos(perpRad)} y2={midY + tick * Math.sin(perpRad)}
            />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="1.5" fill="#2878A8" />
    </svg>
  );
}

export function PhantomSvg({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path
        d="M 5 20 C 3 20 3 16 3 12 C 3 7 7 3 12 3 C 17 3 21 7 21 12 C 21 16 21 20 19 20 L 17 17 L 14.5 20 L 12 17 L 9.5 20 L 7 17 Z"
        fill="none"
        stroke="#9898B8"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray="3 2"
      />
      <circle cx="9.5" cy="11" r="1.5" fill="#9898B8" opacity="0.6" />
      <circle cx="14.5" cy="11" r="1.5" fill="#9898B8" opacity="0.6" />
    </svg>
  );
}

export function AnchorSvg({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="12" cy="5.5" r="2.5" fill="none" stroke="#D0D0D0" strokeWidth="1.5" />
      <line x1="12" y1="8" x2="12" y2="20" stroke="#D0D0D0" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="11" x2="18" y2="11" stroke="#D0D0D0" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M 6 20 C 6 16 9 14 12 14 C 15 14 18 16 18 20" fill="none" stroke="#D0D0D0" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function AmplifierSvg({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d="M 7 8 C 10 8 10 16 7 16" fill="none" stroke="#7AAA70" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M 10 5 C 15 5 15 19 10 19" fill="none" stroke="#7AAA70" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <path d="M 13 2 C 20 2 20 22 13 22" fill="none" stroke="#7AAA70" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5" cy="12" r="1.8" fill="#7AAA70" />
    </svg>
  );
}

export function DecoySvg({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.9)" />
      <line x1="7" y1="17" x2="17" y2="7" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ForkSvg({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <line x1="12" y1="21" x2="12" y2="12" stroke="#44EE88" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="12" x2="5" y2="4" stroke="#44EE88" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="12" x2="19" y2="4" stroke="#44EE88" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="#44EE88" />
      <circle cx="5" cy="4" r="1.5" fill="#44EE88" opacity="0.7" />
      <circle cx="19" cy="4" r="1.5" fill="#44EE88" opacity="0.7" />
    </svg>
  );
}

/** Map from power-up type string → its icon component (at a given size). */
export function PowerUpIcon({ type, size = 24, className }: { type: string; size?: number; className?: string }) {
  const props = { size, className };
  switch (type) {
    case 'SURGE':     return <SurgeSvg {...props} />;
    case 'FREEZE':    return <FreezeSvg {...props} />;
    case 'PHANTOM':   return <PhantomSvg {...props} />;
    case 'ANCHOR':    return <AnchorSvg {...props} />;
    case 'AMPLIFIER': return <AmplifierSvg {...props} />;
    case 'DECOY':     return <DecoySvg {...props} />;
    case 'FORK':      return <ForkSvg {...props} />;
    default:          return null;
  }
}
