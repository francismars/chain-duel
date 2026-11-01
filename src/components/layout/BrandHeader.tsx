import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const headerRef = useRef<HTMLElement>(null);
  const [portaled, setPortaled] = useState(false);

  useLayoutEffect(() => {
    if (embedded || portaled) return;
    const node = headerRef.current;
    // The 16:9 touch stage is a size container, which would pin this
    // fixed header to the stage instead of the screen edges.
    if (node?.closest('.touch-match-frame, .touch-match-root')) {
      setPortaled(true);
    }
  }, [embedded, portaled]);

  const header = (
    <header
      id={embedded ? undefined : 'brand'}
      ref={headerRef}
      className={['brand-header', className].filter(Boolean).join(' ')}
    >
      <h2 id={embedded ? undefined : 'chain'}>CHAIN</h2>
      <h2 id={embedded ? undefined : 'duel'}>DUEL</h2>
    </header>
  );

  if (portaled) return createPortal(header, document.body);
  return header;
}
