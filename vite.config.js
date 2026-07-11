import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base: the build works from any URL path (GitHub Pages serves the app from
  // /DominicaHealthLink/, local preview from /) without hardcoding the repo name.
  base: './',
  build: {
    outDir: 'dist',
    // Keep output compatible with the older mobile Safari versions the operators use.
    target: 'es2018',
    // Split the two big vendors into their own hashed chunks: they download in parallel
    // and stay cached across app-code updates.
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/compat/app', 'firebase/compat/auth', 'firebase/compat/firestore', 'firebase/compat/storage'],
          lucide: ['lucide'],
        },
      },
    },
  },
});
