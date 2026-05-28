import type { RefObject } from 'react';

export type PracticeFreePlayPanelHandle = {
  startPractice: () => void;
  /** First focusable control in the setup panel. */
  focusDefault: () => void;
  /** Focus last setup control before the shared footer. */
  focusBeforeFooter: () => void;
};

export type PracticeChallengesPanelHandle = {
  launchSelected: () => void;
  focusDefault: () => void;
  focusBeforeFooter: () => void;
};

export type PracticeHubFooterRefs = {
  backRef: RefObject<HTMLButtonElement | null>;
  primaryRef: RefObject<HTMLButtonElement | null>;
};
