import { useState } from 'react';
import './Sponsorship.css';

const SPONSORSHIP_SWITCH = true;
const HIDE_SPONSOR_INFO = false;

const sponsorText = 'Sponsored by';
const sponsorImage = '/images/sponsors/piratehash_animated.png';

export interface SponsorshipProps {
  id: string;
  className?: string;
  showLabel?: boolean;
}

export function Sponsorship({ id, className = '', showLabel = true }: SponsorshipProps) {
  const [show] = useState(SPONSORSHIP_SWITCH && !HIDE_SPONSOR_INFO);

  if (!show) {
    return null;
  }

  return (
    <div className={`sponsorship ${className}`} id={id}>
      {showLabel ? (
        <div className="sponsored-by-label" id={`sponsored-by-label-${id}`}>
          {sponsorText}
        </div>
      ) : null}
      <img src={sponsorImage} className="sponsored-img" alt="Sponsor" id={`sponsored-img-${id}`} />
    </div>
  );
}
