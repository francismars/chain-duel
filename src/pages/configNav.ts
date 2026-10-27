export type ConfigTab = 'signin' | 'nwc' | 'keyboard' | 'gamepad';
export type LoginTab = 'extension' | 'nip46' | 'nsec';

export type ConfigFocus =
  | { kind: 'section'; index: number }
  | { kind: 'login'; index: number }
  | { kind: 'nip46Inline'; index: number }
  | { kind: 'action' }
  | { kind: 'mainMenu' };

const SECTION_COUNT = 4;
const LOGIN_COUNT = 3;
const NIP46_INLINE_COUNT = 2;

export type ConfigNavContext = {
  configTab: ConfigTab;
  signedIn: boolean;
  loginTab: LoginTab;
  pendingNip46ServerLink: boolean;
};

function hasLoginRow(ctx: ConfigNavContext): boolean {
  return ctx.configTab === 'signin' && !ctx.signedIn;
}

function hasActionRow(ctx: ConfigNavContext): boolean {
  if (ctx.configTab === 'gamepad' || ctx.configTab === 'keyboard') return false;
  if (ctx.configTab === 'signin' && ctx.signedIn) return true;
  if (ctx.configTab === 'signin' && !ctx.signedIn) return true;
  if (ctx.configTab === 'nwc') return true;
  return false;
}

function hasNip46InlineRow(ctx: ConfigNavContext): boolean {
  return (
    ctx.configTab === 'signin' &&
    !ctx.signedIn &&
    ctx.loginTab === 'nip46' &&
    !ctx.pendingNip46ServerLink
  );
}

export function sectionIndex(tab: ConfigTab): number {
  if (tab === 'nwc') return 1;
  if (tab === 'keyboard') return 2;
  if (tab === 'gamepad') return 3;
  return 0;
}

export function loginIndex(tab: LoginTab): number {
  if (tab === 'nip46') return 1;
  if (tab === 'nsec') return 2;
  return 0;
}

export function tabFromSectionIndex(index: number): ConfigTab {
  if (index === 1) return 'nwc';
  if (index === 2) return 'keyboard';
  if (index === 3) return 'gamepad';
  return 'signin';
}

export function loginTabFromIndex(index: number): LoginTab {
  if (index === 1) return 'nip46';
  if (index === 2) return 'nsec';
  return 'extension';
}

export function moveConfigFocus(
  focus: ConfigFocus,
  dir: 'up' | 'down' | 'left' | 'right',
  ctx: ConfigNavContext
): ConfigFocus {
  const loginRow = hasLoginRow(ctx);
  const actionRow = hasActionRow(ctx);
  const nip46InlineRow = hasNip46InlineRow(ctx);

  if (dir === 'left' || dir === 'right') {
    const delta = dir === 'right' ? 1 : -1;
    if (focus.kind === 'section') {
      return {
        kind: 'section',
        index: (focus.index + delta + SECTION_COUNT) % SECTION_COUNT,
      };
    }
    if (focus.kind === 'login' && loginRow) {
      return {
        kind: 'login',
        index: (focus.index + delta + LOGIN_COUNT) % LOGIN_COUNT,
      };
    }
    if (focus.kind === 'nip46Inline' && nip46InlineRow) {
      return {
        kind: 'nip46Inline',
        index:
          (focus.index + delta + NIP46_INLINE_COUNT) % NIP46_INLINE_COUNT,
      };
    }
    return focus;
  }

  if (dir === 'down') {
    if (focus.kind === 'section') {
      if (loginRow) return { kind: 'login', index: 0 };
      if (actionRow) return { kind: 'action' };
      return { kind: 'mainMenu' };
    }
    if (focus.kind === 'login') {
      if (nip46InlineRow) return { kind: 'nip46Inline', index: 0 };
      if (actionRow) return { kind: 'action' };
      return { kind: 'mainMenu' };
    }
    if (focus.kind === 'nip46Inline') {
      if (actionRow) return { kind: 'action' };
      return { kind: 'mainMenu' };
    }
    if (focus.kind === 'action') {
      return { kind: 'mainMenu' };
    }
    return focus;
  }

  // up
  if (focus.kind === 'mainMenu') {
    if (actionRow) return { kind: 'action' };
    if (nip46InlineRow) return { kind: 'nip46Inline', index: 0 };
    if (loginRow) return { kind: 'login', index: loginIndex(ctx.loginTab) };
    return { kind: 'section', index: sectionIndex(ctx.configTab) };
  }
  if (focus.kind === 'action') {
    if (nip46InlineRow) return { kind: 'nip46Inline', index: 0 };
    if (loginRow) return { kind: 'login', index: loginIndex(ctx.loginTab) };
    return { kind: 'section', index: sectionIndex(ctx.configTab) };
  }
  if (focus.kind === 'nip46Inline') {
    return { kind: 'login', index: loginIndex(ctx.loginTab) };
  }
  if (focus.kind === 'login') {
    return { kind: 'section', index: sectionIndex(ctx.configTab) };
  }
  return focus;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}
