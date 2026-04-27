import { defineConfig } from 'vite';

export default defineConfig({
  // No special config needed for simple projects, 
  // but we can ensure the public directory is used.
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
