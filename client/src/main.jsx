import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import './styles/index.css';

/**
 * Service worker: web only.
 *
 * On the web it is what makes Madad installable and usable offline. Inside the
 * Android app it is worse than useless — the app's files are already bundled
 * on the phone, and a worker left over from the previous install keeps
 * serving that old build's cached files after you reinstall, so new code
 * appears not to have taken effect. Offline still works in the app: the feed
 * cache and sync queue live in IndexedDB, not in the worker.
 */
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* registration is an enhancement — never fatal */ });
}

/**
 * Capacitor bits are imported lazily and guarded: the same bundle has to run
 * as a plain website, where none of these plugins exist.
 */
async function initNative() {
  const isNative = window.Capacitor?.isNativePlatform?.();
  if (!isNative) return;

  // The status bar colour is owned by ThemeContext, which re-applies it
  // whenever the theme changes. Setting it here as well would flash the light
  // bar on a dark-mode launch, so this is deliberately left alone.

  try {
    const { App: CapApp } = await import('@capacitor/app');
    // Android back button should navigate, not kill the app.
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else CapApp.exitApp();
    });
  } catch { /* ignore */ }
}

initNative();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
