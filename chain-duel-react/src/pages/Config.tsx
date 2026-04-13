import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { BackgroundAudio } from '@/components/audio/BackgroundAudio';
import { useAudio, SFX } from '@/contexts/AudioContext';
import {
  fetchLatestKind0Profile,
  verifyNip05,
  formatPubkeyHex,
  type Kind0Profile,
} from '@/lib/nostr/fetchKind0Profile';
import {
  beginNostrConnectPairing,
  clearSignerSession,
  connectNsecFromInput,
  disposeNostrConnectPairingAttempt,
  getStoredSignerMode,
  isNsecSessionMissing,
  pingNip46Signer,
  recoverNip46UserPubkey,
  type Nip46PingResult,
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
import './config.css';


type LoginTab = 'extension' | 'nip46' | 'nsec';

function signerModeLabel(mode: StoredSignerMode | null): string {
  if (mode === 'nip46') return 'Nostr Connect';
  if (mode === 'nsec') return 'nsec (this tab)';
  if (mode === 'extension') return 'Browser extension';
  return 'Nostr';
}

export default function Config() {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const [nostrPubkeyHex, setNostrPubkeyHex] = useState<string | null>(null);
  const [nostrBusy, setNostrBusy] = useState(false);
  const [nostrError, setNostrError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Kind0Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileRecovering, setProfileRecovering] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [nip05Ok, setNip05Ok] = useState<boolean | null>(null);
  const [nip05CheckPending, setNip05CheckPending] = useState(false);
  const [loginTab, setLoginTab] = useState<LoginTab>('extension');
  const [nsecInput, setNsecInput] = useState('');
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const [nip46Waiting, setNip46Waiting] = useState(false);
  const [pairingPhase, setPairingPhase] = useState<'scanning' | 'handshake' | 'resolving'>('scanning');
  const [pairingKey, setPairingKey] = useState(0);
  const [uriCopied, setUriCopied] = useState(false);
  const [signerPingStatus, setSignerPingStatus] = useState<'pending' | 'ok' | 'timeout' | 'unavailable' | null>(null);
  const [profileAnimKey, setProfileAnimKey] = useState(0);
  const [nwcInput, setNwcInput] = useState(() => getNwcUri() ?? '');
  const [nwcSaved, setNwcSaved] = useState(() => Boolean(getNwcUri()));
  const [nwcError, setNwcError] = useState<string | null>(null);
  const nip46PairingDoneRef = useRef(false);
  const nip46PairingAbortRef = useRef<AbortController | null>(null);
  const playSfxRef = useRef(playSfx);
  const profileCardMainRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  playSfxRef.current = playSfx;

  useEffect(() => {
    if (isNsecSessionMissing()) {
      clearSignerSession();
      setNostrPubkeyHex(null);
      setNostrError('nsec sign-in is limited to this browser tab. After a refresh, sign in again.');
      return;
    }
    const saved = localStorage.getItem(STORED_NOSTR_PUBKEY_KEY);
    if (saved) setNostrPubkeyHex(saved);
  }, []);

  useEffect(() => {
    setNip46AuthUrlHandler((url) => setPendingAuthUrl(url));
    return () => setNip46AuthUrlHandler(null);
  }, []);

  useEffect(() => {
    if (loginTab !== 'nip46' || nostrPubkeyHex) {
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
        .then((pk) => {
          nip46PairingDoneRef.current = true;
          setNostrPubkeyHex(pk);
          playSfxRef.current(SFX.MENU_CONFIRM);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) {
            return;
          }
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
  }, [loginTab, nostrPubkeyHex, pairingKey]);

  useEffect(() => {
    setAvatarBroken(false);
    setNip05Ok(null);
    setNip05CheckPending(false);
    if (!nostrPubkeyHex) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileAnimKey(k => k + 1);
    void (async () => {
      let pubkey = nostrPubkeyHex;
      let p = await fetchLatestKind0Profile(pubkey);

      // Self-heal: if kind-0 returned nothing and we're in NIP-46 mode, the stored pubkey
      // may be Primal's remote-signer key rather than the user's actual identity. Ask the
      // signer to sign a dummy event — the signed event's pubkey is always the real user key.
      if (!p && !cancelled && getStoredSignerMode() === 'nip46') {
        setProfileRecovering(true);
        const recovered = await recoverNip46UserPubkey();
        if (!cancelled) setProfileRecovering(false);
        if (recovered && !cancelled) {
          pubkey = recovered;
          p = await fetchLatestKind0Profile(recovered);
        }
      }

      if (cancelled) return;
      setProfile(p);
      setProfileLoading(false);
      // Update pubkey state AFTER profile is set — calling it earlier cancels this effect
      // before the second fetchLatestKind0Profile can complete.
      if (pubkey !== nostrPubkeyHex) {
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
  }, [nostrPubkeyHex]);

  // Ping the NIP-46 signer — verifies remote is live AND fixes wrong stored pubkey.
  useEffect(() => {
    if (!nostrPubkeyHex || getStoredSignerMode() !== 'nip46') return;
    let cancelled = false;
    setSignerPingStatus('pending');
    void pingNip46Signer().then((result: Nip46PingResult) => {
      if (cancelled) return;
      setSignerPingStatus(result.status);
      // Ping recovered the real user pubkey — update state so kind-0 refetches automatically
      if (result.recoveredPubkey) {
        setNostrPubkeyHex(result.recoveredPubkey);
      }
    });
    return () => { cancelled = true; };
  }, [nostrPubkeyHex]);

  const handleExtensionSignIn = useCallback(async () => {
    if (!window.nostr) {
      setNostrError('No Nostr extension found. Install Alby, nos2x, or another NIP-07 extension.');
      return;
    }
    setNostrBusy(true);
    setNostrError(null);
    setPendingAuthUrl(null);
    try {
      const pubkey = await window.nostr.getPublicKey();
      recordExtensionSignIn(pubkey);
      setNostrPubkeyHex(pubkey);
      playSfx(SFX.MENU_CONFIRM);
    } catch {
      setNostrError('Extension declined or sign-in was cancelled.');
    } finally {
      setNostrBusy(false);
    }
  }, [playSfx]);

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
      setNostrPubkeyHex(pubkey);
      playSfx(SFX.MENU_CONFIRM);
    } catch (e) {
      setNostrError(e instanceof Error ? e.message : 'Invalid nsec or hex key.');
    } finally {
      setNostrBusy(false);
    }
  }, [nsecInput, playSfx]);

  const handleNostrSignOut = useCallback(() => {
    clearSignerSession();
    setNostrPubkeyHex(null);
    setProfile(null);
    setNostrError(null);
    setNip05Ok(null);
    setPendingAuthUrl(null);
    playSfx(SFX.MENU_CONFIRM);
  }, [playSfx]);

  const openPendingAuth = useCallback(() => {
    if (!pendingAuthUrl) return;
    window.open(pendingAuthUrl, '_blank', 'noopener,noreferrer');
  }, [pendingAuthUrl]);

  const signerMode = nostrPubkeyHex ? getStoredSignerMode() : null;
  const avatarSrc = !avatarBroken && profile?.picture?.trim() ? profile.picture.trim() : null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!nostrPubkeyHex) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;

      const active = document.activeElement as HTMLElement | null;
      const mainEl = profileCardMainRef.current;
      const fieldEls = Array.from(
        mainEl?.querySelectorAll('.config-profile-card__field') ?? []
      ) as HTMLElement[];
      const fieldIdx = fieldEls.findIndex((el) => el === active);
      const inProfileCard =
        !!(mainEl && active && mainEl.contains(active));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        playSfxRef.current(SFX.MENU_SELECT);
        backButtonRef.current?.focus({ preventScroll: true });
        return;
      }

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (fieldEls.length === 0) return;

      if (fieldIdx >= 0) {
        e.preventDefault();
        playSfxRef.current(SFX.MENU_SELECT);
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const next = (fieldIdx + delta + fieldEls.length) % fieldEls.length;
        fieldEls[next]?.focus({ preventScroll: true });
        return;
      }

      if (active === backButtonRef.current || inProfileCard) {
        e.preventDefault();
        playSfxRef.current(SFX.MENU_SELECT);
        fieldEls[0]?.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [nostrPubkeyHex]);

  return (
    <div className="flex full flex-center config-page">
      <p className="page-title label">Config</p>

      {!nostrPubkeyHex ? (
        <>
          <p className="config-nostr-hint">
            Sign in with an extension, <strong>Nostr Connect</strong>, or nsec. Profile info loads from relays in your
            browser — not our servers.
          </p>
          {nostrError ? <p className="config-nostr-error">{nostrError}</p> : null}

          {pendingAuthUrl ? (
            <div className="config-nip46-auth-banner" role="status">
              <p className="config-nip46-auth-banner__text">Your signer is asking for approval in another app.</p>
              <Button type="button" className="config-nip46-auth-banner__btn" onClick={openPendingAuth}>
                Open approval page
              </Button>
            </div>
          ) : null}

          <div className="config-login-tabs" role="tablist" aria-label="Sign-in method">
            <button
              type="button"
              role="tab"
              aria-selected={loginTab === 'extension'}
              className={`config-login-tab${loginTab === 'extension' ? ' config-login-tab--active' : ''}`}
              onClick={() => {
                setLoginTab('extension');
                setNostrError(null);
              }}
            >
              Extension
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginTab === 'nip46'}
              className={`config-login-tab${loginTab === 'nip46' ? ' config-login-tab--active' : ''}`}
              onClick={() => {
                setLoginTab('nip46');
                setNostrError(null);
              }}
            >
              Nostr Connect
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={loginTab === 'nsec'}
              className={`config-login-tab${loginTab === 'nsec' ? ' config-login-tab--active' : ''}`}
              onClick={() => {
                setLoginTab('nsec');
                setNostrError(null);
              }}
            >
              nsec
            </button>
          </div>

          <div className="config-login-panel">
            {loginTab === 'extension' ? (
              <div className="config-login-panel__block" role="tabpanel">
                <p className="config-login-panel__lede">
                  NIP-07 — Alby, nos2x, etc.
                </p>
                <div className="config-page__actions config-page__actions--inline">
                  <Button
                    id="nostrSignInExtension"
                    type="button"
                    onClick={() => {
                      void handleExtensionSignIn();
                    }}
                    disabled={nostrBusy}
                  >
                    {nostrBusy ? 'Waiting…' : 'Sign in with extension'}
                  </Button>
                </div>
              </div>
            ) : null}

            {loginTab === 'nip46' ? (
              <div className="config-login-panel__block" role="tabpanel">
                <p className="config-login-panel__lede config-nc-lede">
                  NIP-46: scan QR or open the link — Primal, Amber, etc. (
                  <a href="https://nostrconnect.org/" target="_blank" rel="noopener noreferrer" className="config-nostr-link">
                    nostrconnect.org
                  </a>
                  ).
                </p>

                <div className="config-nc-layout">
                  {pairingPhase === 'resolving' ? (
                    <div className="config-nc-resolving" role="status">
                      <svg className="config-nc-resolving__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M12 2a10 10 0 0 1 10 10" />
                      </svg>
                      <p className="config-nc-resolving__text">Signer detected — resolving identity…</p>
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
                            <div className="config-nc-qr config-nc-qr--placeholder" aria-hidden />
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
                              <span className="config-nc-hint-muted"> Primal · Amber · NIP-46</span>
                            </>
                          )}
                        </p>
                        <div className="config-nc-uri-row">
                          <code className="config-nc-uri-text" title={nostrConnectUri ?? ''}>
                            {nostrConnectUri
                              ? `${nostrConnectUri.slice(0, 40)}${nostrConnectUri.length > 40 ? '…' : ''}`
                              : '…'}
                          </code>
                          <button
                            type="button"
                            className="config-nc-copy-btn"
                            onClick={copyNostrConnectUri}
                            disabled={!nostrConnectUri}
                            aria-label={uriCopied ? 'Copied' : 'Copy connection URI'}
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
                    type="button"
                    className="config-nc-regen-btn"
                    onClick={() => {
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
                  Pasting an <strong>nsec</strong> gives this site the ability to sign as you. Only use on a device you
                  trust. The key is kept in <strong>session memory</strong> only (lost when the tab closes); it is not
                  saved to disk.
                </p>
                <label className="config-login-panel__label" htmlFor="configNsecInput">
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
                    onClick={() => {
                      void handleNsecSignIn();
                    }}
                    disabled={nostrBusy || !nsecInput.trim()}
                  >
                    {nostrBusy ? 'Unlocking…' : 'Sign in with nsec'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : profileLoading ? (
        <div className="config-profile-card config-profile-skeleton" aria-busy="true" aria-label="Loading profile">
          <div className="config-profile-skeleton__banner" />
          <div className="config-profile-skeleton__main">
            <div className="config-profile-skeleton__avatar" aria-hidden>
              <span className="config-profile-skeleton__ring" />
              <span className="config-profile-skeleton__ring config-profile-skeleton__ring--2" />
            </div>
            <p className="config-profile-loading-text">
              {profileRecovering ? 'VERIFYING IDENTITY… OPEN PRIMAL' : 'LOADING PROFILE'}
            </p>
          </div>
        </div>
      ) : (
        <div key={profileAnimKey} className="config-profile-card config-profile-card--animate-in">
          {pendingAuthUrl ? (
            <div className="config-nip46-auth-banner config-nip46-auth-banner--card" role="status">
              <p className="config-nip46-auth-banner__text">Approval needed in your remote signer.</p>
              <Button type="button" className="config-nip46-auth-banner__btn" onClick={openPendingAuth}>
                Open approval page
              </Button>
            </div>
          ) : null}
          <div
            className="config-profile-card__banner"
            style={
              profile?.banner
                ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,1) 100%), url(${profile.banner})` }
                : undefined
            }
          />
          <div className="config-profile-card__main" tabIndex={0} ref={profileCardMainRef}>
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
                <div className="config-profile-card__avatar config-profile-card__avatar--placeholder" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              )}
              <div className="config-profile-card__titles">
                <h2 className="config-profile-card__name">{profile?.displayTitle ?? 'Nostr user'}</h2>
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
                    <div className="config-profile-card__field-label">Username</div>
                    <div className="config-profile-card__field-value">@{profile.name}</div>
                  </div>
                ) : null}

                <div className="config-profile-card__field" tabIndex={-1}>
                  <div className="config-profile-card__field-label">Sign-in</div>
                  <div className="config-profile-card__field-value">
                    {signerModeLabel(signerMode)}
                    <svg className="config-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                </div>

                {profile?.nip05 ? (
                  <div className="config-profile-card__field" tabIndex={-1}>
                    <div className="config-profile-card__field-label">NIP-05</div>
                    <div className="config-profile-card__field-value">
                      <span className="config-profile-card__nip05-text">{profile.nip05}</span>
                      {nip05CheckPending ? (
                        <svg className="config-field-icon config-field-icon--spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Checking…">
                          <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                      ) : nip05Ok === true ? (
                        <svg className="config-field-icon config-field-icon--ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Verified">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : nip05Ok === false ? (
                        <svg className="config-field-icon config-field-icon--fail" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Unverified">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {profile?.lud16 ? (
                  <div className="config-profile-card__field" tabIndex={-1}>
                    <div className="config-profile-card__field-label">Lightning</div>
                    <div className="config-profile-card__field-value config-profile-card__field-value--ln">
                      {profile.lud16}
                      <svg className="config-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                  </div>
                ) : null}

                {profile?.lud06 && !profile?.lud16 ? (
                  <div className="config-profile-card__field" tabIndex={-1}>
                    <div className="config-profile-card__field-label">Lightning</div>
                    <div className="config-profile-card__field-value config-profile-card__field-value--lnurl" title={profile.lud06}>
                      LNURL-pay (kind 0)
                      <svg className="config-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                  </div>
                ) : null}

                <div className="config-profile-card__field" tabIndex={-1}>
                  <div className="config-profile-card__field-label">Public key</div>
                  <div className="config-profile-card__field-value config-profile-card__field-value--mono">
                    {nostrPubkeyHex ? formatPubkeyHex(nostrPubkeyHex) : ''}
                    <svg className="config-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>
              </div>
              </div>{/* config-profile-card__body */}

              {!profile ? (
                <p className="config-profile-card__empty">
                  {signerMode === 'nip46'
                    ? 'Waiting for signer. Open Primal on your phone and approve any signing prompts — your profile will appear automatically.'
                    : 'No kind\u00a00 metadata found on the default relays yet. You can still use this pubkey; publish a profile from any Nostr client.'}
                </p>
              ) : null}

              {signerMode === 'nip46' ? (
                <div className={`config-signer-ping config-signer-ping--${signerPingStatus ?? 'pending'}`} role="status">
                  {signerPingStatus === 'pending' ? (
                    <span className="config-signer-ping__text">Checking signer connection…</span>
                  ) : signerPingStatus === 'ok' ? (
                    <span className="config-signer-ping__text">Signer connected</span>
                  ) : (
                    <>
                      <svg className="config-signer-ping__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="config-signer-ping__text">
                        {signerPingStatus === 'timeout'
                          ? 'Waiting for approval. Open Primal on your phone and tap Allow when prompted.'
                          : 'Could not reach signer. Check your connection or sign out and reconnect.'}
                      </span>
                    </>
                  )}
                </div>
              ) : null}

              <div className="config-profile-card__actions">
                <Button id="nostrSignOut" type="button" onClick={handleNostrSignOut}>
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Nostr Wallet Connect ── */}
      <div key={`nwc-${profileAnimKey}`} className="config-nwc-block config-nwc-block--animate-in">
        <p className="config-nwc-block__title">NOSTR WALLET CONNECT</p>
        <p className="config-nwc-block__lede">
          Paste a <code>nostr+walletconnect://</code> URI from Primal, Alby, or any NIP-47 wallet to auto-pay entry fees without leaving the app.
        </p>
        {nwcSaved ? (
          <div className="config-nwc-block__saved-row">
            <span className="config-nwc-block__pill config-nwc-block__pill--ok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Wallet connected
            </span>
            <button
              type="button"
              className="config-nwc-block__disconnect-btn"
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
              onChange={(e) => { setNwcInput(e.target.value); setNwcError(null); }}
              placeholder="nostr+walletconnect://…"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
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
        {nwcError ? <p className="config-nwc-block__error">{nwcError}</p> : null}
      </div>

      <div key={`act-${profileAnimKey}`} className="config-page__actions config-page__actions--animate-in">
        <Button id="backButton" ref={backButtonRef} onClick={() => navigate('/')}>
          Main Menu
        </Button>
      </div>

      <BackgroundAudio src="/sound/chain_duel_produced_menu.m4a" autoplay={true} />

    </div>
  );
}
