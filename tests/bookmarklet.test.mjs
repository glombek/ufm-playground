// Runs the bookmarklet on the UFM cheat sheet's sample Umbraco site, opens every label it finds in
// the playground, and checks the playground renders each block's label the same as Umbraco did.
//
// Needs the sample site running (see UfmSamples/README.md) and a build of the playground:
//   npm run build && npm run test:bookmarklet
import { readFile } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from 'playwright';

const UMBRACO = process.env.UFM_BASE_URL ?? 'https://localhost:44344';
const EMAIL = process.env.UFM_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.UFM_PASSWORD ?? 'UfmSamples1234!';
const PLAYGROUND = 'http://localhost:4177/';

// These use things only the sample site has (a custom filter, component and translation), so the
// playground can't render them the same
const EXPECTED_DIFFERENCES = new Set([
  'Localize (custom key)',
  'Custom blockSummary filter',
  'Custom blockSummary filter (limited)',
  'Custom blockSummary filter (expression)',
  'Custom component',
]);

const deepText = () => {
  // In the page: text as displayed, following shadow roots
  window.__deep = (n) => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent;
    if (n.nodeType !== 1 && n.nodeType !== 11) return '';
    if (n.tagName === 'STYLE') return '';
    if (n.tagName === 'SLOT') return [...n.assignedNodes()].map(window.__deep).join('');
    return [...(n.shadowRoot ?? n).childNodes].map(window.__deep).join('');
  };
};

const server = await preview({ preview: { port: 4177, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();

// Log in and open the examples page
await page.goto(`${UMBRACO}/umbraco`);
await page.locator('input[name="username"], input[type="email"]').first().fill(EMAIL);
await page.locator('input[name="password"]').fill(PASSWORD);
await page.getByRole('button', { name: /login/i }).click();
await page.waitForURL(/\/umbraco\/section\//, { timeout: 60_000 });
await page.locator('umb-tree-item, uui-menu-item').filter({ hasText: 'UFM examples' }).first().click();
await page.waitForURL(/\/document\/edit\//);
await page.waitForTimeout(1500);
await page.locator('uui-tab').filter({ hasText: /^\s*Content\s*$/ }).last().click();
// Wait until the labels have finished rendering (picked items' names are looked up asynchronously)
await page.evaluate(deepText);
let previous = '';
for (let attempt = 0; attempt < 90; attempt++) {
  await page.waitForTimeout(1000);
  const snapshot = await page.evaluate(() => {
    const texts = [];
    const walk = (root) => {
      for (const el of root.children) {
        if (el.tagName === 'UMB-UFM-RENDER') texts.push(window.__deep(el));
        walk(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document.documentElement);
    return texts.join('\n');
  });
  if (snapshot === previous && snapshot.length) break;
  previous = snapshot;
}

// What Umbraco rendered, by property alias
await page.evaluate(deepText);
const umbraco = await page.evaluate(() => {
  const labels = {};
  const walk = (root, property) => {
    for (const el of root.children) {
      let current = property;
      if (el.tagName === 'UMB-PROPERTY-LAYOUT') current = el.alias;
      if (el.tagName === 'UMB-UFM-RENDER' && el.id !== 'description' && current && el.closest?.('[id="description"]') == null) {
        (labels[current] ??= []).push(window.__deep(el).replace(/\s+/g, ' ').trim());
      }
      walk(el, current);
      if (el.shadowRoot) walk(el.shadowRoot, current);
    }
  };
  walk(document.documentElement);
  return labels;
});

// Run the bookmarklet, as if it had been clicked
const code = (await readFile(new URL('../dist/bookmarklet.js', import.meta.url), 'utf8')).replace(/__PLAYGROUND_URL__/g, PLAYGROUND);
await page.evaluate(code);
await page.waitForTimeout(500);
const buttons = page.locator('#ufm-playground-bookmarklet button').filter({ hasNotText: /^Close$/ });
const count = await buttons.count();
console.log(`The bookmarklet found ${count} label templates`);
let failures = 0;
if (count === 0) {
  console.log("✗ No labels found: is the sample site running, with its examples page? (See bookmarklet-test-failure.png)");
  await page.screenshot({ path: "bookmarklet-test-failure.png", fullPage: true });
  failures++;
}

let expectedDifferences = 0;
for (let i = 0; i < count; i++) {
  const button = buttons.nth(i);
  const title = (await button.locator('strong').textContent()).replace(/ · \d+ blocks?$/, '');
  const alias = await button.getAttribute('data-alias');
  const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);
  // Wait for the playground to start, then a moment for labels' components to render
  await popup.waitForFunction(() => document.querySelector('ufm-playground-app')?.shadowRoot?.querySelector('ufm-block-list-editor')?.shadowRoot?.querySelector('umb-ufm-render'), null, { timeout: 30_000 });
  await popup.waitForTimeout(1500);
  await popup.evaluate(deepText);
  const playground = await popup.evaluate(() =>
    [...document.querySelector('ufm-playground-app').shadowRoot.querySelector('ufm-block-list-editor').shadowRoot.querySelectorAll('.block > .header umb-ufm-render')].map(
      (el) => window.__deep(el).replace(/\s+/g, ' ').trim(),
    ),
  );
  await popup.close();

  // Umbraco's labels for this property (they're doubled up by hidden copies, so de-duplicate in order)
  const expected = (umbraco[alias] ?? []).filter((text, index, all) => all.indexOf(text) === index || playground.filter((t) => t === text).length > 1);
  const same = JSON.stringify(dedupe(playground)) === JSON.stringify(dedupe(expected));
  if (same) {
    console.log(`✓ ${title}`);
  } else if (EXPECTED_DIFFERENCES.has(title)) {
    expectedDifferences++;
    console.log(`ℹ ${title} (expected to differ)\n    Umbraco    ${JSON.stringify(dedupe(expected))}\n    playground ${JSON.stringify(playground)}`);
  } else {
    failures++;
    console.log(`✗ ${title}\n    Umbraco    ${JSON.stringify(dedupe(expected))}\n    playground ${JSON.stringify(playground)}`);
  }
}

function dedupe(texts) {
  return texts.filter((text, index) => texts.indexOf(text) === index);
}

// The update check: a current bookmarklet says nothing, an old one says there's a newer version.
// (Run on a playground page, as the backoffice is HTTPS and the local playground isn't.)
const { version } = JSON.parse(await readFile(new URL('../dist/bookmarklet-version.json', import.meta.url), 'utf8'));
for (const [name, script, expectNotice] of [
  ['current version', code, false],
  ['outdated version', code.replaceAll(JSON.stringify(version), '"outdated"'), true],
]) {
  const check = await context.newPage();
  await check.goto(`${PLAYGROUND}embed.html`);
  await check.evaluate(script);
  await check.waitForTimeout(1500);
  const shown = (await check.locator('#ufm-playground-bookmarklet-update').count()) > 0;
  const ok = shown === expectNotice;
  console.log(`${ok ? '✓' : '✗'} Update notice with the ${name}: ${shown ? 'shown' : 'not shown'}`);
  if (!ok) failures++;
  await check.close();
}

await browser.close();
server.httpServer.close();
console.log(failures ? `\n${failures} failed` : `\nAll passed (${expectedDifferences} expected differences)`);
process.exit(failures ? 1 : 0);
