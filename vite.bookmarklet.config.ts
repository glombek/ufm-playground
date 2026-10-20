import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The bookmarklet, built on its own as a single self-contained script (dist/bookmarklet.js). The
// install page (bookmarklet.html) turns it into a `javascript:` link, filling in the playground's URL.

const entry = fileURLToPath(new URL('./src/bookmarklet/bookmarklet.ts', import.meta.url));

// The version is a hash of the source, so it changes whenever the bookmarklet does. Installed
// bookmarklets compare their version with bookmarklet-version.json, to tell people to update.
const version = createHash('sha256').update(readFileSync(entry)).digest('hex').slice(0, 12);

export default defineConfig({
  define: {
    // Replaced by the install page with where the playground's been deployed
    __PLAYGROUND_URL__: '"__PLAYGROUND_URL__"',
    __BOOKMARKLET_VERSION__: JSON.stringify(version),
  },
  build: {
    emptyOutDir: false,
    target: 'es2020',
    lib: {
      entry,
      formats: ['iife'],
      name: 'ufmPlaygroundBookmarklet',
      fileName: () => 'bookmarklet.js',
    },
  },
  plugins: [
    {
      name: 'bookmarklet-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'bookmarklet-version.json', source: JSON.stringify({ version }) });
      },
    },
  ],
});
