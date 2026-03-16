import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Sponsorship } from '@/components/ui/Sponsorship';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useGamepad } from '@/hooks/useGamepad';
import { useAudio, SFX } from '@/contexts/AudioContext';
import '@/components/ui/Button.css';
import '@/components/ui/Sponsorship.css';
import '@/styles/pages/index.css';

type MenuState = 1 | 2 | 2.1 | 3 | 3.1 | 4 | 5;

export default function Index() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [menu, setMenu] = useState<MenuState>(2);
  const [hostName, setHostName] = useState<string>('@chainduel');
  const startPracticeRef = useRef<HTMLButtonElement>(null);
  const startGameRef = useRef<HTMLButtonElement>(null);
  const startGameNostrRef = useRef<HTMLButtonElement>(null);
  const startTournRef = useRef<HTMLButtonElement>(null);
  const startTournNostrRef = useRef<HTMLButtonElement>(null);
  const highscoresRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLButtonElement>(null);

  // Enable gamepad support
  useGamepad(true);

  // Load host name from localStorage
  useEffect(() => {
    const storedHostName = localStorage.getItem('hostName');
    if (storedHostName) {
      // Match legacy behavior: use stored value as-is, or default to @chainduel
      setHostName(storedHostName || '@chainduel');
    }
  }, []);

  // Update button animations based on menu state
  useEffect(() => {
    const updateAnimations = () => {
      if (startPracticeRef.current) {
        startPracticeRef.current.style.animationDuration =
          menu === 1 ? '2s' : '0s';
      }
      if (startGameRef.current) {
        startGameRef.current.style.animationDuration =
          menu === 2 ? '2s' : '0s';
      }
      if (startGameNostrRef.current) {
        startGameNostrRef.current.style.animationDuration =
          menu === 2.1 ? '2s' : '0s';
      }
      if (startTournRef.current) {
        startTournRef.current.style.animationDuration =
          menu === 3 ? '2s' : '0s';
      }
      if (startTournNostrRef.current) {
        startTournNostrRef.current.style.animationDuration =
          menu === 3.1 ? '2s' : '0s';
      }
      if (highscoresRef.current) {
        highscoresRef.current.style.animationDuration =
          menu === 4 ? '2s' : '0s';
      }
      if (aboutRef.current) {
        aboutRef.current.style.animationDuration = menu === 5 ? '2s' : '0s';
      }
    };

    updateAnimations();
  }, [menu]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        playSfx(SFX.MENU_CONFIRM);
        if (menu === 1) {
          navigate('/practicemenu');
        } else if (menu === 2) {
          navigate('/gamemenu');
        } else if (menu === 2.1) {
          navigate('/gamemenu?nostr=true');
        } else if (menu === 3) {
          navigate('/tournprefs');
        } else if (menu === 3.1) {
          navigate('/tournprefs?mode=tournamentnostr');
        } else if (menu === 4) {
          navigate('/highscores');
        } else if (menu === 5) {
          navigate('/about');
        }
      }

      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        event.preventDefault();
        if (menu === 1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(2);
        } else if (menu === 2) {
          playSfx(SFX.MENU_SELECT);
          setMenu(3);
        } else if (menu === 2.1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(3.1);
        } else if (menu === 3 || menu === 3.1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(4);
        } else if (menu === 4) {
          playSfx(SFX.MENU_SELECT);
          setMenu(5);
        }
      }

      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        event.preventDefault();
        if (menu === 2 || menu === 2.1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(1);
        } else if (menu === 3) {
          playSfx(SFX.MENU_SELECT);
          setMenu(2);
        } else if (menu === 3.1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(2.1);
        } else if (menu === 4) {
          playSfx(SFX.MENU_SELECT);
          setMenu(3);
        } else if (menu === 5) {
          playSfx(SFX.MENU_SELECT);
          setMenu(4);
        }
      }

      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        if (menu === 2) {
          playSfx(SFX.MENU_SELECT);
          setMenu(2.1);
        } else if (menu === 3) {
          playSfx(SFX.MENU_SELECT);
          setMenu(3.1);
        }
      }

      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        if (menu === 2.1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(2);
        } else if (menu === 3.1) {
          playSfx(SFX.MENU_SELECT);
          setMenu(3);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menu, navigate, playSfx]);

  return (
    <div className="flex full flex-center">
      <Sponsorship id="sponsorship-index" />

      <h1 id="chainduel">CHAIN DUEL</h1>
      <p id="slogan">KEEPING ONE BLOCK AHEAD</p>

      <div className="menu-buttons">
        <Button
          ref={startPracticeRef}
          id="startpractice"
          onClick={() => {
            playSfx(SFX.MENU_CONFIRM);
            navigate('/practicemenu');
          }}
        >
          PRACTICE
        </Button>

        <div className="double-button">
          <Button
            ref={startGameRef}
            id="startgame"
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              navigate('/gamemenu');
            }}
          >
            P2P
          </Button>
          <Button
            ref={startGameNostrRef}
            id="startgamenostr"
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              navigate('/gamemenu?nostr=true');
            }}
          >
            P2P NOSTR
          </Button>
        </div>

        <div className="double-button">
          <Button
            ref={startTournRef}
            id="starttourn"
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              navigate('/tournprefs');
            }}
          >
            TOURNAMENT
          </Button>
          <Button
            ref={startTournNostrRef}
            id="starttournnostr"
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              navigate('/tournprefs?mode=tournamentnostr');
            }}
          >
            TOURNAMENT NOSTR
          </Button>
        </div>

        <Button
          ref={highscoresRef}
          id="highscoresbutton"
          onClick={() => {
            playSfx(SFX.MENU_CONFIRM);
            navigate('/highscores');
          }}
        >
          HIGHSCORES
        </Button>

        <div className="double-button">
          <Button
            ref={aboutRef}
            id="aboutbutton"
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              navigate('/about');
            }}
          >
            ABOUT
          </Button>
          <Button
            className="disabled"
            onClick={() => {
              playSfx(SFX.MENU_CONFIRM);
              navigate('/config');
            }}
            id="highscoresbutton"
          >
            <span id="backendStatusHome" className="backend-status on">•</span>
            CONFIG
          </Button>
        </div>
      </div>

      <div id="bottomInfo">
        <p id="splits">
          <span id="split1">
            <b>2%</b> to the host ({hostName})
          </span>{' '}
          ·{' '}
          <span id="split2">
            <b>2%</b> to the developer (@BTCfrancis)
          </span>{' '}
          ·{' '}
          <span id="split3">
            <b>1%</b> to the designer (@bitcoinanatomy)
          </span>
        </p>
        <p id="version">Version 0.021 Beta — Support at t.me/chainduel</p>
      </div>

      <img
        id="announcement"
        style={{ display: 'none' }}
        src="/images/announcement/bitcoin2024_announcement_v2.png"
        alt="Announcement"
      />

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />
    </div>
  );
}
