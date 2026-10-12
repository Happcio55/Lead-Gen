import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One codebase, two sites:
//   vestas - the motion-style terminal in stone & lime
//   ruckus - the gomo-style site with Rudy the raccoon
// APP_BRAND picks one. On Vercel each project builds its own: the "ruckus" project is Ruckus and
// every other project (lead-gen) is Vestas. Locally the default is Vestas.
export function pickBrand(env = process.env) {
  if (env.APP_BRAND) return env.APP_BRAND;
  const host = `${env.VERCEL_PROJECT_PRODUCTION_URL || ''} ${env.VERCEL_URL || ''}`;
  return /ruckus/i.test(host) ? 'ruckus' : 'vestas';
}

const HEAD = {
  vestas: {
    title: 'Vestas — Robinhood Chain terminal',
    theme: '#f2f2ee',
    links: `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />`,
  },
  ruckus: {
    title: 'Ruckus — Robinhood Chain memecoins',
    theme: '#eef1ec',
    links: `<link rel="icon" href="/favicon.png" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preload" as="image" href="/rudy/rudy-happy.webp" />
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />`,
  },
};

export default defineConfig(() => {
  const brand = pickBrand();
  if (!HEAD[brand]) throw new Error(`Unknown APP_BRAND "${brand}" (use vestas or ruckus)`);
  const src = (p) => fileURLToPath(new URL(`./web/src/${p}`, import.meta.url));
  return {
    root: 'web',
    plugins: [
      react(),
      {
        name: 'brand-head',
        transformIndexHtml: (html) =>
          html
            .replace('%BRAND_TITLE%', HEAD[brand].title)
            .replace('%BRAND_THEME%', HEAD[brand].theme)
            .replace('<!-- brand-links -->', HEAD[brand].links),
      },
    ],
    resolve: { alias: { '@brand-meta': src(`brand/${brand}.meta.js`), '@brand': src(`brand/${brand}.jsx`) } },
    build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
    },
  };
});
