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
  // Relative, as each Umbraco version's build is served from the root and/or a folder (/v17/). The
  // pages only at the root (/bookmarklet/, /embed.html) are linked to with root URLs.
  base: './',
  experimental: {
    // URLs in scripts are relative to the script, as embed-core.js runs on other sites (the blog)
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
    {
      // Read when the deploy puts each version's build together (scripts/assemble-site.mjs)
      name: 'umbraco-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'umbraco-version.json', source: JSON.stringify({ version: umbracoVersion }) });
      },
    },
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        embedDemo: fileURLToPath(new URL('./embed.html', import.meta.url)),
        bookmarklet: fileURLToPath(new URL('./bookmarklet/index.html', import.meta.url)),
        plausible: fileURLToPath(new URL('./plausible/index.html', import.meta.url)),
        embed: fileURLToPath(new URL('./src/embed.ts', import.meta.url)),
        'embed-core': fileURLToPath(new URL('./src/embed-core.ts', import.meta.url)),
      },
      output: {
        // Stable names: the blog includes embed.js, which loads a version's embed-core.js
        entryFileNames: (chunk) => (chunk.name === 'embed' || chunk.name === 'embed-core' ? `${chunk.name}.js` : 'assets/[name]-[hash].js'),
      },
    },
  },
});
