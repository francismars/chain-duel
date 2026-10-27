import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { UI_DEBUG_GROUPS } from '@/lib/uiDebug/uiDebugCatalog';
import {
  readUiDebugEnabled,
  urlRequestsUiDebug,
  writeUiDebugEnabled,
} from '@/lib/uiDebug/uiDebugMode';
import '@/components/ui/UiDebugMenu.css';

export default function UiDebugIndex() {
  const location = useLocation();
  const [enabled, setEnabled] = useState(() => {
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (urlRequestsUiDebug(href)) {
      writeUiDebugEnabled(true);
      return true;
    }
    return readUiDebugEnabled();
  });

  useEffect(() => {
    const href = `${location.pathname}${location.search}${location.hash}`;
    if (urlRequestsUiDebug(href)) {
      writeUiDebugEnabled(true);
    }
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    const sync = () => setEnabled(readUiDebugEnabled());
    window.addEventListener('chainduel-ui-debug', sync);
    return () => window.removeEventListener('chainduel-ui-debug', sync);
  }, []);

  if (!enabled) {
    return <div className="ui-debug-index__locked" />;
  }

  return (
    <main className="ui-debug-index">
      <h1>UI test pages</h1>
      {UI_DEBUG_GROUPS.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {group.links.map((link) => (
              <li key={link.href}>
                <Link to={link.href}>
                  {link.variant ? <span>{link.variant}</span> : null}
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
