import { useEffect } from 'react';
import { useAudio } from '@/contexts/AudioContext';

export interface BackgroundAudioProps {
  src: string;
  loop?: boolean;
  autoplay?: boolean;
}

/**
 * BackgroundAudio component that uses global audio context
 * Music will continue playing across page navigation
 */
export function BackgroundAudio({
  src,
  loop = true,
  autoplay = true,
}: BackgroundAudioProps) {
  const { play } = useAudio();

  useEffect(() => {
    if (!autoplay) return;

    // Always try to play - the play function will check if it's already playing
    // This ensures audio starts even if isPlaying state hasn't updated yet
    play(src, loop);
  }, [src, loop, autoplay, play]);

  // No audio element needed - handled by AudioContext
  return null;
}
