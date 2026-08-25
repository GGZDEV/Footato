import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is overridable so the same build works on GitHub Pages (/Footato/) and at a domain root.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
});
