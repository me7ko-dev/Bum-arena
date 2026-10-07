import { defineConfig } from 'vite';

export default defineConfig({
  // Относителни пътища – build-ът работи от всяка папка/хостинг (и в Capacitor за Android).
  base: './',
  server: {
    // host: true → играта се отваря и от телефон в същата Wi-Fi мрежа.
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000, // Phaser е голям сам по себе си
  },
});
