import P2pEntry from './P2pEntry';
import PracticeHub from './PracticeHub';
import GameMenu from './GameMenu';

export function P2pSettingsPreviewB() {
  return <P2pEntry flow="stepped" />;
}

export function FreePlaySettingsPreviewB() {
  return <PracticeHub flow="stepped" />;
}

export function P2pPaymentPreviewB() {
  return <GameMenu preview />;
}
