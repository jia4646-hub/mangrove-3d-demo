import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Relative base so GitHub Pages project sites work without hardcoding the repo name
  base: './',
  root: 'src',
  publicDir: '../public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    open: false,
    // Allow access from other devices on the LAN by IP
    allowedHosts: true,
    fs: {
      allow: [resolve(__dirname), resolve(__dirname, 'public'), resolve(__dirname, 'src')],
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        leaf: resolve(__dirname, 'src/leaf.html'),
      },
    },
  },
});
