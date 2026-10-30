import './BrandHeader.css';

/** CHAIN … DUEL wordmark pinned to the top corners of every page. */
export function BrandHeader({ className }: { className?: string }) {
  return (
    <header
      id="brand"
      className={['brand-header', className].filter(Boolean).join(' ')}
    >
      <h2 id="chain">CHAIN</h2>
      <h2 id="duel">DUEL</h2>
    </header>
  );
}
