import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UI_DEBUG_GROUPS } from '@/lib/uiDebug/uiDebugCatalog';
import {
  readUiDebugEnabled,
  urlRequestsUiDebug,
  writeUiDebugEnabled,
} from '@/lib/uiDebug/uiDebugMode';
import './UiDebugMenu.css';

export function UiDebugMenu() {
  const location = useLocation();
  const [enabled, setEnabled] = useState(readUiDebugEnabled);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(readUiDebugEnabled());
    window.addEventListener('chainduel-ui-debug', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('chainduel-ui-debug', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const href = `${location.pathname}${location.search}${location.hash}`;
    if (urlRequestsUiDebug(href)) {
      writeUiDebugEnabled(true);
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    let buffer = '';
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        writeUiDebugEnabled(!readUiDebugEnabled());
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key.length !== 1) {
        return;
      }
      buffer = (buffer + event.key.toLowerCase()).slice(-5);
      if (buffer === 'debug') {
        writeUiDebugEnabled(true);
        buffer = '';
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div className="ui-debug-menu">
      <button
        type="button"
        className={`corner-btn ui-debug-menu__btn${open ? ' ui-debug-menu__btn--open' : ''}`}
        aria-expanded={open}
        aria-label="UI debug pages"
        data-tooltip="UI debug"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      </button>
      {open ? (
        <div className="ui-debug-menu__panel" role="menu">
          <div className="ui-debug-menu__head">
            <Link to="/preview" onClick={() => setOpen(false)}>
              All test pages
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                writeUiDebugEnabled(false);
              }}
            >
              Turn off debug
            </button>
          </div>
          {UI_DEBUG_GROUPS.map((group) => (
            <section key={group.title}>
              <p>{group.title}</p>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} onClick={() => setOpen(false)}>
                      {link.variant ? <span>{link.variant}</span> : null}
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
