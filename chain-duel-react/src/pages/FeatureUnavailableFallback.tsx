import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';

interface FeatureUnavailableFallbackProps {
  title: string;
  subtitle: string;
}

export function FeatureUnavailableFallback({
  title,
  subtitle,
}: FeatureUnavailableFallbackProps) {
  const navigate = useNavigate();

  return (
    <div className="flex full flex-center">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>
      <h1 className="outline">{title}</h1>
      <p className="center grey mb-30">{subtitle}</p>
      <Button id="mainmenubutton" onClick={() => navigate('/')}>
        MAIN MENU
      </Button>
      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
