import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import '@/components/ui/Button.css';
import '@/styles/pages/onlineRoomLobby.css';

type OnlineJoinErrorPageProps = {
  title: string;
  detail?: string;
  roomCode?: string;
  backLabel?: string;
  onBack: () => void;
};

export function OnlineJoinErrorPage({
  title,
  detail,
  roomCode,
  backLabel = '← Back to Online',
  onBack,
}: OnlineJoinErrorPageProps) {
  return (
    <div className="online-lobby-page online-lobby-page--join-error">
      <header id="brand">
        <h2 id="chain">CHAIN</h2>
        <h2 id="duel">DUEL</h2>
      </header>

      <div className="online-lobby-main online-lobby-main--join-error">
        <Sponsorship id="sponsorship-online-join-error" />

        <div className="online-lobby-header">
          <h1 className="online-lobby-title">ONLINE ROOM</h1>
        </div>

        <div
          className="online-lobby-join-error-card"
          role="alert"
          aria-live="polite"
        >
          <svg
            className="online-lobby-room-error-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="online-lobby-room-error-title">{title}</p>
          {roomCode ? (
            <p className="online-lobby-join-error-code">
              Room code <b>{roomCode}</b> could not be loaded from this server.
            </p>
          ) : null}
          {detail ? (
            <p className="online-lobby-room-error-detail">{detail}</p>
          ) : null}
          <div className="online-lobby-btn-pop-wrap">
            <Button
              type="button"
              className="online-lobby-action"
              onClick={onBack}
            >
              {backLabel}
            </Button>
          </div>
        </div>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay />
    </div>
  );
}
