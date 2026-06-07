export const CHALLENGE_ICON_IDS = [
  'normie',
  'stacker',
  'noderunner',
  'gauntlet',
  'ffa',
  'sovereign-stack',
] as const;

export type ChallengeIconId = (typeof CHALLENGE_ICON_IDS)[number];

export function isChallengeIconId(id: string): id is ChallengeIconId {
  return (CHALLENGE_ICON_IDS as readonly string[]).includes(id);
}

interface ChallengeRowIconProps {
  id: ChallengeIconId;
}

export function ChallengeRowIcon({ id }: ChallengeRowIconProps) {
  switch (id) {
    case 'normie':
      return (
        <svg className="sc-row__icon sc-row__icon--normie" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="sc-row__icon-part" cx="8.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.1" />
          <path className="sc-row__icon-part" d="M8.5 10.7v5.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle className="sc-row__icon-part" cx="15.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.1" />
          <path className="sc-row__icon-part" d="M15.5 10.7v5.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'stacker':
      return (
        <svg className="sc-row__icon sc-row__icon--stacker" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <ellipse className="sc-row__icon-part" cx="12" cy="17" rx="5.5" ry="1.6" stroke="currentColor" strokeWidth="1.1" />
          <ellipse className="sc-row__icon-part" cx="12" cy="13" rx="4.8" ry="1.4" stroke="currentColor" strokeWidth="1.1" />
          <ellipse className="sc-row__icon-part" cx="12" cy="9.2" rx="4" ry="1.2" stroke="currentColor" strokeWidth="1.1" />
          <path className="sc-row__icon-part" d="M12 5.5v2.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'noderunner':
      return (
        <svg className="sc-row__icon sc-row__icon--noderunner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="sc-row__icon-part" cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.1" />
          <path className="sc-row__icon-part" d="M12 4.5v5.1M12 14.4v5.1M4.5 12h5.1M14.4 12h5.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <circle className="sc-row__icon-part" cx="12" cy="4.5" r="1.1" fill="currentColor" />
          <circle className="sc-row__icon-part" cx="12" cy="19.5" r="1.1" fill="currentColor" />
          <circle className="sc-row__icon-part" cx="4.5" cy="12" r="1.1" fill="currentColor" />
          <circle className="sc-row__icon-part" cx="19.5" cy="12" r="1.1" fill="currentColor" />
        </svg>
      );
    case 'gauntlet':
      return (
        <svg className="sc-row__icon sc-row__icon--gauntlet" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            className="sc-row__icon-part"
            d="M12 3.5 L17.5 6.2 V11.8 C17.5 15.6 15.2 18.8 12 19.8 C8.8 18.8 6.5 15.6 6.5 11.8 V6.2 Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.1"
          />
          <path className="sc-row__icon-part" d="M12 7.5v5.8M9.2 10.4h5.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'ffa':
      return (
        <svg className="sc-row__icon sc-row__icon--ffa" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="sc-row__icon-part" cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.1" />
          <circle className="sc-row__icon-part" cx="17" cy="7" r="2" stroke="currentColor" strokeWidth="1.1" />
          <circle className="sc-row__icon-part" cx="7" cy="17" r="2" stroke="currentColor" strokeWidth="1.1" />
          <circle className="sc-row__icon-part" cx="17" cy="17" r="2" stroke="currentColor" strokeWidth="1.1" />
          <path className="sc-row__icon-part" d="M9 7.8h6M9 16.2h6M7.8 9v6M16.2 9v6" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
        </svg>
      );
    case 'sovereign-stack':
      return (
        <svg className="sc-row__icon sc-row__icon--sovereign" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            className="sc-row__icon-part"
            d="M5.5 9.5 L7.2 6.5 H9.5 L12 4 L14.5 6.5 H16.8 L18.5 9.5 V11 H5.5 Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path className="sc-row__icon-part" d="M6.5 11h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <path className="sc-row__icon-part" d="M12 13.5 L9.5 19 H14.5 Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path className="sc-row__icon-part" d="M12 13.5v2.2M10.8 16h2.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
