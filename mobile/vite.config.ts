import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
export default defineConfig(({ mode }) => {
  // Only explicitly public configuration crosses the mobile build boundary.
  const env = loadEnv(mode, resolve(__dirname, '..'), 'NEXT_PUBLIC_');
  const api = env.NEXT_PUBLIC_API_BASE_URL;
  if (!api) throw Error('Set NEXT_PUBLIC_API_BASE_URL to the HTTPS backend origin before building mobile.');
  const url = new URL(api);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Invalid HTTPS API origin');
  return {
    root: __dirname,
    resolve: { alias: { '@': resolve(__dirname, '..') } },
    esbuild: { jsx: 'automatic' },
    define: { 'process.env.NEXT_PUBLIC_API_BASE_URL': JSON.stringify(url.origin) },
    build: { outDir: 'dist', emptyOutDir: true }
  };
});
