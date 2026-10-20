import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const backoffice = fileURLToPath(new URL('./node_modules/@umbraco-cms/backoffice/dist-cms/', import.meta.url));

const { version: umbracoVersion } = JSON.parse(readFileSync(`${backoffice}../package.json`, 'utf8'));

function redirectFolders(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const match = req.url?.match(/^\/bookmarklet(\?.*)?$/);
  if (!match) return next();
  res.statusCode = 301;
  res.setHeader('Location', `/bookmarklet/${match[1] ?? ''}`);
  res.end();
}

export default defineConfig({
  define: {
    __UMBRACO_VERSION__: JSON.stringify(umbracoVersion),
  },
  // The site lives at the root of its own domain (ufm-playground.joe.gl)
  base: '/',
  experimental: {
    // But URLs in scripts are relative to the script, as embed.js runs on other sites (the blog),
    // where root URLs would point at the wrong site
    renderBuiltUrl: (_, { hostType }) => (hostType === 'js' ? { relative: true } : undefined),
  },
  // Separate pages (/bookmarklet/, /embed.html) rather than a single-page app, like GitHub Pages
  appType: 'mpa',
  resolve: {
    alias: {
      // Internal UFM modules (manifests, built-in components) that aren't in the package's exports
      '@ufm-internal': `${backoffice}packages/ufm`,
      '@umb-assets': `${backoffice}assets`,
      '@umb-core': `${backoffice}packages/core`,
      '@umb-tiptap': `${backoffice}packages/tiptap`,
      '@umb-tags': `${backoffice}packages/tags`,
      '@uui-dist': fileURLToPath(new URL('./node_modules/@umbraco-ui/uui/dist', import.meta.url)),
    },
  },
  plugins: [
    {
      // GitHub Pages redirects /bookmarklet to /bookmarklet/, so do the same locally
      name: 'folder-redirects',
      configureServer: (server) => void server.middlewares.use(redirectFolders),
      configurePreviewServer: (server) => void server.middlewares.use(redirectFolders),
    },
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        embedDemo: fileURLToPath(new URL('./embed.html', import.meta.url)),
        bookmarklet: fileURLToPath(new URL('./bookmarklet/index.html', import.meta.url)),
        embed: fileURLToPath(new URL('./src/embed.ts', import.meta.url)),
      },
      output: {
        // Stable name for the script the blog includes
        entryFileNames: (chunk) => (chunk.name === 'embed' ? 'embed.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
