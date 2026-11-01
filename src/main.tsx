import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {
  STORAGE_KEY_BOOT_RELOAD,
  STORAGE_KEY_TV_SAFE_INSET,
} from './shared/constants/storageKeys';
import {
  applyGraphicsDocumentClasses,
  readGraphicsSettings,
} from './lib/graphicsSettings';
import './styles/index.css';

try {
  const v = localStorage.getItem(STORAGE_KEY_TV_SAFE_INSET);
  if (v === '1' || v === 'true') {
    document.documentElement.classList.add('tv-safe-inset');
  }
} catch {
  /* ignore */
}
applyGraphicsDocumentClasses(readGraphicsSettings());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function clearBootReload() {
  const root = document.getElementById('root');
  if (!root || root.childElementCount === 0) return false;
  try {
    sessionStorage.removeItem(STORAGE_KEY_BOOT_RELOAD);
  } catch {
    /* Storage can be blocked. The app still mounted. */
  }
  return true;
}

const root = document.getElementById('root');
if (!clearBootReload() && root) {
  const observer = new MutationObserver(() => {
    if (clearBootReload()) observer.disconnect();
  });
  observer.observe(root, { childList: true });
}
