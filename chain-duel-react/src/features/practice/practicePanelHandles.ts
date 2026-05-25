import type { RefObject } from 'react';

export type PracticeFreePlayPanelHandle = {
  startPractice: () => void;
};

export type PracticeChallengesPanelHandle = {
  launchSelected: () => void;
};

export type PracticeHubFooterRefs = {
  backRef: RefObject<HTMLButtonElement | null>;
  primaryRef: RefObject<HTMLButtonElement | null>;
};
