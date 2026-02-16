export const handleGlobalError = (e: Error) => {
  // Log the error before anything else — auto-reloads clear the console
  // and make debugging on iOS/Tauri impossible.
  console.error('[GlobalError]', e?.message, e?.stack);

  const isChunkError = e?.message?.includes('Loading chunk');
  if (isChunkError) return;

  // Only auto-reload for web platform; on Tauri (desktop/mobile) a reload
  // rarely fixes the problem and creates a reload-loop that freezes the app.
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    console.warn('[GlobalError] Skipping auto-reload on Tauri — use "Try Again" button');
    return;
  }

  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem('lastErrorReload') || '0');
  if (now - lastReload > 60_000) {
    sessionStorage.setItem('lastErrorReload', String(now));
    window.location.reload();
  } else {
    console.warn('[GlobalError] Reload suppressed (rate limit)');
  }
};
