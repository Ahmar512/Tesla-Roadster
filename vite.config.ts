import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build also works inside the Capacitor app.
  base: './',
  server: {
    // Expose on the local network so the game can be tested on a phone.
    host: true,
  },
});
