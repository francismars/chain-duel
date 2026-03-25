import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import type { P2pNavFocus } from '@/pages/p2pEntryNav';

const PLAYER_OPTIONS = [
  { n: 4 as const, label: '4P' },
  { n: 8 as const, label: '8P' },
  { n: 16 as const, label: '16P' },
];

export const BUYIN_STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) * 10000);

export type BracketSizingHubHandle = {
  focusPlayer: (i: number) => void;
  focusBuyinPill: (i: number) => void;
  triggerPlayer: (i: number) => void;
  triggerBuyinPill: (i: number) => void;
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
    const playerRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useImperativeHandle(
      ref,
      () => ({
        focusPlayer: (i: number) => {
          playerRefs.current[i]?.focus();
        },
        focusBuyinPill: (i: number) => {
          pillRefs.current[i]?.focus();
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
      }),
      [onDepositChange, onPlayersChange, playSelect]
    );

    return (
      <div className="bracket-sizing-hub">
        <div className="bracket-sizing-hub__two-col">
          <div className="bracket-sizing-hub__col bracket-sizing-hub__col--players">
            <div className="bracket-sizing-hub__row-label">Players</div>
            <div className="bracket-sizing-hub__players-col" role="group" aria-label="Player count">
              {PLAYER_OPTIONS.map(({ n, label }, i) => (
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
                  <span className="bracket-sizing-hub__player-num">{label}</span>
                </button>
              ))}
              <button
                type="button"
                tabIndex={-1}
                disabled
                aria-disabled="true"
                className="bracket-sizing-hub__player-card bracket-sizing-hub__player-card--soon"
              >
                <span className="bracket-sizing-hub__player-num">32P</span>
              </button>
            </div>
          </div>

          <div className="bracket-sizing-hub__col bracket-sizing-hub__col--buyin">
            <div className="bracket-sizing-hub__row-label">Buy-in (sats)</div>
            <div className="bracket-sizing-hub__buyin-grid" role="group" aria-label="Buy-in in sats">
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
                      {sats / 1000}K
                    </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
