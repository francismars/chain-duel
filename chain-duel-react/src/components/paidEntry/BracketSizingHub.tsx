import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { P2pNavFocus } from '@/pages/p2pEntryNav';

const PLAYER_OPTIONS = [
  { n: 4 as const, label: '4', desc: 'Small' },
  { n: 8 as const, label: '8', desc: 'Mid' },
  { n: 16 as const, label: '16', desc: 'Full' },
];

export const BUYIN_STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) * 10000);

const BUYIN_SCROLL_ID = 'bracket-sizing-buyin-scroll';

export type BracketSizingHubHandle = {
  focusPlayer: (i: number) => void;
  focusBuyinPrev: () => void;
  focusBuyinPill: (i: number) => void;
  focusBuyinNext: () => void;
  triggerPlayer: (i: number) => void;
  triggerBuyinPill: (i: number) => void;
  triggerBuyinPrev: () => void;
  triggerBuyinNext: () => void;
};

export interface BracketSizingHubProps {
  playersNumber: number;
  deposit: number;
  onPlayersChange: (n: 4 | 8 | 16) => void;
  onDepositChange: (sats: number) => void;
  playSelect: () => void;
  /** Keyboard/gamepad highlight (P2P entry). */
  menuFocus?: P2pNavFocus | null;
  /** Keep nav model in sync when using mouse / second gamepad. */
  onMenuFocus?: (f: P2pNavFocus) => void;
}

function bracketFocusClass(
  menuFocus: P2pNavFocus | null | undefined,
  match: (f: P2pNavFocus) => boolean
): string {
  return menuFocus && match(menuFocus) ? ' bracket-sizing-hub__focus-target' : '';
}

export const BracketSizingHub = forwardRef<BracketSizingHubHandle, BracketSizingHubProps>(
  function BracketSizingHub(
    {
      playersNumber,
      deposit,
      onPlayersChange,
      onDepositChange,
      playSelect,
      menuFocus,
      onMenuFocus,
    },
    ref
  ) {
    const buyinScrollRef = useRef<HTMLDivElement>(null);
    const playerRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const buyinPrevRef = useRef<HTMLButtonElement | null>(null);
    const buyinNextRef = useRef<HTMLButtonElement | null>(null);

    const [buyinCanPrev, setBuyinCanPrev] = useState(false);
    const [buyinCanNext, setBuyinCanNext] = useState(false);

    const syncBuyinScrollNav = useCallback(() => {
      const el = buyinScrollRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const eps = 3;
      setBuyinCanPrev(scrollLeft > eps);
      setBuyinCanNext(scrollLeft + clientWidth < scrollWidth - eps);
    }, []);

    const scrollBuyin = useCallback((dir: -1 | 1) => {
      const el = buyinScrollRef.current;
      if (!el) return;
      const step = Math.max(Math.floor(el.clientWidth * 0.55), 96);
      el.scrollBy({ left: dir * step, behavior: 'smooth' });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focusPlayer: (i: number) => {
          playerRefs.current[i]?.focus();
        },
        focusBuyinPrev: () => {
          buyinPrevRef.current?.focus();
        },
        focusBuyinPill: (i: number) => {
          pillRefs.current[i]?.focus();
        },
        focusBuyinNext: () => {
          buyinNextRef.current?.focus();
        },
        triggerPlayer: (i: number) => {
          const n = PLAYER_OPTIONS[i]?.n;
          if (n === undefined) return;
          playSelect();
          onPlayersChange(n);
        },
        triggerBuyinPill: (i: number) => {
          const sats = BUYIN_STEPS[i];
          if (sats === undefined) return;
          playSelect();
          onDepositChange(sats);
        },
        triggerBuyinPrev: () => {
          if (!buyinCanPrev) return;
          playSelect();
          scrollBuyin(-1);
        },
        triggerBuyinNext: () => {
          if (!buyinCanNext) return;
          playSelect();
          scrollBuyin(1);
        },
      }),
      [
        buyinCanNext,
        buyinCanPrev,
        onDepositChange,
        onPlayersChange,
        playSelect,
        scrollBuyin,
      ]
    );

    useLayoutEffect(() => {
      const el = buyinScrollRef.current;
      if (!el) return;
      syncBuyinScrollNav();
      const ro = new ResizeObserver(() => syncBuyinScrollNav());
      ro.observe(el);
      return () => ro.disconnect();
    }, [syncBuyinScrollNav]);

    useEffect(() => {
      const el = buyinScrollRef.current;
      if (!el) return;
      const active = el.querySelector<HTMLElement>('.bracket-sizing-hub__pill.active');
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      requestAnimationFrame(() => syncBuyinScrollNav());
    }, [deposit, syncBuyinScrollNav]);

    return (
      <div className="bracket-sizing-hub">
        <p className="bracket-sizing-hub__lede">
          Field size and per-seat minimum — same ladder as tournament prefs.
        </p>

        <div className="bracket-sizing-hub__row-label">Players</div>
        <div className="bracket-sizing-hub__players-row" role="group" aria-label="Player count">
          {PLAYER_OPTIONS.map(({ n, label, desc }, i) => (
            <button
              key={n}
              ref={(el) => {
                playerRefs.current[i] = el;
              }}
              type="button"
              tabIndex={-1}
              className={`bracket-sizing-hub__player-card ${playersNumber === n ? 'active' : ''}${bracketFocusClass(menuFocus ?? null, (f) => f.kind === 'players' && f.idx === i)}`}
              onClick={() => {
                onMenuFocus?.({ kind: 'players', idx: i as 0 | 1 | 2 });
                playSelect();
                onPlayersChange(n);
              }}
            >
              <span className="bracket-sizing-hub__player-num condensed">{label}</span>
              <span className="bracket-sizing-hub__player-meta">
                <span className="bracket-sizing-hub__player-unit">pl</span>
                <span className="bracket-sizing-hub__player-desc">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="bracket-sizing-hub__row-label">Buy-in (sats)</div>
        <div className="bracket-sizing-hub__buyin-strip" role="group" aria-label="Buy-in in sats">
          <button
            ref={buyinPrevRef}
            type="button"
            tabIndex={-1}
            className={`bracket-sizing-hub__buyin-nav${bracketFocusClass(menuFocus ?? null, (f) => f.kind === 'buyinPrev')}`}
            aria-label="Scroll to lower buy-in amounts"
            aria-controls={BUYIN_SCROLL_ID}
            disabled={!buyinCanPrev}
            onClick={() => {
              onMenuFocus?.({ kind: 'buyinPrev' });
              playSelect();
              scrollBuyin(-1);
            }}
          >
            ‹
          </button>
          <div
            ref={buyinScrollRef}
            id={BUYIN_SCROLL_ID}
            className="bracket-sizing-hub__buyin-scroll"
            onScroll={syncBuyinScrollNav}
          >
            {BUYIN_STEPS.map((sats, i) => {
              const active = deposit === sats;
              const short = `${sats / 1000}k`;
              return (
                <button
                  key={sats}
                  ref={(el) => {
                    pillRefs.current[i] = el;
                  }}
                  type="button"
                  tabIndex={-1}
                  className={`bracket-sizing-hub__pill ${active ? 'active' : ''}${bracketFocusClass(menuFocus ?? null, (f) => f.kind === 'buyinPill' && f.idx === i)}`}
                  onClick={() => {
                    onMenuFocus?.({ kind: 'buyinPill', idx: i });
                    playSelect();
                    onDepositChange(sats);
                  }}
                >
                  {short}
                </button>
              );
            })}
          </div>
          <button
            ref={buyinNextRef}
            type="button"
            tabIndex={-1}
            className={`bracket-sizing-hub__buyin-nav${bracketFocusClass(menuFocus ?? null, (f) => f.kind === 'buyinNext')}`}
            aria-label="Scroll to higher buy-in amounts"
            aria-controls={BUYIN_SCROLL_ID}
            disabled={!buyinCanNext}
            onClick={() => {
              onMenuFocus?.({ kind: 'buyinNext' });
              playSelect();
              scrollBuyin(1);
            }}
          >
            ›
          </button>
        </div>

        <div className="bracket-sizing-hub__readout" aria-live="polite">
          <span className="bracket-sizing-hub__readout-inner">
            {playersNumber} players · {deposit.toLocaleString()} sats
          </span>
        </div>
      </div>
    );
  }
);
