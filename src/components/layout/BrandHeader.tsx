import './BrandHeader.css';

/** CHAIN … DUEL wordmark pinned to the top corners of every page. */
export function BrandHeader({
  className,
  embedded = false,
}: {
  className?: string;
  /** In-flow copy. Skips the page ids so it can sit inside a dialog. */
  embedded?: boolean;
}) {
  return (
    <header
      id={embedded ? undefined : 'brand'}
      className={['brand-header', className].filter(Boolean).join(' ')}
    >
      <h2 id={embedded ? undefined : 'chain'}>CHAIN</h2>
      <h2 id={embedded ? undefined : 'duel'}>DUEL</h2>
    </header>
  );
}
