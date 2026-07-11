// Entry point: styles first, then the application module (which boots itself on import).
import './styles.css';
import './app.js';

// Service worker: precache-on-use + offline fallback. Registered only in production
// builds so the dev server never fights with a stale cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL-relative so it resolves correctly both at the domain root and under
    // a sub-path like GitHub Pages' /DominicaHealthLink/.
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => { /* offline support is best-effort */ });
  });
}
