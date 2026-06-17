export type ConfigTab = 'signin' | 'nwc' | 'gamepad';
export type LoginTab = 'extension' | 'nip46' | 'nsec';

export type ConfigFocus =
  | { kind: 'section'; index: number }
  | { kind: 'login'; index: number }
  | { kind: 'action' }
  | { kind: 'mainMenu' };

const SECTION_COUNT = 3;
const LOGIN_COUNT = 3;

export function sectionIndex(tab: ConfigTab): number {
  if (tab === 'nwc') return 1;
  if (tab === 'gamepad') return 2;
  return 0;
}

export function loginIndex(tab: LoginTab): number {
  if (tab === 'nip46') return 1;
  if (tab === 'nsec') return 2;
  return 0;
}

export function tabFromSectionIndex(index: number): ConfigTab {
  if (index === 1) return 'nwc';
  if (index === 2) return 'gamepad';
  return 'signin';
}

export function loginTabFromIndex(index: number): LoginTab {
  if (index === 1) return 'nip46';
  if (index === 2) return 'nsec';
  return 'extension';
}

function hasLoginRow(configTab: ConfigTab, signedIn: boolean): boolean {
  return configTab === 'signin' && !signedIn;
}

function hasActionRow(configTab: ConfigTab, signedIn: boolean): boolean {
  if (configTab === 'gamepad') return false;
  if (configTab === 'signin' && signedIn) return true;
  if (configTab === 'signin' && !signedIn) return true;
  if (configTab === 'nwc') return true;
  return false;
}

export function moveConfigFocus(
  focus: ConfigFocus,
  dir: 'up' | 'down' | 'left' | 'right',
  ctx: { configTab: ConfigTab; signedIn: boolean }
): ConfigFocus {
  const loginRow = hasLoginRow(ctx.configTab, ctx.signedIn);
  const actionRow = hasActionRow(ctx.configTab, ctx.signedIn);

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
    return focus;
  }

  if (dir === 'down') {
    if (focus.kind === 'section') {
      if (loginRow) return { kind: 'login', index: 0 };
      if (actionRow) return { kind: 'action' };
      return { kind: 'mainMenu' };
    }
    if (focus.kind === 'login') {
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
    if (loginRow) return { kind: 'login', index: 0 };
    return { kind: 'section', index: sectionIndex(ctx.configTab) };
  }
  if (focus.kind === 'action') {
    if (loginRow) return { kind: 'login', index: 0 };
    return { kind: 'section', index: sectionIndex(ctx.configTab) };
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
