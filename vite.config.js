import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Relative base: the build works from any URL path (GitHub Pages serves the app from
  // /DominicaHealthLink/, local preview from /) without hardcoding the repo name.
  base: './',
  build: {
    outDir: 'dist',
    // Keep output compatible with the older mobile Safari versions the operators use.
    target: 'es2018',
    rollupOptions: {
      // Two HTML entry points: the investor presentation (index.html) is the landing page
      // shown before the demo; app.html boots the actual gestionale (/src/main.js). The
      // presentation's CTAs link to ./app.html.
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
      // Split the two big vendors into their own hashed chunks: they download in parallel
      // and stay cached across app-code updates.
      output: {
        manualChunks: {
          firebase: ['firebase/compat/app', 'firebase/compat/auth', 'firebase/compat/firestore'],
          lucide: ['lucide'],
        },
      },
    },
  },
});
