import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built bundle works from any sub-path
// (e.g. served at /app/ on GitHub Pages or opened from the filesystem).
export default defineConfig({
  base: './',
  plugins: [react()],
});
