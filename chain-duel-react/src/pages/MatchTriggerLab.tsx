import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudio } from '@/contexts/AudioContext';
import { GameAudioSystem } from '@/game/audio/gameAudio';
import {
  advanceStreakPops,
  subscribeTensionDebug,
  tensionDebugSnapshot,
  type TensionDebugSnapshot,
} from '@/game/audio/tensionDebug';
import {
  lostPlayablePercent,
  TENSION_TRACKS,
  type TensionLevel,
} from '@/game/audio/tension';
import { STEP_SPEED_MS } from '@/game/engine/constants';
import { captureRateLabel } from '@/game/engine/captureRateLabel';
import {
  advancePointChanges,
  createGameState,
  getCaptureLabel,
} from '@/game/engine';
import type {
  Direction,
  GameState,
  GridPos,
  SnakeState,
} from '@/game/engine/types';
import { PixiGameRenderer } from '@/game/render/pixiRenderer';
import './matchTriggerLab.css';

const POT = 10000;
const MAX_CHAIN = 36;
const MAX_INSET = 8;

type LabModeId = 'freeplay' | 'p2p' | 'tournament' | 'online' | 'challenge';

type LabMode = {
  id: LabModeId;
  label: string;
  summary: string;
  convergence: boolean;
  powerups: boolean;
  block: boolean;
  practice: boolean;
  tournament: boolean;
  modeLabel: string;
};

const LAB_MODES: LabMode[] = [
  {
    id: 'freeplay',
    label: 'Free play',
    summary:
      'Walls close and power-ups can appear. A new block plays a sound. Captures, deaths, the countdown, and the pressure music are the same in every match.',
    convergence: true,
    powerups: true,
    block: true,
    practice: true,
    tournament: false,
    modeLabel: 'FREE PLAY',
  },
  {
    id: 'p2p',
    label: 'P2P',
    summary:
      'No closing walls and no power-ups. A new block still plays. The match music, captures, deaths, and countdown match free play.',
    convergence: false,
    powerups: false,
    block: true,
    practice: false,
    tournament: false,
    modeLabel: 'P2P',
  },
  {
    id: 'tournament',
    label: 'Tournament',
    summary:
      'The board matches a P2P duel. The bracket, the seat payment, and the QR live outside the match.',
    convergence: false,
    powerups: false,
    block: true,
    practice: false,
    tournament: true,
    modeLabel: 'TOURNAMENT',
  },
  {
    id: 'online',
    label: 'Online',
    summary:
      'No closing walls and no power-ups. A new block still plays. Scrubbing a replay also fires the floating score pops again.',
    convergence: false,
    powerups: false,
    block: true,
    practice: false,
    tournament: false,
    modeLabel: 'ONLINE',
  },
  {
    id: 'challenge',
    label: 'Challenge',
    summary:
      'No closing walls, and a new block does not play a sound. Captures, deaths, the countdown, and the pressure music still play.',
    convergence: false,
    powerups: false,
    block: false,
    practice: true,
    tournament: false,
    modeLabel: 'CHALLENGE',
  },
];

type SoloClip = {
  id: string;
  name: string;
  src: string;
  loop: boolean;
  where: string;
  /** Modes where this is heard. Menus are outside the board. */
  inMode: (mode: LabMode) => boolean;
};

const SOLO_CLIPS: SoloClip[] = [
  {
    id: 'menu',
    name: 'Menu',
    src: '/sound/chain_duel_produced_menu.m4a',
    loop: true,
    where: 'Menus, lobby, bracket, results',
    inMode: () => true,
  },
  {
    id: 'game',
    name: 'Game bed',
    src: '/sound/chain_duel_produced_game.m4a',
    loop: true,
    where: 'Every match',
    inMode: () => true,
  },
  {
    id: 'build',
    name: 'Build',
    src: '/sound/chain_duel_build.m4a',
    loop: true,
    where: 'Pressure mark 1',
    inMode: () => true,
  },
  {
    id: 'pressure',
    name: 'Pressure',
    src: '/sound/chain_duel_pressure.m4a',
    loop: true,
    where: 'Pressure mark 2',
    inMode: () => true,
  },
  {
    id: 'tension',
    name: 'Tension',
    src: '/sound/chain_duel_tension.m4a',
    loop: true,
    where: 'Pressure mark 3',
    inMode: () => true,
  },
  {
    id: 'critical',
    name: 'Critical',
    src: '/sound/chain_duel_critical.m4a',
    loop: true,
    where: 'Pressure mark 4',
    inMode: () => true,
  },
  {
    id: 'end',
    name: 'End',
    src: '/sound/chain_duel_end.m4a',
    loop: false,
    where: 'Match over, once',
    inMode: () => true,
  },
  {
    id: 'shrink',
    name: 'Shrink',
    src: '/sound/chain_duel_shrink.m4a',
    loop: false,
    where: 'Walls step in',
    inMode: (mode) => mode.convergence,
  },
  {
    id: 'beep1',
    name: 'Beep 1',
    src: '/sound/Beep1.m4a',
    loop: false,
    where: 'Countdown 3, 2, 1',
    inMode: () => true,
  },
  {
    id: 'beep2',
    name: 'Beep 2',
    src: '/sound/Beep2.m4a',
    loop: false,
    where: 'Countdown LFG',
    inMode: () => true,
  },
  {
    id: 'p1',
    name: 'White dies',
    src: '/sound/P1-HWAC.aac',
    loop: false,
    where: 'White resets',
    inMode: () => true,
  },
  {
    id: 'p2',
    name: 'Black dies',
    src: '/sound/P2-HWAC.aac',
    loop: false,
    where: 'Black resets',
    inMode: () => true,
  },
  {
    id: 'c2',
    name: 'Capture 2',
    src: '/sound/P-FC_2.aac',
    loop: false,
    where: 'Chain length 1',
    inMode: () => true,
  },
  {
    id: 'c4',
    name: 'Capture 4',
    src: '/sound/P-FC_4.aac',
    loop: false,
    where: 'Chain length 2',
    inMode: () => true,
  },
  {
    id: 'c8',
    name: 'Capture 8',
    src: '/sound/P-FC_8.aac',
    loop: false,
    where: 'Chain length 3–7',
    inMode: () => true,
  },
  {
    id: 'c16',
    name: 'Capture 16',
    src: '/sound/P-FC_16.aac',
    loop: false,
    where: 'Chain length 8–15',
    inMode: () => true,
  },
  {
    id: 'c32',
    name: 'Capture 32',
    src: '/sound/P-FC_32.aac',
    loop: false,
    where: 'Chain length 16+',
    inMode: () => true,
  },
  {
    id: 'power',
    name: 'Power-up',
    src: '/sound/powerup.mp3',
    loop: false,
    where: 'A power-up is taken',
    inMode: (mode) => mode.powerups,
  },
  {
    id: 'block',
    name: 'Block',
    src: '/sound/MAINNET_BLOCK.aac',
    loop: false,
    where: 'New block, or speed change',
    inMode: (mode) => mode.block,
  },
  {
    id: 'select',
    name: 'Menu move',
    src: '/sound/button-select.mp3',
    loop: false,
    where: 'Focus moves in a menu',
    inMode: () => true,
  },
  {
    id: 'confirm',
    name: 'Menu confirm',
    src: '/sound/button-focus.mp3',
    loop: false,
    where: 'A menu button confirms',
    inMode: () => true,
  },
];

function labMode(id: LabModeId): LabMode {
  return LAB_MODES.find((mode) => mode.id === id) ?? LAB_MODES[0];
}

const COUNTDOWN = [
  { tick: 1, label: '3', clip: 'Beep1' },
  { tick: 11, label: '2', clip: 'Beep1' },
  { tick: 21, label: '1', clip: 'Beep1' },
  { tick: 31, label: 'LFG', clip: 'Beep2' },
] as const;

const TRACK_NAME = ['off', 'build', 'pressure', 'tension', 'critical'] as const;

function makeLabState(mode: LabMode): GameState {
  const state = createGameState({
    p1Name: 'White',
    p2Name: 'Black',
    p1Points: POT / 2,
    p2Points: POT / 2,
    modeLabel: mode.modeLabel,
    practiceMode: mode.practice,
    convergenceMode: mode.convergence,
    powerupMode: mode.powerups,
    isTournament: mode.tournament,
    p1Human: true,
    p2Human: true,
  });
  state.gameStarted = true;
  state.p1.dirWanted = 'Right';
  state.p2.dirWanted = 'Left';
  return state;
}

function applyInset(state: GameState, inset: number): void {
  const border = state.shrinkBorder;
  if (!border) return;
  const next = Math.max(0, Math.min(MAX_INSET, inset));
  border.left = next;
  border.right = state.cols - 1 - next;
  border.top = next;
  border.bottom = state.rows - 1 - next;
  border.warningActive = next > 0;
}

function applyShare(state: GameState, share: number): void {
  const clamped = Math.max(0.5, Math.min(0.99, share));
  const p1 = Math.round(state.totalPoints * clamped);
  state.score = [p1, state.totalPoints - p1];
}

function leaderShare(state: GameState): number {
  const pool = state.score[0] + state.score[1];
  if (pool <= 0) return 0;
  return Math.max(state.score[0], state.score[1]) / pool;
}

function captureClip(length: number): string {
  if (length <= 1) return 'P-FC_2';
  if (length <= 2) return 'P-FC_4';
  if (length < 8) return 'P-FC_8';
  if (length < 16) return 'P-FC_16';
  return 'P-FC_32';
}

/** Same tail extension as the match when a coinbase is eaten. */
function appendTail(snake: SnakeState): void {
  if (snake.body.length === 0) {
    const [hx, hy] = snake.head;
    const d = snake.dir || snake.dirWanted;
    if (d === 'Right') snake.body.push([hx - 1, hy]);
    else if (d === 'Left') snake.body.push([hx + 1, hy]);
    else if (d === 'Down') snake.body.push([hx, hy - 1]);
    else snake.body.push([hx, hy + 1]);
    return;
  }
  const last = snake.body[snake.body.length - 1]!;
  const beforeLast =
    snake.body.length > 1 ? snake.body[snake.body.length - 2]! : snake.head;
  if (last[0] < beforeLast[0]) snake.body.push([last[0] - 1, last[1]]);
  else if (last[0] > beforeLast[0]) snake.body.push([last[0] + 1, last[1]]);
  else if (last[1] < beforeLast[1]) snake.body.push([last[0], last[1] - 1]);
  else snake.body.push([last[0], last[1] + 1]);
}

function face(from: GridPos, to: GridPos): Direction {
  if (to[0] > from[0]) return 'Right';
  if (to[0] < from[0]) return 'Left';
  if (to[1] > from[1]) return 'Down';
  return 'Up';
}

function ahead(snake: SnakeState): GridPos {
  const dir = snake.dir || snake.dirWanted || 'Right';
  const [x, y] = snake.head;
  if (dir === 'Left') return [x - 1, y];
  if (dir === 'Up') return [x, y - 1];
  if (dir === 'Down') return [x, y + 1];
  return [x + 1, y];
}

function orthogonalSteps(from: GridPos, to: GridPos): GridPos[] {
  const steps: GridPos[] = [];
  let x = from[0];
  let y = from[1];
  while (x !== to[0]) {
    x += Math.sign(to[0] - x);
    steps.push([x, y]);
  }
  while (y !== to[1]) {
    y += Math.sign(to[1] - y);
    steps.push([x, y]);
  }
  return steps;
}

function cellFromPointer(
  event: React.PointerEvent,
  board: HTMLElement,
  cols: number,
  rows: number
): GridPos | null {
  const rect = board.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * cols);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
  return [x, y];
}

function pushSatsPop(
  state: GameState,
  player: 'P1' | 'P2',
  value: number,
  rateLabel: string | undefined
): void {
  const p1Pos: GridPos = [state.p1.head[0], state.p1.head[1]];
  const p2Pos: GridPos = [state.p2.head[0], state.p2.head[1]];
  state.pointChanges.push({
    player,
    value,
    p1Pos,
    p2Pos,
    gainPos: player === 'P1' ? p1Pos : p2Pos,
    lossPos: player === 'P1' ? p2Pos : p1Pos,
    capturePercent: Number.parseInt(
      getCaptureLabel(player === 'P1' ? state.p1.body.length : state.p2.body.length),
      10
    ),
    captureRateLabel: rateLabel,
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha: 1,
  });
}

function transferToP1(state: GameState, amount: number): number {
  const gain = Math.min(amount, state.score[1]);
  state.score[0] += gain;
  state.score[1] -= gain;
  return gain;
}

function transferToP2(state: GameState, amount: number): number {
  const gain = Math.min(amount, state.score[0]);
  state.score[1] += gain;
  state.score[0] -= gain;
  return gain;
}

function musicReason(tension: TensionDebugSnapshot): string {
  const ended = tension.layers.some(
    (layer) => layer.name === 'end' || layer.name === 'menu'
  );
  if (ended) {
    return 'The match ended. The end cue plays once over menu music, and the menu loop keeps going onto the results screen.';
  }
  if (tension.level === 0) {
    return 'Only the game bed is playing. A pressure layer comes in when chain, walls, score, or streak reaches the next mark. The loudest of those four wins.';
  }
  const track = TENSION_TRACKS[tension.level] ?? 'off';
  const causes = (
    [
      ['chain', tension.chain, 'chain length'],
      ['walls', tension.walls, 'the shrinking board'],
      ['score', tension.score, 'score share'],
      ['streak', tension.streak, 'the catch streak'],
    ] as const
  )
    .filter((entry) => entry[1] === tension.level)
    .map((entry) => entry[2]);
  const because = causes.length > 0 ? causes.join(' and ') : 'the held level';
  const held = tension.held
    ? ' It is holding for 4 seconds after the input dropped.'
    : '';
  return `${track} is in because ${because} ${tension.level === 1 ? 'reached the first mark' : `reached mark ${tension.level}`}.${held} The game bed ducks under it.`;
}

function Pips({ level }: { level: TensionLevel }) {
  return (
    <span className="match-lab__pips" aria-label={`level ${level} of 4`}>
      {[1, 2, 3, 4].map((step) => (
        <i key={step} className={step <= level ? 'on' : undefined} />
      ))}
    </span>
  );
}

export default function MatchTriggerLab() {
  const { stop, isMuted, isMusicMuted } = useAudio();
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const stateRef = useRef<GameState | null>(null);
  if (!stateRef.current) stateRef.current = makeLabState(labMode('freeplay'));
  const audioRef = useRef<GameAudioSystem | null>(null);
  const rendererRef = useRef<PixiGameRenderer | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const pathRef = useRef<GridPos[]>([]);
  const riderRef = useRef<'p1' | 'p2'>('p1');
  const growRef = useRef(false);
  const endedRef = useRef(false);
  const countdownGen = useRef(0);
  const [tension, setTension] = useState<TensionDebugSnapshot>(
    tensionDebugSnapshot
  );
  const [revision, setRevision] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);
  const [rider, setRider] = useState<'p1' | 'p2'>('p1');
  const [growOn, setGrowOn] = useState(false);
  const [modeId, setModeId] = useState<LabModeId>('freeplay');
  const [soloId, setSoloId] = useState<string | null>(null);
  const soloRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;
  const mode = labMode(modeId);
  riderRef.current = rider;
  growRef.current = growOn;
  endedRef.current = ended;

  const bump = useCallback(() => setRevision((value) => value + 1), []);
  const note = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 8));
  }, []);

  const snakeOf = (state: GameState) =>
    riderRef.current === 'p1' ? state.p1 : state.p2;

  const performStep = useCallback(
    (next: GridPos, grow: boolean) => {
      const state = stateRef.current;
      const audio = audioRef.current;
      if (!state || !audio || state.gameEnded) return;
      const snake = snakeOf(state);
      const [hx, hy] = snake.head;
      if (Math.abs(next[0] - hx) + Math.abs(next[1] - hy) !== 1) return;
      const coinIndex = state.coinbases.findIndex(
        (coin) => coin.pos[0] === next[0] && coin.pos[1] === next[1]
      );
      const eating = (grow || coinIndex >= 0) && snake.body.length < MAX_CHAIN;
      const dir = face(snake.head, next);
      snake.dir = dir;
      snake.dirWanted = dir;
      snake.body.unshift([hx, hy]);
      snake.body.pop();
      snake.head = [next[0], next[1]];
      if (coinIndex >= 0) state.coinbases.splice(coinIndex, 1);
      if (eating) appendTail(snake);
      state.currentCaptureP1 = getCaptureLabel(state.p1.body.length);
      state.currentCaptureP2 = getCaptureLabel(state.p2.body.length);
      state.tickCount += 1;
      if (eating) {
        const length = snake.body.length;
        const playerIndex = riderRef.current === 'p1' ? 0 : 1;
        const percent = Number.parseInt(getCaptureLabel(length), 10);
        const rate = captureRateLabel(state, playerIndex, percent);
        const requested = Math.max(
          1,
          Math.floor((state.totalPoints * percent) / 100)
        );
        const gained =
          riderRef.current === 'p1'
            ? transferToP1(state, requested)
            : transferToP2(state, requested);
        if (gained > 0) {
          pushSatsPop(
            state,
            riderRef.current === 'p1' ? 'P1' : 'P2',
            gained,
            rate
          );
        }
        audio.playCapture(length);
        note(
          `Eat · tail grows · +${gained} sats${rate ? ` ${rate}` : ''} · ${captureClip(length)}`
        );
      }
      audio.updateGameState(state);
      bump();
    },
    [bump, note]
  );

  useEffect(() => {
    stopRef.current();
    const audio = new GameAudioSystem();
    audioRef.current = audio;
    const state = stateRef.current!;
    audio.updateGameState(state);
    audio.startMusic();
    const unlock = () => audio.startMusic();
    window.addEventListener('pointerdown', unlock);
    const unsubscribe = subscribeTensionDebug(() => {
      setTension(tensionDebugSnapshot());
    });

    const renderer = new PixiGameRenderer();
    rendererRef.current = renderer;
    const host = hostRef.current;
    let cancelled = false;
    if (host) {
      void renderer.mount(host).then(() => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        readyRef.current = true;
        renderer.resize();
      });
    }

    const pump = window.setInterval(() => {
      const next = pathRef.current.shift();
      if (!next || endedRef.current) return;
      performStep(next, growRef.current);
    }, STEP_SPEED_MS);

    let frame = 0;
    const loop = () => {
      const live = stateRef.current;
      const currentAudio = audioRef.current;
      const currentRenderer = rendererRef.current;
      if (live && currentAudio) {
        advancePointChanges(live);
        advanceStreakPops();
        currentAudio.updateGameState(live);
      }
      if (readyRef.current && live && currentRenderer) {
        currentRenderer.render(live, { suppressVictoryOverlay: true });
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    const board = boardRef.current;
    const observer = new ResizeObserver(() => rendererRef.current?.resize());
    if (board) observer.observe(board);

    return () => {
      cancelled = true;
      countdownGen.current += 1;
      unsubscribe();
      window.removeEventListener('pointerdown', unlock);
      window.clearInterval(pump);
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      readyRef.current = false;
      soloRef.current?.pause();
      renderer.destroy();
      rendererRef.current = null;
      audio.stopAll();
      audioRef.current = null;
    };
  }, [performStep]);

  useEffect(() => {
    audioRef.current?.applyAppMuteState(isMuted, isMusicMuted);
    if (soloRef.current) soloRef.current.muted = isMuted;
  }, [isMuted, isMusicMuted]);

  const state = stateRef.current;
  const chain = state?.p1.body.length ?? 1;
  const inset = state?.shrinkBorder?.left ?? 0;
  const share = state ? leaderShare(state) : 0.5;
  const lost = state ? lostPlayablePercent(state) : 0;
  void revision;

  const extendPath = (cell: GridPos) => {
    const live = stateRef.current;
    if (!live || live.gameEnded) return;
    const snake = snakeOf(live);
    const from =
      pathRef.current.length > 0
        ? pathRef.current[pathRef.current.length - 1]!
        : snake.head;
    if (from[0] === cell[0] && from[1] === cell[1]) return;
    const steps = orthogonalSteps(from, cell);
    pathRef.current.push(...steps);
    if (!growRef.current) return;
    for (const step of steps) {
      const taken = live.coinbases.some(
        (coin) => coin.pos[0] === step[0] && coin.pos[1] === step[1]
      );
      const occupied =
        (live.p1.head[0] === step[0] && live.p1.head[1] === step[1]) ||
        (live.p2.head[0] === step[0] && live.p2.head[1] === step[1]);
      if (!taken && !occupied) live.coinbases.push({ pos: step });
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (endedRef.current || !stateRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = cellFromPointer(
      event,
      event.currentTarget,
      stateRef.current.cols,
      stateRef.current.rows
    );
    if (cell) extendPath(cell);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!stateRef.current) return;
    const cell = cellFromPointer(
      event,
      event.currentTarget,
      stateRef.current.cols,
      stateRef.current.rows
    );
    if (cell) extendPath(cell);
  };

  const stopSolo = () => {
    soloRef.current?.pause();
    soloRef.current = null;
    setSoloId(null);
  };

  const playAlone = (clip: SoloClip) => {
    audioRef.current?.stopAll();
    stopSolo();
    const clipAudio = new Audio(clip.src);
    clipAudio.loop = clip.loop;
    clipAudio.muted = mutedRef.current;
    void clipAudio.play().catch(() => undefined);
    soloRef.current = clipAudio;
    setSoloId(clip.id);
    note(`Alone · ${clip.name}`);
  };

  const hearMix = () => {
    stopSolo();
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio) return;
    audio.updateGameState(current);
    audio.startMusic();
    note('Match mix');
  };

  const switchMode = (id: LabModeId) => {
    const nextMode = labMode(id);
    pathRef.current = [];
    stopSolo();
    const next = makeLabState(nextMode);
    stateRef.current = next;
    setModeId(id);
    setEnded(false);
    const audio = audioRef.current;
    if (audio) {
      audio.stopAll();
      audio.updateGameState(next);
      audio.startMusic();
    }
    note(`${nextMode.label} · ${nextMode.summary}`);
    bump();
  };

  const setWalls = (nextInset: number) => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded || !current.shrinkBorder) return;
    const before = current.shrinkBorder?.left ?? 0;
    applyInset(current, nextInset);
    audio.updateGameState(current);
    const after = current.shrinkBorder?.left ?? 0;
    note(
      after > before
        ? `Walls step in · shrink cue · dead zone closes · ${lostPlayablePercent(current).toFixed(0)}% gone`
        : `Walls open · ${lostPlayablePercent(current).toFixed(0)}% gone`
    );
    bump();
  };

  const setScoreShare = (nextShare: number) => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    current.gameStarted = false;
    applyShare(current, nextShare);
    audio.updateGameState(current);
    current.gameStarted = true;
    audio.updateGameState(current);
    note(
      `Score share ${(leaderShare(current) * 100).toFixed(0)}% · streak reset so this slider is not a catch`
    );
    bump();
  };

  const eatOne = () => {
    const current = stateRef.current;
    if (!current || current.gameEnded) return;
    const next = ahead(snakeOf(current));
    const taken = current.coinbases.some(
      (coin) => coin.pos[0] === next[0] && coin.pos[1] === next[1]
    );
    if (!taken) current.coinbases.push({ pos: next });
    pathRef.current.push(next);
  };

  const die = (player: 'P1' | 'P2') => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    pathRef.current = [];
    audio.playReset(player);
    const border = current.shrinkBorder;
    if (player === 'P1') {
      const spawnX = border ? Math.max(6, border.left + 2) : 6;
      current.p1.head = [spawnX, 12];
      current.p1.body = [[Math.max(border ? border.left + 1 : 0, spawnX - 1), 12]];
      current.p1.dir = '';
      current.p1.dirWanted = 'Right';
      current.currentCaptureP1 = '2%';
    } else {
      const spawnX = border ? Math.min(44, border.right - 2) : 44;
      current.p2.head = [spawnX, 12];
      current.p2.body = [[Math.min(border ? border.right - 1 : 50, spawnX + 1), 12]];
      current.p2.dir = '';
      current.p2.dirWanted = 'Left';
      current.currentCaptureP2 = '2%';
    }
    current.tickCount += 1;
    audio.updateGameState(current);
    note(`${player} reset to spawn · ${player === 'P1' ? 'P1-HWAC' : 'P2-HWAC'}`);
    bump();
  };

  const fork = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    pathRef.current = [];
    current.p1.head = [20, 12];
    current.p1.body = [[19, 12]];
    current.p2.head = [21, 12];
    current.p2.body = [
      [22, 12],
      [23, 12],
      [24, 12],
      [25, 12],
      [26, 12],
      [27, 12],
    ];
    current.tickCount += 1;
    audio.updateGameState(current);
    current.p1.head = [6, 12];
    current.p1.body = [[5, 12]];
    current.p2.head = [44, 12];
    current.p2.body = [[45, 12]];
    current.tickCount += 1;
    audio.playReset('P1');
    audio.playReset('P2');
    audio.updateGameState(current);
    note('Head-on · both reset sounds · FORK floats on the long chain');
    bump();
  };

  const countdown = () => {
    const audio = audioRef.current;
    const current = stateRef.current;
    if (!audio || !current) return;
    const gen = countdownGen.current + 1;
    countdownGen.current = gen;
    void (async () => {
      current.countdownStart = true;
      for (const step of COUNTDOWN) {
        if (countdownGen.current !== gen) return;
        current.countdownTicks = step.tick;
        audio.playCountdownTick(step.tick);
        note(`Countdown ${step.label} · ${step.clip}`);
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (countdownGen.current !== gen) return;
      current.countdownStart = false;
      current.countdownTicks = 0;
    })();
  };

  const powerUp = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded || !current.meta.powerupMode) return;
    if (current.powerUpItems.length === 0) {
      current.powerUpItems = [{ pos: [25, 8], type: 'SURGE' }];
      note('Surge power-up is on the board. Click again to collect it.');
      bump();
      return;
    }
    current.powerUpItems = [];
    current.tickCount += 1;
    audio.playPowerUp();
    note('Power-up collected · powerup.mp3');
    bump();
  };

  const block = () => {
    if (!labMode(modeId).block) return;
    audioRef.current?.playBlockFound();
    boardRef.current?.classList.add('is-block');
    window.setTimeout(() => boardRef.current?.classList.remove('is-block'), 1000);
    note('New block · MAINNET_BLOCK · board flashes');
  };

  const endMatch = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || current.gameEnded) return;
    pathRef.current = [];
    current.gameEnded = true;
    audio.updateGameState(current);
    setEnded(true);
    note('Match end · end cue, then menu music');
    bump();
  };

  const resume = () => {
    const current = stateRef.current;
    const audio = audioRef.current;
    if (!current || !audio || !current.gameEnded) return;
    current.gameEnded = false;
    audio.updateGameState(current);
    setEnded(false);
    note('Match resumed · game bed from the start');
    bump();
  };

  return (
    <main className="match-lab">
      <section className="match-lab__stage">
        <header>
          <Link to="/preview?debug">UI test pages</Link>
          <h1>Match triggers</h1>
          <p>
            This is the match renderer. Drag on the board and the selected chain
            follows the pointer, turning as it goes. Turn on Grow and each new
            cell is an eat: the tail grows the way it does in a game, sats pop,
            and the capture clip plays.
          </p>
        </header>
        <div
          className="match-lab__board"
          ref={boardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
        >
          <div className="match-lab__host" ref={hostRef} />
        </div>
        <div className="match-lab__hud">
          <div>
            White <span>{state?.score[0] ?? 0}</span>
          </div>
          <div>
            Black <span>{state?.score[1] ?? 0}</span>
          </div>
          <div>
            Chain <span>{chain}</span>
          </div>
          <div>
            Walls <span>{lost.toFixed(0)}% gone</span>
          </div>
          <div>
            Share <span>{(share * 100).toFixed(0)}%</span>
          </div>
          <div>
            Streak <span>{tension.streakCount}</span>
            {tension.held ? ' · held' : ''}
          </div>
          <div>
            Music <span>{TRACK_NAME[tension.level] ?? 'off'}</span>
          </div>
        </div>
      </section>

      <aside className="match-lab__panel">
        <section>
          <h2>Mode</h2>
          <div className="match-lab__ride">
            {LAB_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={entry.id === modeId}
                onClick={() => switchMode(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p className="match-lab__note" style={{ marginTop: '0.45rem' }}>
            {mode.summary}
          </p>
        </section>

        <section>
          <h2>Move</h2>
          <div className="match-lab__ride">
            <button
              type="button"
              aria-pressed={rider === 'p1'}
              onClick={() => setRider('p1')}
            >
              White
            </button>
            <button
              type="button"
              aria-pressed={rider === 'p2'}
              onClick={() => setRider('p2')}
            >
              Black
            </button>
            <label className="match-lab__check">
              <input
                type="checkbox"
                checked={growOn}
                onChange={(event) => setGrowOn(event.target.checked)}
              />
              Grow while dragging
            </label>
          </div>
          <p className="match-lab__note" style={{ marginTop: '0.4rem' }}>
            Drag draws a bend: across, then down. The body follows, so the chain
            curves. Grow adds a block on the tail and plays the capture sound.
          </p>
        </section>

        <section>
          <h2>Heard now</h2>
          <p className="match-lab__why">{musicReason(tension)}</p>
          <div className="match-lab__layers" style={{ marginTop: '0.45rem' }}>
            {tension.layers.length === 0 ? (
              <p className="match-lab__note">
                Nothing audible yet. Click the board once if the browser blocked
                the bed.
              </p>
            ) : (
              tension.layers.map((layer) => (
                <div className="match-lab__layer" key={layer.name}>
                  <span>{layer.name}</span>
                  <b>
                    <i style={{ width: `${Math.round(layer.volume * 100)}%` }} />
                  </b>
                  <span>{layer.volume.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2>What brings a layer in</h2>
          <div className="match-lab__meters">
            <div className="match-lab__meter">
              <span>Chain</span>
              <Pips level={tension.chain} />
              <strong>{tension.chain}</strong>
            </div>
            <div className="match-lab__meter">
              <span>Walls</span>
              <Pips level={tension.walls} />
              <strong>{tension.walls}</strong>
            </div>
            <div className="match-lab__meter">
              <span>Score</span>
              <Pips level={tension.score} />
              <strong>{tension.score}</strong>
            </div>
            <div className="match-lab__meter">
              <span>Streak</span>
              <Pips level={tension.streak} />
              <strong>{tension.streak}</strong>
            </div>
          </div>
          <p className="match-lab__note" style={{ marginTop: '0.45rem' }}>
            Loudest mark wins, then holds 4 seconds. Chain 4 / 7 / 11 / 16.
            Walls any / 25% / 45% / 65%. Score 60 / 75 / 85 / 95. Streak 2 / 3 /
            5 / 8. Marks 1–4 are build, pressure, tension, critical.
          </p>
        </section>

        <section>
          <h2>Walls and score</h2>
          <label className="slider">
            <span>Wall inset {inset}</span>
            <input
              type="range"
              min={0}
              max={MAX_INSET}
              value={inset}
              disabled={ended || !mode.convergence}
              onChange={(event) => setWalls(Number(event.target.value))}
            />
          </label>
          {mode.convergence ? null : (
            <p className="match-lab__note">
              Walls do not close in {mode.label}.
            </p>
          )}
          <label className="slider">
            <span>White score share {Math.round(share * 100)}%</span>
            <input
              type="range"
              min={50}
              max={99}
              value={Math.round(share * 100)}
              disabled={ended}
              onChange={(event) => setScoreShare(Number(event.target.value) / 100)}
            />
          </label>
        </section>

        <section>
          <h2>One moment</h2>
          <div className="match-lab__actions">
            <button type="button" disabled={ended} onClick={eatOne}>
              Eat one step
            </button>
            <button type="button" disabled={ended} onClick={() => die('P1')}>
              White dies
            </button>
            <button type="button" disabled={ended} onClick={() => die('P2')}>
              Black dies
            </button>
            <button type="button" disabled={ended} onClick={fork}>
              Head-on FORK
            </button>
            <button
              type="button"
              disabled={ended || !mode.powerups}
              onClick={powerUp}
            >
              Power-up
            </button>
            <button type="button" disabled={!mode.block} onClick={block}>
              New block
            </button>
            <button type="button" onClick={countdown}>
              Countdown
            </button>
            {ended ? (
              <button type="button" onClick={resume}>
                Resume match
              </button>
            ) : (
              <button type="button" onClick={endMatch}>
                End match
              </button>
            )}
          </div>
        </section>

        <section>
          <h2>Play one sound</h2>
          <p className="match-lab__note">
            Each button plays that file by itself and stops the match mix.
            Grey rows do not happen in {mode.label}. Menus are outside the
            board, in every mode.
          </p>
          <button
            type="button"
            onClick={hearMix}
            style={{ margin: '0.45rem 0' }}
          >
            Hear the match mix
          </button>
          <ul className="match-lab__sounds">
            {SOLO_CLIPS.map((clip) => {
              const here = clip.inMode(mode);
              return (
                <li
                  key={clip.id}
                  className={here ? undefined : 'is-absent'}
                >
                  <button
                    type="button"
                    aria-pressed={soloId === clip.id}
                    onClick={() => playAlone(clip)}
                  >
                    {clip.name}
                  </button>
                  <span>
                    {clip.where}
                    {here ? '' : ' · not in this mode'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2>Effects and what you see</h2>
          <ul className="match-lab__causes">
            <li>
              <strong>P-FC clips</strong>
              <span>A chain eats. The clip steps up with the new length.</span>
            </li>
            <li>
              <strong>Tail grow</strong>
              <span>Same eat. The new tail block swells in over about half a second.</span>
            </li>
            <li>
              <strong>+ / − sats</strong>
              <span>The score moves. The numbers float off the two heads.</span>
            </li>
            <li>
              <strong>%</strong>
              <span>That eat also steps the capture tier, 2 to 4 to 8 to 16 to 32.</span>
            </li>
            <li>
              <strong>P1 / P2 HWAC</strong>
              <span>That snake dies and snaps back to its spawn cell.</span>
            </li>
            <li>
              <strong>FORK</strong>
              <span>Both snakes reset on the same tick while touching, one still short and one long.</span>
            </li>
            <li>
              <strong>Shrink cue</strong>
              <span>The border steps inward. The dead zone closes over the lost cells.</span>
            </li>
            <li>
              <strong>Beep1 / Beep2</strong>
              <span>Countdown shows 3, 2, 1, then LFG. Beep2 is only LFG.</span>
            </li>
            <li>
              <strong>powerup.mp3</strong>
              <span>A power-up on the board is taken. Drop one, then collect it.</span>
            </li>
            <li>
              <strong>Block</strong>
              <span>A new Bitcoin block, or the match speed changes. The board flashes.</span>
            </li>
            <li>
              <strong>End + menu</strong>
              <span>The match ends. One end cue, then the menu loop.</span>
            </li>
          </ul>
        </section>

        <section>
          <h2>Last events</h2>
          <div className="match-lab__log">
            {log.length === 0 ? (
              <p>Drag the board, or eat one step.</p>
            ) : (
              log.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
            )}
          </div>
        </section>
      </aside>
    </main>
  );
}
