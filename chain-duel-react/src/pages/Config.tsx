import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import {
  verifyNip05,
  formatPubkeyHex,
  type Kind0Profile,
} from '@/lib/nostr/fetchKind0Profile';
import { fetchProfileFromServer } from '@/lib/nostr/fetchProfileFromServer';
import { useNostrSession } from '@/contexts/NostrSessionContext';
import { useGamepad } from '@/hooks/useGamepad';
import { useSocket } from '@/hooks/useSocket';
import {
  CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM,
  clearMenuNavigationState,
  navigateToMainMenu,
  type MenuNavigationState,
} from '@/shared/constants/menuNavigation';
import type { AppNostrProfile } from '@/types/schemas';
import {
  beginNostrConnectPairing,
  clearSignerSession,
  connectNsecFromInput,
  disposeNostrConnectPairingAttempt,
  getStoredSignerMode,
  hasStoredNip46Session,
  isNsecSessionMissing,
  recoverNip46UserPubkey,
  recordExtensionSignIn,
  setNip46AuthUrlHandler,
  STORED_NOSTR_PUBKEY_KEY,
  type StoredSignerMode,
} from '@/lib/nostr/signerSession';
import {
  getNwcUri,
  setNwcUri,
  clearNwcUri,
  parseNwcUri,
} from '@/lib/nostr/nwcPay';
import { GamepadTester } from '@/features/config/GamepadTester';
import {
  type ConfigFocus,
  type ConfigTab,
  type LoginTab,
  isTypingTarget,
  loginTabFromIndex,
  moveConfigFocus,
  tabFromSectionIndex,
} from './configNav';
import './config.css';

function signerModeLabel(mode: StoredSignerMode | null): string {
  if (mode === 'nip46') return 'Nostr Connect';
  if (mode === 'nsec') return 'nsec (this tab)';
  if (mode === 'extension') return 'Browser extension';
  return 'Nostr';
}

function appProfileToKind0(p: AppNostrProfile): Kind0Profile {
  return {
    displayTitle: p.name || 'Nostr user',
    name: p.name,
    displayName: p.name,
    picture: p.picture ?? null,
    banner: null,
    nip05: p.nip05 ?? null,
    lud16: p.lud16 ?? null,
    lud06: p.lud06 ?? null,
    about: null,
    eventCreatedAt: 0,
  };
}

type ConfigLocationState = { returnTo?: string };

function kbdFocus(active: boolean): string {
  return active ? ' config-kbd-focus' : '';
}

export default function Config() {
  const navigate = useNavigate();
  const location = useLocation();
  const suppressNextMenuConfirmRef = useRef(
    Boolean(
      (location.state as MenuNavigationState | null)?.[
        CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM
      ]
    )
  );
  const returnTo =
    (location.state as ConfigLocationState | null)?.returnTo ??
    new URLSearchParams(location.search).get('returnTo') ??
    null;
  const { playSfx } = useAudio();
  const { socket } = useSocket({ autoConnect: true });
  const {
    linkToServer,
    signOut: signOutNostrSession,
    linking: serverLinking,
    signedIn: nostrSignedIn,
    pubkey: sessionPubkey,
    linkError: serverLinkError,
    displayName: sessionDisplayName,
    picture: sessionPicture,
    nip05: sessionNip05,
    lud16: sessionLud16,
    lud06: sessionLud06,
    signerMode: sessionSignerMode,
  } = useNostrSession();
  const [nostrPubkeyHex, setNostrPubkeyHex] = useState<string | null>(null);
  const [nostrBusy, setNostrBusy] = useState(false);
  const [nostrError, setNostrError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Kind0Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileRecovering, setProfileRecovering] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [nip05Ok, setNip05Ok] = useState<boolean | null>(null);
  const [nip05CheckPending, setNip05CheckPending] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>('signin');
  const [loginTab, setLoginTab] = useState<LoginTab>('extension');
  const [navFocus, setNavFocus] = useState<ConfigFocus>({
    kind: 'section',
    index: 0,
  });
  const [nsecInput, setNsecInput] = useState('');
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const [nip46Waiting, setNip46Waiting] = useState(false);
  const [pairingPhase, setPairingPhase] = useState<
    'scanning' | 'handshake' | 'resolving'
  >('scanning');
  const [pairingKey, setPairingKey] = useState(0);
  const [uriCopied, setUriCopied] = useState(false);
  const [profileAnimKey, setProfileAnimKey] = useState(0);
  const [nwcInput, setNwcInput] = useState(() => getNwcUri() ?? '');
  const [nwcSaved, setNwcSaved] = useState(() => Boolean(getNwcUri()));
  const [nwcError, setNwcError] = useState<string | null>(null);
  const nip46PairingDoneRef = useRef(false);
  const nip46PairingAbortRef = useRef<AbortController | null>(null);
  const nip46ResumeLinkRef = useRef(false);
  const playSfxRef = useRef(playSfx);
  const profileCardMainRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const nwcSaveRef = useRef<HTMLButtonElement | null>(null);
  const nwcDisconnectRef = useRef<HTMLButtonElement | null>(null);
  const nip46RegenRef = useRef<HTMLButtonElement | null>(null);
  playSfxRef.current = playSfx;

  useGamepad(configTab !== 'gamepad');

  useEffect(() => {
    if (isNsecSessionMissing()) {
      clearSignerSession();
      setNostrPubkeyHex(null);
      setNostrError(
        'nsec sign-in is limited to this browser tab. After a refresh, sign in again.'
      );
    }
  }, []);

  useEffect(() => {
    if (nostrSignedIn && sessionPubkey) {
      setNostrPubkeyHex(sessionPubkey);
      return;
    }
    if (!nostrSignedIn) {
      setNostrPubkeyHex(null);
      setProfile(null);
    }
  }, [nostrSignedIn, sessionPubkey]);

  useEffect(() => {
    setNip46AuthUrlHandler((url) => setPendingAuthUrl(url));
    return () => setNip46AuthUrlHandler(null);
  }, []);

  // Primal/NIP-46 pairing is done locally; finish by linking pubkey to the socket session on marspay.
  useEffect(() => {
    if (nostrSignedIn || serverLinking || nostrBusy) {
      return;
    }
    if (configTab !== 'signin' || loginTab !== 'nip46' || !hasStoredNip46Session()) {
      return;
    }
    if (!socket?.connected) {
      return;
    }
    if (nip46ResumeLinkRef.current) {
      return;
    }
    nip46ResumeLinkRef.current = true;

    setNostrBusy(true);
    setNostrError(null);
    void (async () => {
      try {
        const recovered = await recoverNip46UserPubkey();
        if (recovered) {
          localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, recovered);
        }
        await linkToServer('nip46');
        playSfxRef.current(SFX.MENU_CONFIRM);
        if (returnTo) {
          navigate(returnTo, { replace: true });
        }
      } catch (e) {
        setNostrError(
          e instanceof Error
            ? e.message
            : 'Could not link Nostr identity to game server.'
        );
      } finally {
        setNostrBusy(false);
      }
    })();
  }, [
    configTab,
    loginTab,
    nostrSignedIn,
    serverLinking,
    nostrBusy,
    socket?.connected,
    linkToServer,
    navigate,
    returnTo,
  ]);

  useEffect(() => {
    if (nostrSignedIn || serverLinking) {
      return;
    }
    if (hasStoredNip46Session()) {
      return;
    }
    if (configTab !== 'signin' || loginTab !== 'nip46') {
      return;
    }

    nip46PairingDoneRef.current = false;
    setNostrError(null);
    setNostrConnectUri(null);
    setNip46Waiting(true);
    setPairingPhase('scanning');
    setUriCopied(false);

    let cancelled = false;
    const scheduleId = window.setTimeout(() => {
      if (cancelled) return;

      const ac = new AbortController();
      nip46PairingAbortRef.current = ac;

      const { connectionURI, finished } = beginNostrConnectPairing({
        signal: ac.signal,
        appName: 'Chain Duel',
        onHandshake: () => setPairingPhase('resolving'),
      });
      setNostrConnectUri(connectionURI);

      void finished
        .then(async (pk) => {
          nip46PairingDoneRef.current = true;
          nip46ResumeLinkRef.current = true;
          setNostrBusy(true);
          setNostrError(null);
          try {
            localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pk.toLowerCase());
            await linkToServer('nip46');
            playSfxRef.current(SFX.MENU_CONFIRM);
            if (returnTo) {
              navigate(returnTo, { replace: true });
            }
          } catch (e) {
            setNostrError(
              e instanceof Error
                ? e.message
                : 'Could not link Nostr identity to game server.'
            );
            setPairingPhase('scanning');
          } finally {
            setNostrBusy(false);
          }
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) {
            return;
          }
          setPairingPhase('scanning');
          const msg = e instanceof Error ? e.message : String(e);
          if (/subscription closed|aborted|AbortError/i.test(msg)) {
            setNostrError(
              'Timed out or cancelled before your signer connected. Generate a new QR and try again.'
            );
          } else {
            setNostrError(msg || 'Nostr Connect pairing failed.');
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) {
            setNip46Waiting(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(scheduleId);
      const ac = nip46PairingAbortRef.current;
      nip46PairingAbortRef.current = null;
      ac?.abort();
      if (!nip46PairingDoneRef.current) {
        disposeNostrConnectPairingAttempt();
      }
    };
  }, [
    configTab,
    loginTab,
    nostrSignedIn,
    serverLinking,
    pairingKey,
    linkToServer,
    navigate,
    returnTo,
  ]);

  useEffect(() => {
    setAvatarBroken(false);
    setNip05Ok(null);
    setNip05CheckPending(false);
    if (!nostrSignedIn || !sessionPubkey) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileAnimKey((k) => k + 1);
    void (async () => {
      let pubkey = sessionPubkey;
      let p: Kind0Profile | null = null;
      if (sessionDisplayName || sessionPicture || sessionNip05) {
        p = appProfileToKind0({
          pubkey,
          name: sessionDisplayName ?? '',
          picture: sessionPicture,
          nip05: sessionNip05,
          lud16: sessionLud16,
          lud06: sessionLud06,
        });
      }
      if (socket?.connected) {
        const appP = await fetchProfileFromServer(socket, pubkey);
        if (appP) {
          p = appProfileToKind0(appP);
        }
      }

      if (!p && !cancelled && getStoredSignerMode() === 'nip46') {
        setProfileRecovering(true);
        const recovered = await recoverNip46UserPubkey();
        if (!cancelled) setProfileRecovering(false);
        if (recovered && !cancelled) {
          pubkey = recovered;
          if (socket?.connected) {
            const appP2 = await fetchProfileFromServer(socket, recovered);
            if (appP2) {
              p = appProfileToKind0(appP2);
            }
          }
        }
      }

      if (cancelled) return;
      setProfile(p);
      setProfileLoading(false);
      if (pubkey !== sessionPubkey) {
        setNostrPubkeyHex(pubkey);
      }

      if (p?.nip05) {
        setNip05CheckPending(true);
        const ok = await verifyNip05(pubkey, p.nip05);
        if (cancelled) return;
        setNip05Ok(ok);
        setNip05CheckPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    nostrSignedIn,
    sessionPubkey,
    sessionDisplayName,
    sessionPicture,
    sessionNip05,
    sessionLud16,
    sessionLud06,
    socket,
  ]);

  const finishSignIn = useCallback(
    async (pubkey: string, mode: StoredSignerMode) => {
      setNostrBusy(true);
      setNostrError(null);
      try {
        localStorage.setItem(STORED_NOSTR_PUBKEY_KEY, pubkey.toLowerCase());
        await linkToServer(mode);
        playSfx(SFX.MENU_CONFIRM);
        if (returnTo) {
          navigate(returnTo, { replace: true });
        }
      } catch (e) {
        setNostrError(
          e instanceof Error
            ? e.message
            : 'Could not link Nostr identity to game server.'
        );
      } finally {
        setNostrBusy(false);
      }
    },
    [linkToServer, navigate, playSfx, returnTo]
  );

  const handleExtensionSignIn = useCallback(async () => {
    if (!window.nostr) {
      setNostrError(
        'No Nostr extension found. Install Alby, nos2x, or another NIP-07 extension.'
      );
      return;
    }
    setNostrBusy(true);
    setNostrError(null);
    setPendingAuthUrl(null);
    try {
      const pubkey = await window.nostr.getPublicKey();
      recordExtensionSignIn(pubkey);
      await finishSignIn(pubkey, 'extension');
    } catch {
      setNostrError('Extension declined or sign-in was cancelled.');
      setNostrBusy(false);
    }
  }, [finishSignIn]);

  const copyNostrConnectUri = useCallback(() => {
    if (!nostrConnectUri) return;
    void navigator.clipboard.writeText(nostrConnectUri).then(() => {
      setUriCopied(true);
      window.setTimeout(() => setUriCopied(false), 2000);
    });
  }, [nostrConnectUri]);

  const handleNsecSignIn = useCallback(async () => {
    setNostrBusy(true);
    setNostrError(null);
    try {
      const pubkey = await connectNsecFromInput(nsecInput);
      setNsecInput('');
      await finishSignIn(pubkey, 'nsec');
    } catch (e) {
      setNostrError(
        e instanceof Error ? e.message : 'Invalid nsec or hex key.'
      );
      setNostrBusy(false);
    }
  }, [nsecInput, finishSignIn]);

  const handleNostrSignOut = useCallback(() => {
    nip46ResumeLinkRef.current = false;
    nip46PairingDoneRef.current = false;
    signOutNostrSession();
    setNostrPubkeyHex(null);
    setProfile(null);
    setNostrError(null);
    setNip05Ok(null);
    setPendingAuthUrl(null);
    playSfx(SFX.MENU_CONFIRM);
  }, [playSfx, signOutNostrSession]);

  /** Clear local NIP-46 pairing when server link failed (Primal connected but not signed in). */
  const handleDisconnectPrimal = useCallback(() => {
    nip46PairingAbortRef.current?.abort();
    handleNostrSignOut();
    setPairingKey((k) => k + 1);
  }, [handleNostrSignOut]);

  const openPendingAuth = useCallback(() => {
    if (!pendingAuthUrl) return;
    window.open(pendingAuthUrl, '_blank', 'noopener,noreferrer');
  }, [pendingAuthUrl]);

  const signerMode = nostrSignedIn
    ? (sessionSignerMode ?? getStoredSignerMode())
    : getStoredSignerMode();
  const pendingNip46ServerLink =
    !nostrSignedIn &&
    hasStoredNip46Session() &&
    getStoredSignerMode() === 'nip46';
  const avatarSrc =
    !avatarBroken && profile?.picture?.trim() ? profile.picture.trim() : null;

  const activateConfigNav = useCallback(() => {
    if (navFocus.kind === 'section') {
      setConfigTab(tabFromSectionIndex(navFocus.index));
      return;
    }
    if (navFocus.kind === 'login') {
      setLoginTab(loginTabFromIndex(navFocus.index));
      return;
    }
    if (navFocus.kind === 'mainMenu') {
      if (!returnTo || returnTo === '/') {
        navigateToMainMenu(navigate);
      } else {
        navigate(returnTo);
      }
      return;
    }
    if (navFocus.kind === 'action') {
      if (configTab === 'signin' && nostrSignedIn) {
        handleNostrSignOut();
        return;
      }
      if (configTab === 'signin' && loginTab === 'extension') {
        void handleExtensionSignIn();
        return;
      }
      if (configTab === 'signin' && loginTab === 'nsec') {
        void handleNsecSignIn();
        return;
      }
      if (configTab === 'signin' && loginTab === 'nip46') {
        nip46RegenRef.current?.click();
        return;
      }
      if (configTab === 'nwc') {
        if (nwcSaved) {
          nwcDisconnectRef.current?.click();
        } else {
          nwcSaveRef.current?.click();
        }
      }
    }
  }, [
    navFocus,
    configTab,
    loginTab,
    nostrSignedIn,
    nwcSaved,
    returnTo,
    navigate,
    handleNostrSignOut,
    handleExtensionSignIn,
    handleNsecSignIn,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const isConfirm =
        e.key === 'Enter' || e.key === ' ' || e.code === 'NumpadEnter';
      const isUp =
        e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      const isDown =
        e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
      const isLeft =
        e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
      const isRight =
        e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';

      if (!isConfirm && !isUp && !isDown && !isLeft && !isRight) return;

      if (isConfirm) {
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        if (suppressNextMenuConfirmRef.current) {
          suppressNextMenuConfirmRef.current = false;
          e.preventDefault();
          clearMenuNavigationState(navigate, location);
          return;
        }
        e.preventDefault();
        playSfxRef.current(SFX.MENU_CONFIRM);
        activateConfigNav();
        return;
      }

      e.preventDefault();
      playSfxRef.current(SFX.MENU_SELECT);
      const dir = isUp ? 'up' : isDown ? 'down' : isLeft ? 'left' : 'right';
      setNavFocus((prev) => {
        const next = moveConfigFocus(prev, dir, {
          configTab,
          signedIn: nostrSignedIn,
        });
        if (next.kind === 'section' && (dir === 'left' || dir === 'right')) {
          setConfigTab(tabFromSectionIndex(next.index));
        }
        if (next.kind === 'login' && (dir === 'left' || dir === 'right')) {
          setLoginTab(loginTabFromIndex(next.index));
        }
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activateConfigNav,
    configTab,
    nostrSignedIn,
    navigate,
    location,
  ]);

  const retryNip46ServerLink = useCallback(() => {
    setNostrError(null);
    nip46ResumeLinkRef.current = true;
    setNostrBusy(true);
    void (async () => {
      try {
        await recoverNip46UserPubkey();
        await linkToServer('nip46');
        playSfx(SFX.MENU_CONFIRM);
        if (returnTo) {
          navigate(returnTo, { replace: true });
        }
      } catch (e) {
        setNostrError(
          e instanceof Error
            ? e.message
            : 'Could not link Nostr identity to game server.'
        );
      } finally {
        setNostrBusy(false);
      }
    })();
  }, [linkToServer, navigate, playSfx, returnTo]);

  return (
    <div className="flex full flex-center config-page">
      <div className="config-shell">
        <p className="page-title label">Config</p>

        <div
          className="config-section-tabs"
          role="tablist"
          aria-label="Config sections"
        >
        <button
          type="button"
          role="tab"
          aria-selected={configTab === 'signin'}
          className={`config-section-tab${configTab === 'signin' ? ' config-section-tab--active' : ''}${kbdFocus(navFocus.kind === 'section' && navFocus.index === 0)}`}
          onClick={() => {
            setConfigTab('signin');
            setNavFocus({ kind: 'section', index: 0 });
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={configTab === 'nwc'}
          className={`config-section-tab${configTab === 'nwc' ? ' config-section-tab--active' : ''}${kbdFocus(navFocus.kind === 'section' && navFocus.index === 1)}`}
          onClick={() => {
            setConfigTab('nwc');
            setNavFocus({ kind: 'section', index: 1 });
          }}
        >
          Wallet (NWC)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={configTab === 'gamepad'}
          className={`config-section-tab${configTab === 'gamepad' ? ' config-section-tab--active' : ''}${kbdFocus(navFocus.kind === 'section' && navFocus.index === 2)}`}
          onClick={() => {
            setConfigTab('gamepad');
            setNavFocus({ kind: 'section', index: 2 });
          }}
        >
          Gamepad
        </button>
        </div>

        <div className="config-panel">
      {configTab === 'signin' && !nostrSignedIn ? (
        <>
          <p className="config-panel__lede">
            Choose a sign-in method. We link your pubkey to this game session
            and load your profile.
          </p>
          {nostrError ? (
            <p className="config-nostr-error">{nostrError}</p>
          ) : null}
          {serverLinkError && !nostrError ? (
            <p className="config-nostr-error">{serverLinkError}</p>
          ) : null}

          {pendingNip46ServerLink ? (
            <div className="config-nip46-auth-banner" role="status">
              <p className="config-nip46-auth-banner__text">
                {nostrBusy || serverLinking ? (
                  <>
                    Signer connected.{' '}
                    <strong>Linking to the game server…</strong>
                    {signerMode === 'nip46' ? (
                      <>
                        {' '}
                        Approve the sign request in your signer app if prompted.
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    Signer connected. We could not finish linking to the game
                    server — check that marspay is running, then retry, or
                    disconnect to scan a new QR.
                  </>
                )}
              </p>
              <div className="config-nip46-auth-banner__actions">
                <Button
                  type="button"
                  onClick={retryNip46ServerLink}
                  disabled={nostrBusy || serverLinking}
                >
                  {nostrBusy || serverLinking ? 'Linking…' : 'Retry link'}
                </Button>
                <Button
                  type="button"
                  className="config-nip46-auth-banner__btn--secondary"
                  onClick={handleDisconnectPrimal}
                  disabled={nostrBusy || serverLinking}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : null}

          {serverLinking && !pendingNip46ServerLink ? (
            <p
              className="config-nostr-hint config-nostr-hint--linking"
              role="status"
            >
              Linking to game server… Complete the signing prompt if your wallet
              shows one.
            </p>
          ) : null}

          {pendingAuthUrl ? (
            <div className="config-nip46-auth-banner" role="status">
              <p className="config-nip46-auth-banner__text">
                Your signer is asking for approval in another app.
              </p>
              <Button
                type="button"
                className="config-nip46-auth-banner__btn"
                onClick={openPendingAuth}
              >
                Open approval page
              </Button>
            </div>
          ) : null}

          <div
            className="config-login-tabs"
            role="tablist"
            aria-label="Sign-in method"
          >
            <button
              type="button"
              role="tab"
              aria-selected={loginTab === 'extension'}
              className={`config-login-tab${loginTab === 'extension' ? ' config-login-tab--active' : ''}${kbdFocus(navFocus.kind === 'login' && navFocus.index === 0)}`}
              onClick={() => {
                setLoginTab('extension');
                setNavFocus({ kind: 'login', index: 0 });
                setNostrError(null);
              }}
            >
              Extension
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginTab === 'nip46'}
              className={`config-login-tab${loginTab === 'nip46' ? ' config-login-tab--active' : ''}${kbdFocus(navFocus.kind === 'login' && navFocus.index === 1)}`}
              onClick={() => {
                setLoginTab('nip46');
                setNavFocus({ kind: 'login', index: 1 });
                setNostrError(null);
              }}
            >
              Nostr Connect
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginTab === 'nsec'}
              className={`config-login-tab${loginTab === 'nsec' ? ' config-login-tab--active' : ''}${kbdFocus(navFocus.kind === 'login' && navFocus.index === 2)}`}
              onClick={() => {
                setLoginTab('nsec');
                setNavFocus({ kind: 'login', index: 2 });
                setNostrError(null);
              }}
            >
              nsec
            </button>
          </div>

          <div className="config-login-panel">
            {loginTab === 'extension' ? (
              <div
                className="config-login-panel__block config-login-panel__block--center"
                role="tabpanel"
              >
                <p className="config-login-panel__lede config-login-panel__lede--muted">
                  NIP-07 · Alby, nos2x, and other browser extensions
                </p>
                <div className="config-page__actions config-page__actions--inline config-page__actions--fill">
                  <Button
                    id="nostrSignInExtension"
                    type="button"
                    className={kbdFocus(navFocus.kind === 'action').trim()}
                    onClick={() => {
                      void handleExtensionSignIn();
                    }}
                    disabled={nostrBusy || serverLinking}
                  >
                    {nostrBusy ? 'Waiting…' : 'Sign in with extension'}
                  </Button>
                </div>
              </div>
            ) : null}

            {loginTab === 'nip46' && !pendingNip46ServerLink ? (
              <div className="config-login-panel__block" role="tabpanel">
                <p className="config-login-panel__lede config-nc-lede">
                  NIP-46: scan QR or open the link in your signer app — Amber,
                  Amethyst, etc.
                </p>

                <div className="config-nc-layout">
                  {pairingPhase === 'resolving' ? (
                    <div className="config-nc-resolving" role="status">
                      <svg
                        className="config-nc-resolving__spinner"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                      <p className="config-nc-resolving__text">
                        Signer detected — resolving identity…
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="config-nc-layout__qr">
                        <div className="config-nc-qr-wrap">
                          {nostrConnectUri ? (
                            <QRCodeSVG
                              value={nostrConnectUri}
                              size={148}
                              includeMargin
                              className="config-nc-qr"
                              aria-label="Nostr Connect URI QR code"
                            />
                          ) : (
                            <div
                              className="config-nc-qr config-nc-qr--placeholder"
                              aria-hidden
                            />
                          )}
                        </div>
                      </div>
                      <div className="config-nc-layout__col">
                        <a
                          className="config-nc-signer-btn"
                          href={nostrConnectUri ?? undefined}
                          onClick={(e) => {
                            if (!nostrConnectUri) e.preventDefault();
                          }}
                        >
                          Open in signer app
                        </a>
                        <p className="config-nc-waiting" role="status">
                          {nip46Waiting ? (
                            <>
                              <span className="config-nc-spinner" aria-hidden />
                              Waiting for connection…
                            </>
                          ) : (
                            <>
                              Approve in your wallet when prompted.
                              <span className="config-nc-hint-muted">
                                {' '}
                                Amber · Amethyst · NIP-46
                              </span>
                            </>
                          )}
                        </p>
                        <div className="config-nc-uri-row">
                          <code
                            className="config-nc-uri-text"
                            title={nostrConnectUri ?? ''}
                          >
                            {nostrConnectUri
                              ? `${nostrConnectUri.slice(0, 40)}${nostrConnectUri.length > 40 ? '…' : ''}`
                              : '…'}
                          </code>
                          <button
                            type="button"
                            className="config-nc-copy-btn"
                            onClick={copyNostrConnectUri}
                            disabled={!nostrConnectUri}
                            aria-label={
                              uriCopied ? 'Copied' : 'Copy connection URI'
                            }
                          >
                            {uriCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="config-page__actions config-page__actions--inline config-page__actions--regen">
                  <Button
                    ref={nip46RegenRef}
                    type="button"
                    className={`config-nc-regen-btn${kbdFocus(
                      navFocus.kind === 'action' &&
                        configTab === 'signin' &&
                        loginTab === 'nip46' &&
                        !pendingNip46ServerLink
                    )}`}
                    onClick={() => {
                      nip46PairingAbortRef.current?.abort();
                      clearSignerSession();
                      nip46ResumeLinkRef.current = false;
                      setNostrError(null);
                      setPairingKey((k) => k + 1);
                    }}
                  >
                    New QR code
                  </Button>
                </div>
              </div>
            ) : null}

            {loginTab === 'nsec' ? (
              <div className="config-login-panel__block" role="tabpanel">
                <p className="config-nostr-warning">
                  Pasting an <strong>nsec</strong> gives this site the ability
                  to sign as you. Only use on a device you trust. The key is
                  kept in <strong>session memory</strong> only (lost when the
                  tab closes); it is not saved to disk.
                </p>
                <label
                  className="config-login-panel__label"
                  htmlFor="configNsecInput"
                >
                  nsec1… or 64-char hex
                </label>
                <input
                  id="configNsecInput"
                  className="config-login-panel__input"
                  type="password"
                  value={nsecInput}
                  onChange={(e) => setNsecInput(e.target.value)}
                  placeholder="nsec1…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="config-page__actions config-page__actions--inline">
                  <Button
                    id="nostrSignInNsec"
                    type="button"
                    className={kbdFocus(navFocus.kind === 'action').trim()}
                    onClick={() => {
                      void handleNsecSignIn();
                    }}
                    disabled={nostrBusy || serverLinking || !nsecInput.trim()}
                  >
                    {nostrBusy ? 'Unlocking…' : 'Sign in with nsec'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {configTab === 'signin' && nostrSignedIn && profileLoading ? (
        <div
          className="config-profile-card config-profile-skeleton"
          aria-busy="true"
          aria-label="Loading profile"
        >
          <div className="config-profile-skeleton__banner" />
          <div className="config-profile-skeleton__main">
            <div className="config-profile-skeleton__avatar" aria-hidden>
              <span className="config-profile-skeleton__ring" />
              <span className="config-profile-skeleton__ring config-profile-skeleton__ring--2" />
            </div>
            <p className="config-profile-loading-text">
              {profileRecovering
                ? 'VERIFYING IDENTITY… APPROVE IN SIGNER'
                : 'LOADING PROFILE'}
            </p>
          </div>
        </div>
      ) : null}

      {configTab === 'signin' && nostrSignedIn && !profileLoading ? (
        <div
          key={profileAnimKey}
          className="config-profile-card config-profile-card--animate-in"
        >
          {pendingAuthUrl ? (
            <div
              className="config-nip46-auth-banner config-nip46-auth-banner--card"
              role="status"
            >
              <p className="config-nip46-auth-banner__text">
                Approval needed in your remote signer.
              </p>
              <Button
                type="button"
                className="config-nip46-auth-banner__btn"
                onClick={openPendingAuth}
              >
                Open approval page
              </Button>
            </div>
          ) : null}
          <div
            className="config-profile-card__banner"
            style={
              profile?.banner
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,1) 100%), url(${profile.banner})`,
                  }
                : undefined
            }
          />
          <div
            className="config-profile-card__main"
            tabIndex={0}
            ref={profileCardMainRef}
          >
            <div className="config-profile-card__identity">
              {avatarSrc ? (
                <img
                  className="config-profile-card__avatar"
                  src={avatarSrc}
                  alt=""
                  width={88}
                  height={88}
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                <div
                  className="config-profile-card__avatar config-profile-card__avatar--placeholder"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              )}
              <div className="config-profile-card__titles">
                <h2 className="config-profile-card__name">
                  {profile?.displayTitle ?? 'Nostr user'}
                </h2>
              </div>
            </div>

            <div className="config-profile-card__detail-col config-profile-card__detail-col--below">
              <div className="config-profile-card__body">
                {profile?.about ? (
                  <p className="config-profile-card__about">{profile.about}</p>
                ) : null}

                <div className="config-profile-card__fields">
                  {profile?.name && profile.displayName ? (
                    <div className="config-profile-card__field" tabIndex={-1}>
                      <div className="config-profile-card__field-label">
                        Username
                      </div>
                      <div className="config-profile-card__field-value">
                        @{profile.name}
                      </div>
                    </div>
                  ) : null}

                  <div className="config-profile-card__field" tabIndex={-1}>
                    <div className="config-profile-card__field-label">
                      Sign-in
                    </div>
                    <div className="config-profile-card__field-value">
                      {signerModeLabel(signerMode)}
                      <svg
                        className="config-field-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                  </div>

                  {profile?.nip05 ? (
                    <div className="config-profile-card__field" tabIndex={-1}>
                      <div className="config-profile-card__field-label">
                        NIP-05
                      </div>
                      <div className="config-profile-card__field-value">
                        <span className="config-profile-card__nip05-text">
                          {profile.nip05}
                        </span>
                        {nip05CheckPending ? (
                          <svg
                            className="config-field-icon config-field-icon--spin"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-label="Checking…"
                          >
                            <path d="M12 2a10 10 0 0 1 10 10" />
                          </svg>
                        ) : nip05Ok === true ? (
                          <svg
                            className="config-field-icon config-field-icon--ok"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label="Verified"
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        ) : nip05Ok === false ? (
                          <svg
                            className="config-field-icon config-field-icon--fail"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label="Unverified"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {profile?.lud16 ? (
                    <div className="config-profile-card__field" tabIndex={-1}>
                      <div className="config-profile-card__field-label">
                        Lightning
                      </div>
                      <div className="config-profile-card__field-value config-profile-card__field-value--ln">
                        {profile.lud16}
                        <svg
                          className="config-field-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </div>
                    </div>
                  ) : null}

                  {profile?.lud06 && !profile?.lud16 ? (
                    <div className="config-profile-card__field" tabIndex={-1}>
                      <div className="config-profile-card__field-label">
                        Lightning
                      </div>
                      <div
                        className="config-profile-card__field-value config-profile-card__field-value--lnurl"
                        title={profile.lud06}
                      >
                        LNURL-pay (kind 0)
                        <svg
                          className="config-field-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </div>
                    </div>
                  ) : null}

                  <div className="config-profile-card__field" tabIndex={-1}>
                    <div className="config-profile-card__field-label">
                      Public key
                    </div>
                    <div className="config-profile-card__field-value config-profile-card__field-value--mono">
                      {nostrPubkeyHex ? formatPubkeyHex(nostrPubkeyHex) : ''}
                      <svg
                        className="config-field-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect
                          x="3"
                          y="11"
                          width="18"
                          height="11"
                          rx="2"
                          ry="2"
                        />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              {/* config-profile-card__body */}

              {!profile ? (
                <p className="config-profile-card__empty">
                  {signerMode === 'nip46'
                    ? 'Profile not loaded yet. If your signer shows a signing prompt, tap Allow — then refresh this page.'
                    : 'No profile metadata on file yet. You can still use this pubkey; publish a profile from any Nostr client.'}
                </p>
              ) : null}

              {signerMode === 'nip46' ? (
                <div
                  className="config-signer-ping config-signer-ping--ok"
                  role="status"
                >
                  <span className="config-signer-ping__text">
                    Signer connected
                  </span>
                </div>
              ) : null}

              <div className="config-profile-card__actions">
                <Button
                  id="nostrSignOut"
                  type="button"
                  className={kbdFocus(navFocus.kind === 'action').trim()}
                  onClick={handleNostrSignOut}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {configTab === 'nwc' ? (
      <div
        key={`nwc-${profileAnimKey}`}
        className="config-nwc-block config-nwc-block--animate-in"
      >
        <p className="config-nwc-block__title">NOSTR WALLET CONNECT</p>
        <p className="config-nwc-block__lede">
          Paste a <code>nostr+walletconnect://</code> URI from Primal, Alby, or
          any NIP-47 wallet to auto-pay entry fees without leaving the app.
        </p>
        {nwcSaved ? (
          <div className="config-nwc-block__saved-row">
            <span className="config-nwc-block__pill config-nwc-block__pill--ok">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Wallet connected
            </span>
            <button
              ref={nwcDisconnectRef}
              type="button"
              className={`config-nwc-block__disconnect-btn${kbdFocus(navFocus.kind === 'action')}`}
              onClick={() => {
                clearNwcUri();
                setNwcInput('');
                setNwcSaved(false);
                setNwcError(null);
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="config-nwc-block__input-row">
            <input
              className="config-nwc-block__input"
              type="text"
              value={nwcInput}
              onChange={(e) => {
                setNwcInput(e.target.value);
                setNwcError(null);
              }}
              placeholder="nostr+walletconnect://…"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              ref={nwcSaveRef}
              type="button"
              className={kbdFocus(navFocus.kind === 'action').trim()}
              disabled={!nwcInput.trim()}
              onClick={() => {
                try {
                  parseNwcUri(nwcInput.trim());
                  setNwcUri(nwcInput.trim());
                  setNwcSaved(true);
                  setNwcError(null);
                } catch (e) {
                  setNwcError(e instanceof Error ? e.message : 'Invalid URI');
                }
              }}
            >
              Save
            </Button>
          </div>
        )}
        {nwcError ? (
          <p className="config-nwc-block__error">{nwcError}</p>
        ) : null}
      </div>
      ) : null}

      {configTab === 'gamepad' ? (
        <GamepadTester active={configTab === 'gamepad'} />
      ) : null}
        </div>

        <div
          key={`act-${profileAnimKey}`}
          className="config-shell__footer config-page__actions--animate-in"
        >
          <Button
            id="backButton"
            ref={backButtonRef}
            className={kbdFocus(navFocus.kind === 'mainMenu').trim()}
            onClick={() => {
              if (!returnTo || returnTo === '/') {
                navigateToMainMenu(navigate);
              } else {
                navigate(returnTo);
              }
            }}
          >
            Main Menu
          </Button>
        </div>
      </div>

      <BackgroundAudio
        src="/sound/chain_duel_produced_menu.m4a"
        autoplay={true}
      />
    </div>
  );
}
