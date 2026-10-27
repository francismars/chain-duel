/**
 * Short looping match clip for a rules slide, driven by the real game engine.
 */
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  advancePointChanges,
  createGameState,
  getHudState,
  startCountdown,
  stepGame,
} from '@/game/engine';
import type { GameState, GridPos } from '@/game/engine/types';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import { STEP_SPEED_MS } from '@/game/engine/constants';

export type RuleClipId = 'stake' | 'chain' | 'reset' | 'block';

const LOOP_TICKS = 36;
/** Center-row rewards, four cells apart. Two eats follow the first 16%. */
const CHAIN_Y = 9;
const CHAIN_COINS: GridPos[] = [8, 12, 16, 20, 24, 28, 32, 36, 40].map((x) => [
  x,
  CHAIN_Y,
]);
/** Normal coinbase stays on the board. Fee rewards appear with the block. */
const BLOCK_NORMAL: GridPos = [14, 16];
const BLOCK_BIG: GridPos = [24, 8];
const BLOCK_SMALL: GridPos = [36, 16];
const BLOCK_FLASH_AT = 6;
const BLOCK_FLASH_LEN = 10;
const BLOCK_SECOND_AT = 30;
const BLACK_PATH: GridPos[] = [
  [42, 4],
  [22, 4],
  [22, 20],
  [8, 20],
];
/** Ticks the two deposit QRs stay up before the match countdown. */
const QR_HOLD_TICKS = 26;
const STAKE_STEPS = [0, 2000, 4000, 8000];
const STAKE_TARGET = 8000;
/** Ticks of play after the countdown before the clip loops. */
const STAKE_PLAY_TICKS = 16;
const STAKE_INVOICE_P1 = 'lightning:lnbc8000n1chainduelplayer1';
const STAKE_INVOICE_P2 = 'lightning:lnbc8000n1chainduelplayer2';

function stakeAmount(ticks: number, delay: number): number {
  if (ticks <= delay) return 0;
  const step = Math.min(
    STAKE_STEPS.length - 1,
    Math.floor((ticks - delay) / 4)
  );
  return STAKE_STEPS[step] ?? 0;
}

function steerToward(snake: GameState['p1'], target: GridPos): void {
  const [x, y] = snake.head;
  const [tx, ty] = target;
  const horizontal = x < tx ? 'Right' : x > tx ? 'Left' : '';
  const vertical = y < ty ? 'Down' : y > ty ? 'Up' : '';
  const backsInto = (next: string) =>
    (snake.dir === 'Left' && next === 'Right') ||
    (snake.dir === 'Right' && next === 'Left') ||
    (snake.dir === 'Up' && next === 'Down') ||
    (snake.dir === 'Down' && next === 'Up');
  if (horizontal && !backsInto(horizontal)) snake.dirWanted = horizontal;
  else if (vertical && !backsInto(vertical)) snake.dirWanted = vertical;
  else if (snake.dir === 'Left' || snake.dir === 'Right') snake.dirWanted = 'Up';
}

function trail(head: GridPos, dir: 'left' | 'right' | 'up', length: number): GridPos[] {
  const body: GridPos[] = [];
  for (let i = 1; i <= length; i += 1) {
    if (dir === 'left') body.push([head[0] - i, head[1]]);
    else if (dir === 'right') body.push([head[0] + i, head[1]]);
    else body.push([head[0], head[1] + i]);
  }
  return body;
}

type ResetPhase = 'wall' | 'straight' | 'reorg' | 'clash' | 'restart';

/** Left, with a one-cell rise and fall so the long chain arrives later. */
const BLACK_ZIGZAG = ['Left', 'Left', 'Up', 'Left', 'Left', 'Down'] as const;

function jumped(from: GridPos, to: GridPos): boolean {
  return Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) > 1;
}

/**
 * White is short and aimed at the top wall. Black is already long on the
 * center row, moving left, clear of white so the wall hit is white's alone.
 */
function placeWallApproach(state: GameState): void {
  state.p1.head = [18, 4];
  state.p1.body = trail(state.p1.head, 'up', 2);
  state.p1.dir = 'Up';
  state.p1.dirWanted = 'Up';
  state.p2.head = [34, 12];
  state.p2.body = trail(state.p2.head, 'right', 14);
  state.p2.dir = 'Left';
  state.p2.dirWanted = 'Left';
  state.coinbases = [];
}

function makeClip(id: RuleClipId): GameState {
  const state = createGameState({
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    p1Points: id === 'stake' || id === 'block' ? 8000 : 4000,
    p2Points: id === 'stake' || id === 'block' ? 8000 : id === 'chain' ? 24000 : 2000,
    modeLabel: 'P2P',
    p1Human: id !== 'stake',
    p2Human: id === 'chain' || id === 'reset' || id === 'block',
    aiTier: 'normie',
  });
  if (id === 'stake') {
    state.countdownStart = false;
    state.countdownTicks = 0;
    state.gameStarted = false;
    return state;
  }
  startCountdown(state);
  state.countdownTicks = 999;
  state.countdownStart = false;
  state.gameStarted = true;

  if (id === 'chain') {
    state.p1.head = [4, CHAIN_Y];
    state.p1.body = trail(state.p1.head, 'left', 1);
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    state.p2.head = [46, 21];
    state.p2.body = [
      [47, 21],
      [48, 21],
    ];
    state.p2.dir = 'Left';
    state.p2.dirWanted = 'Left';
    state.coinbases = [{ pos: [...CHAIN_COINS[0]] }];
  }

  if (id === 'reset') {
    placeWallApproach(state);
  }

  if (id === 'block') {
    state.p1.head = [4, 16];
    state.p1.body = trail(state.p1.head, 'left', 2);
    state.p1.dir = 'Right';
    state.p1.dirWanted = 'Right';
    state.p2.head = [46, 4];
    state.p2.body = [
      [47, 4],
      [48, 4],
    ];
    state.p2.dir = 'Left';
    state.p2.dirWanted = 'Left';
    state.coinbases = [{ pos: [...BLOCK_NORMAL] }];
  }

  return state;
}

export function RuleClip({ id }: { id: RuleClipId }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [showQr, setShowQr] = useState(id === 'stake');
  const [stake, setStake] = useState({ p1: 0, p2: 0 });
  const [bar, setBar] = useState({ p1: 50, p2: 50 });
  const [blockFlash, setBlockFlash] = useState(false);
  const [impact, setImpact] = useState<{
    id: number;
    left: number;
    top: number;
    kind: 'wall' | 'clash' | 'reorg';
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let stopped = false;
    let frame = 0;
    const renderer = new PixiGameRenderer();
    let state = makeClip(id);
    let ticks = 0;
    let qrTicks = 0;
    let holdQr = id === 'stake';
    let playTicks = 0;
    let chainCoin = 0;
    let ateNormal = false;
    let ateBig = false;
    let ateSmall = false;
    let blockHold = 0;
    let blackStep = 0;
    let resetPhase: ResetPhase = 'wall';
    let restartSteps = 0;
    let zigSteps = 0;
    let impactId = 0;
    setShowQr(id === 'stake');
    setImpact(null);
    setStake({ p1: 0, p2: 0 });
    setBlockFlash(false);
    const syncBar = () => {
      const hud = getHudState(state);
      setBar({ p1: hud.currentWidthP1, p2: hud.currentWidthP2 });
    };
    syncBar();

    const tick = () => {
      if (stopped) return;
      if (id === 'stake') {
        const paid =
          stakeAmount(qrTicks, 2) >= STAKE_TARGET &&
          stakeAmount(qrTicks, 6) >= STAKE_TARGET;
        if (!paid || qrTicks < QR_HOLD_TICKS) {
          qrTicks += 1;
          holdQr = true;
          setStake({
            p1: stakeAmount(qrTicks, 2),
            p2: stakeAmount(qrTicks, 6),
          });
          return;
        }
        holdQr = false;
        if (!state.countdownStart && !state.gameStarted) {
          setShowQr(false);
          startCountdown(state);
        }
        stepGame(state);
        if (state.gameStarted) playTicks += 1;
        if (playTicks > STAKE_PLAY_TICKS || state.gameEnded) {
          state = makeClip(id);
          qrTicks = 0;
          playTicks = 0;
          holdQr = true;
          setStake({ p1: 0, p2: 0 });
          setShowQr(true);
        }
        syncBar();
        return;
      }
      ticks += 1;
      if (
        id !== 'chain' &&
        id !== 'block' &&
        id !== 'reset' &&
        (ticks > LOOP_TICKS || state.gameEnded)
      ) {
        state = makeClip(id);
        ticks = 0;
      }
      if (id === 'chain') {
        state.p1.dir = 'Right';
        state.p1.dirWanted = 'Right';
        state.p2.dirWanted = 'Left';
      }
      if (id === 'block') {
        const bigOn = ticks >= BLOCK_FLASH_AT;
        const goal: GridPos = !ateNormal
          ? BLOCK_NORMAL
          : bigOn && !ateBig
            ? BLOCK_BIG
            : BLOCK_SMALL;
        steerToward(state.p1, goal);
        const mark = BLACK_PATH[blackStep] ?? BLACK_PATH[BLACK_PATH.length - 1];
        steerToward(state.p2, mark);
        if (
          mark &&
          state.p2.head[0] === mark[0] &&
          state.p2.head[1] === mark[1] &&
          blackStep < BLACK_PATH.length - 1
        ) {
          blackStep += 1;
        }
        const flashing =
          (ticks >= BLOCK_FLASH_AT && ticks < BLOCK_FLASH_AT + BLOCK_FLASH_LEN) ||
          (ticks >= BLOCK_SECOND_AT && ticks < BLOCK_SECOND_AT + BLOCK_FLASH_LEN);
        setBlockFlash(flashing);
      }
      if (id === 'reset') {
        if (resetPhase === 'restart') {
          restartSteps += 1;
          if (restartSteps >= 3) {
            placeWallApproach(state);
            resetPhase = 'wall';
            restartSteps = 0;
            zigSteps = 0;
          }
        }
        const zig = BLACK_ZIGZAG[zigSteps % BLACK_ZIGZAG.length] ?? 'Left';
        if (resetPhase === 'wall' || resetPhase === 'straight') {
          state.p2.dir = zig;
          state.p2.dirWanted = zig;
          zigSteps += 1;
        } else if (resetPhase === 'reorg' && state.p2.head[1] < state.p1.head[1]) {
          state.p2.dir = 'Down';
          state.p2.dirWanted = 'Down';
        } else if (resetPhase === 'reorg' && state.p2.head[1] > state.p1.head[1]) {
          state.p2.dir = 'Up';
          state.p2.dirWanted = 'Up';
        } else {
          state.p2.dir = 'Left';
          state.p2.dirWanted = 'Left';
        }
        if (resetPhase === 'wall') {
          state.p1.dir = 'Up';
          state.p1.dirWanted = 'Up';
        } else {
          state.p1.dir = 'Right';
          state.p1.dirWanted = 'Right';
          if (resetPhase === 'straight' && zigSteps >= 16) resetPhase = 'reorg';
        }
        const beforeP1: GridPos = [state.p1.head[0], state.p1.head[1]];
        const beforeP2: GridPos = [state.p2.head[0], state.p2.head[1]];
        stepGame(state);
        const p1Hit = jumped(beforeP1, state.p1.head);
        const p2Hit = jumped(beforeP2, state.p2.head);
        const flash = (kind: 'wall' | 'clash' | 'reorg', col: number, row: number) => {
          impactId += 1;
          setImpact({
            id: impactId,
            left: ((col + 0.5) / state.cols) * 100,
            top: ((row + 0.5) / state.rows) * 100,
            kind,
          });
        };
        if (resetPhase === 'wall' && p1Hit && !p2Hit) {
          flash('wall', beforeP1[0], 0);
          resetPhase = 'straight';
        } else if (resetPhase === 'reorg' && p1Hit && p2Hit) {
          flash('reorg', (beforeP1[0] + beforeP2[0]) / 2, beforeP1[1]);
          resetPhase = 'clash';
        } else if (resetPhase === 'clash' && p1Hit && p2Hit) {
          flash('clash', (beforeP1[0] + beforeP2[0]) / 2, beforeP1[1]);
          resetPhase = 'restart';
          restartSteps = 0;
        }
        syncBar();
        return;
      }
      stepGame(state);
      if (id === 'chain') {
        const target = CHAIN_COINS[chainCoin];
        const [hx, hy] = state.p1.head;
        if (target && hx === target[0] && hy === target[1]) chainCoin += 1;
        const next = CHAIN_COINS[chainCoin];
        state.coinbases = next ? [{ pos: [next[0], next[1]] }] : [];
        const nearWall =
          state.p1.head[0] >= state.cols - 3 || state.p2.head[0] <= 2;
        if (nearWall || state.gameEnded) {
          state = makeClip(id);
          ticks = 0;
          chainCoin = 0;
        }
      }
      if (id === 'block') {
        const [hx, hy] = state.p1.head;
        const hit = (pos: GridPos) => hx === pos[0] && hy === pos[1];
        if (hit(BLOCK_NORMAL)) ateNormal = true;
        if (ticks >= BLOCK_FLASH_AT && hit(BLOCK_BIG)) ateBig = true;
        if (ticks >= BLOCK_SECOND_AT && hit(BLOCK_SMALL)) ateSmall = true;
        const coins: Array<{ pos: GridPos; reward?: 32 | 2 }> = [];
        if (!ateNormal) coins.push({ pos: [...BLOCK_NORMAL] });
        if (ticks >= BLOCK_FLASH_AT && !ateBig) {
          coins.push({ pos: [...BLOCK_BIG], reward: 32 });
        }
        if (ticks >= BLOCK_SECOND_AT && !ateSmall) {
          coins.push({ pos: [...BLOCK_SMALL], reward: 2 });
        }
        state.coinbases = coins;
        if (ateNormal && ateBig && ateSmall) blockHold += 1;
        if (blockHold > 8 || state.gameEnded) {
          state = makeClip(id);
          ticks = 0;
          ateNormal = false;
          ateBig = false;
          ateSmall = false;
          blockHold = 0;
          blackStep = 0;
          setBlockFlash(false);
        }
      }
      syncBar();
    };

    const paint = () => {
      if (!holdQr) {
        renderer.render(state, { replayView: true, suppressVictoryOverlay: true });
        return;
      }
      const p1Head = state.p1.head;
      const p1Body = state.p1.body;
      const p2Head = state.p2.head;
      const p2Body = state.p2.body;
      const coins = state.coinbases;
      state.p1.head = [-8, -8];
      state.p1.body = [];
      state.p2.head = [-8, -8];
      state.p2.body = [];
      state.coinbases = [];
      renderer.render(state, { replayView: true, suppressVictoryOverlay: true });
      state.p1.head = p1Head;
      state.p1.body = p1Body;
      state.p2.head = p2Head;
      state.p2.body = p2Body;
      state.coinbases = coins;
    };

    void renderer.mount(host).then(() => {
      if (stopped) {
        renderer.destroy();
        return;
      }
      paint();
      let last = performance.now();
      let carry = 0;
      const loop = (now: number) => {
        if (stopped) return;
        const delta = Math.min(100, Math.max(0, now - last));
        last = now;
        carry += delta;
        let stepped = false;
        while (carry >= STEP_SPEED_MS) {
          carry -= STEP_SPEED_MS;
          tick();
          stepped = true;
        }
        advancePointChanges(state);
        if (stepped || (state.pointChanges?.length ?? 0) > 0) paint();
        frame = window.requestAnimationFrame(loop);
      };
      frame = window.requestAnimationFrame(loop);
    });

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      renderer.destroy();
    };
  }, [id]);

  return (
    <div className="rule-clip-frame" aria-hidden>
      <div className="rule-clip__bar">
        <span style={{ width: `${bar.p1}%` }} />
        <span style={{ width: `${bar.p2}%` }} />
      </div>
      <div className={blockFlash ? 'rule-clip rule-clip--flash' : 'rule-clip'}>
      <div className="rule-clip__stage" ref={hostRef} />
      {impact ? (
        <div
          key={impact.id}
          className={`rule-clip__impact rule-clip__impact--${impact.kind}`}
          style={{ left: `${impact.left}%`, top: `${impact.top}%` }}
          onAnimationEnd={() => setImpact(null)}
        />
      ) : null}
      {id === 'stake' && showQr ? (
        <div className="rule-clip__qr">
          {(
            [
              ['Player 1', STAKE_INVOICE_P1, stake.p1],
              ['Player 2', STAKE_INVOICE_P2, stake.p2],
            ] as const
          ).map(([name, invoice, amount]) => {
            const paid = amount >= STAKE_TARGET;
            return (
              <div className="rule-clip__qr-player" key={name}>
                <div className="rule-clip__qr-card">
                  <QRCodeSVG
                    value={invoice}
                    size={78}
                    bgColor="#ffffff"
                    fgColor="#111111"
                    aria-label={`${name} deposit`}
                  />
                  <img
                    className={
                      paid
                        ? 'rule-clip__qr-bolt'
                        : 'rule-clip__qr-bolt rule-clip__qr-bolt--hide'
                    }
                    src="/images/qr_lightning.gif"
                    alt=""
                  />
                </div>
                <p className="rule-clip__qr-label">{name}</p>
                <p className="rule-clip__qr-amount">
                  {paid ? 'Paid' : `${amount.toLocaleString()} sats`}
                </p>
              </div>
            );
          })}
          {stake.p1 >= STAKE_TARGET && stake.p2 >= STAKE_TARGET ? (
            <p className="rule-clip__qr-ready">Ready</p>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}
