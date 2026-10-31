/**
 * Shared rules for Practice and P2P setup.
 * Classic cards stay on the live menu. The clip slider is the preview treatment.
 */
import { useEffect, useRef, useState } from 'react';
import { RuleClip, type RuleClipId } from './RuleClip';
import { Button } from '@/components/ui/Button';

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
type SlideDir = 'next' | 'prev';
type SlidePhase = 'idle' | 'hide' | 'show';

const SLIDE_HIDE_MS = 300;

export function RulesSection({
  variant = 'classic',
  onTitleChange,
  onClose,
  autoplay = false,
}: {
  variant?: 'classic' | 'clips';
  onTitleChange?: (title: {
    kicker: string;
    title: string;
    phase: SlidePhase;
    dir: SlideDir;
  }) => void;
  onClose?: () => void;
  autoplay?: boolean;
}) {
  if (variant === 'classic') return <ClassicRules />;
  return (
    <ClipRules
      onTitleChange={onTitleChange}
      onClose={onClose}
      autoplay={autoplay}
    />
  );
}

const AUTOPLAY_MS = 4800;
const IDLE_ARM_MS = 50_000;
const IDLE_STEP_MS = 15_000;

function ClipRules({
  onTitleChange,
  onClose,
  autoplay = false,
}: {
  onTitleChange?: (title: {
    kicker: string;
    title: string;
    phase: SlidePhase;
    dir: SlideDir;
  }) => void;
  onClose?: () => void;
  autoplay?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [focus, setFocus] = useState<RulesFocus>('next');
  const [phase, setPhase] = useState<SlidePhase>('idle');
  const [dir, setDir] = useState<SlideDir>('next');
  const hideTimer = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const rule = RULES[index] ?? RULES[0];

  const go = (delta: 1 | -1) => {
    if (phaseRef.current === 'hide') return;
    phaseRef.current = 'hide';
    const nextDir: SlideDir = delta > 0 ? 'next' : 'prev';
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (reduced) {
      phaseRef.current = 'idle';
      setDir(nextDir);
      setPhase('idle');
      setIndex((current) => (current + delta + RULES.length) % RULES.length);
      return;
    }
    setDir(nextDir);
    setPhase('hide');
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      setIndex((current) => (current + delta + RULES.length) % RULES.length);
      setPhase('show');
    }, SLIDE_HIDE_MS);
  };
  const prev = () => go(-1);
  const next = () => go(1);
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => goRef.current(1), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplay]);

  useEffect(() => {
    if (!onClose) return;
    let stepId: number | null = null;
    let armId = 0;

    const startStepping = () => {
      goRef.current(1);
      stepId = window.setInterval(() => goRef.current(1), IDLE_STEP_MS);
    };

    const arm = () => {
      if (stepId != null) {
        window.clearInterval(stepId);
        stepId = null;
      }
      window.clearTimeout(armId);
      armId = window.setTimeout(startStepping, IDLE_ARM_MS);
    };

    arm();
    const onActivity = () => arm();
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.clearTimeout(armId);
      if (stepId != null) window.clearInterval(stepId);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    onTitleChange?.({
      kicker: rule.kicker,
      title: rule.title,
      phase,
      dir,
    });
  }, [onTitleChange, rule.kicker, rule.title, phase, dir]);

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
        // goRef, not prev/next: those are new every render and would be stale here.
        if (focus === 'prev') goRef.current(-1);
        if (focus === 'next') goRef.current(1);
        if (focus === 'close') onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, onClose]);

  return (
    <div
      id="centerSection"
      className={
        phase === 'idle'
          ? 'rules-slider'
          : `rules-slider rules-slider--${phase} rules-slider--${dir}`
      }
    >
      <div className="rules-slider__card">
        <RuleClip key={rule.id} id={rule.id} />
        <div className="rules-slider__copy" key={`${rule.id}-${phase}`}>
          {onTitleChange ? null : (
            <p className="ruleTitle">
              {rule.kicker} {rule.title}
            </p>
          )}
          <p className="gameDescription grey">{rule.text}</p>
        </div>
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
          <Button
            variant="secondary"
            glowing={focus === 'close'}
            className="rules-modal__close"
            onMouseEnter={() => setFocus('close')}
            onClick={onClose}
          >
            Close
          </Button>
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
