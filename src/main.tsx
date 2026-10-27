import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { STORAGE_KEY_TV_SAFE_INSET } from './shared/constants/storageKeys';
import './styles/index.css';

try {
  const v = localStorage.getItem(STORAGE_KEY_TV_SAFE_INSET);
  if (v === '1' || v === 'true') {
    document.documentElement.classList.add('tv-safe-inset');
  }
} catch {
  /* ignore */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
