import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { navigateToMainMenu } from '@/shared/constants/menuNavigation';
import { BrandHeader } from '@/components/layout/BrandHeader';

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
      <BrandHeader />
      <h1 className="outline">{title}</h1>
      <p className="center grey mb-30">{subtitle}</p>
      <Button id="mainmenubutton" onClick={() => navigateToMainMenu(navigate)}>
        MAIN MENU
      </Button>
      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
