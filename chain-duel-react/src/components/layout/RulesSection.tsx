/**
 * Shared rules for Practice and P2P setup.
 * Classic cards stay on the live menu. The clip slider is the preview treatment.
 */
import { useEffect, useState } from 'react';
import { RuleClip, type RuleClipId } from './RuleClip';

const RULES: Array<{
  id: RuleClipId;
  kicker: string;
  title: string;
  text: string;
}> = [
  {
    id: 'stake',
    kicker: 'Rule 1',
    title: 'Stake your sats',
    text: 'Deposit your sats and play until one chain hits zero. Double or nothing raises the stakes, and the winner takes all.',
  },
  {
    id: 'chain',
    kicker: 'Rule 2',
    title: 'Longer chains collect more sats',
    text: 'Capture coinbases to grow your chain and collect more value. A longer chain takes a larger share of the sats.',
  },
  {
    id: 'reset',
    kicker: 'Rule 3',
    title: 'Reset/respawn',
    text: 'Hitting a wall or the other chain resets you to genesis. A head-to-head collision resets both chains at once.',
  },
  {
    id: 'block',
    kicker: 'Rule 4',
    title: 'New block, new reward',
    text: 'When a new Bitcoin block is found, the board flashes and a special reward appears. A block with big fees pays more than one with small fees.',
  },
];

type RulesFocus = 'prev' | 'next' | 'close';

export function RulesSection({
  variant = 'classic',
  onTitleChange,
  onClose,
}: {
  variant?: 'classic' | 'clips';
  onTitleChange?: (title: { kicker: string; title: string }) => void;
  onClose?: () => void;
}) {
  if (variant === 'classic') return <ClassicRules />;
  return <ClipRules onTitleChange={onTitleChange} onClose={onClose} />;
}

function ClipRules({
  onTitleChange,
  onClose,
}: {
  onTitleChange?: (title: { kicker: string; title: string }) => void;
  onClose?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState<RulesFocus>('next');
  const rule = RULES[index] ?? RULES[0];
  const prev = () =>
    setIndex((current) => (current - 1 + RULES.length) % RULES.length);
  const next = () => setIndex((current) => (current + 1) % RULES.length);

  useEffect(() => {
    onTitleChange?.({ kicker: rule.kicker, title: rule.title });
  }, [onTitleChange, rule.kicker, rule.title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!document.querySelector('.rules-modal') || !onClose) return;
      const left =
        event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A';
      const right =
        event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D';
      const up =
        event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W';
      const down =
        event.key === 'ArrowDown' || event.key === 's' || event.key === 'S';
      const confirm = event.key === 'Enter' || event.key === ' ';
      if (!left && !right && !up && !down && !confirm) return;
      if (confirm && event.repeat) return;
      event.preventDefault();
      if (left) setFocus('prev');
      if (right) setFocus('next');
      if (down) setFocus('close');
      if (up && focus === 'close') setFocus('prev');
      if (confirm) {
        if (focus === 'prev') prev();
        if (focus === 'next') next();
        if (focus === 'close') onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, onClose]);

  return (
    <div id="centerSection" className="rules-slider">
      <div className="rules-slider__card">
        <RuleClip key={rule.id} id={rule.id} />
        {onTitleChange ? null : (
          <p className="ruleTitle">
            {rule.kicker} {rule.title}
          </p>
        )}
        <p className="gameDescription grey">{rule.text}</p>
      </div>
      <div className={onClose ? 'rules-modal__actions' : 'rules-slider__nav'}>
        <div className="rules-slider__nav">
          <button
            type="button"
            className={
              onClose && focus === 'prev'
                ? 'rules-slider__arrow rules-slider__arrow--selected'
                : 'rules-slider__arrow'
            }
            onMouseEnter={() => onClose && setFocus('prev')}
            onClick={() => {
              setFocus('prev');
              prev();
            }}
          >
            Prev
          </button>
          {onClose ? null : (
            <div className="rules-slider__dots" role="tablist">
              {RULES.map((item, dot) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={dot === index}
                  className={
                    dot === index
                      ? 'rules-slider__dot rules-slider__dot--on'
                      : 'rules-slider__dot'
                  }
                  onClick={() => setIndex(dot)}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className={
              onClose && focus === 'next'
                ? 'rules-slider__arrow rules-slider__arrow--selected'
                : 'rules-slider__arrow'
            }
            onMouseEnter={() => onClose && setFocus('next')}
            onClick={() => {
              setFocus('next');
              next();
            }}
          >
            Next
          </button>
        </div>
        {onClose ? (
          <button
            type="button"
            className={
              focus === 'close'
                ? 'rules-modal__close rules-modal__close--selected'
                : 'rules-modal__close'
            }
            onMouseEnter={() => setFocus('close')}
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ClassicRules() {
  return (
    <div id="centerSection">
      <div id="gameCard">
        <p className="ruleTitle">1. Stake your sats</p>
        <p className="gameDescription grey">Deposit your sats, play, redeem.</p>
        <p className="gameDescription grey">
          Cycle ends when one chain hits zero sats.
        </p>
        <p className="gameDescription grey">
          Double or nothing to up the stakes.
        </p>
        <p className="gameDescription grey">Winner takes all!</p>
      </div>
      <div id="gameCard">
        <p className="ruleTitle">2. Longer chains collect more sats</p>
        <p className="gameDescription grey">
          Capture coinbases to grow your chain and collect more value.
        </p>
        <div>
          <table className="gameDescription grey rewards">
            <tbody>
              <tr>
                <td className="reward-blocks">Chain Length</td>
                <td className="reward-percent">
                  <b>Reward</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">2 blocks</td>
                <td className="reward-percent">
                  <b>2%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">3 blocks</td>
                <td className="reward-percent">
                  <b>4%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">5 blocks</td>
                <td className="reward-percent">
                  <b>8%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">8 blocks</td>
                <td className="reward-percent">
                  <b>16%</b>
                </td>
              </tr>
              <tr>
                <td className="reward-blocks">12+ blocks</td>
                <td className="reward-percent">
                  <b>32%</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div id="gameCard">
        <p className="ruleTitle">3. Reset/respawn</p>
        <p className="gameDescription grey">
          Avoid mistakes or risk losing your proof-of-work.
        </p>
        <p className="gameDescription grey">
          Hitting walls or the other chain resets to genesis block.
        </p>
        <p className="gameDescription grey">
          Head-to-head collisions reset both chains.
        </p>
      </div>
    </div>
  );
}
