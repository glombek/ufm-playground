// Checks every example in the playground renders what Umbraco itself rendered for the same
// template and values (recorded from the UFM cheat sheet's sample Umbraco site), and that embed.js
// works when included from another origin.
//
//   npm run build && npm test
import { createServer } from 'node:http';
import { preview } from 'vite';
import { chromium } from 'playwright';

const EXPECTED = {
  Expression: ["A text block with the heading 'Contact us'"],
  'Label value component': ['Contact us / Contact us'],
  'Content picker': ['Call to Action: Contact us'],
  'Multi URL picker': ['Call to Action: Make an enquiry (https://example.com/contact)'],
  'Rich text': ['Text module: This is some text from a rich text editor.'],
  Truncate: ['Text module: This is some text from a rich text…'],
  'Word limit': ['Text module: This is some text'],
  'Yes/No': ['Text with image (Image right)', 'Text with image (Image left)'],
  Settings: ['Text with image (Image right)', 'Text with image (Image left)'],
  $index: ['1. Thing 1', '2. Thing 2', '3. Cat (in hat)'],
  Fallbacks: ['Contact us', 'Untitled heading', 'Untitled heading'],
  'Fallback to another field': ['A title', 'Some body text, beca…'],
  'Markdown and HTML': ["Quote: Joe, you're actually quite funny sometimes - Lotte Pitcher"],
  'Web components': ['Contact us New'],
  Arrays: ['Things: Thing 1 / Thing 2 / Cat (in hat) (3 tags)'],
  'Nested blocks': ['Tabs: Umbraco development / .NET development / Front-end builds'],
  'Colour picker': ['Colour: Raspberry (#e91e63)'],
  Localisation: ['Name: Contact us'],
  'Collection column': ['Page 1 ⭐ Featured', 'Page 2'],
  'Property description': ['Property Descriptions support UFM too, so you can use Markdown, links and localisation ("Name").'],
  'Gotcha: arrow function without brackets': ['Things:'],
  'Gotcha: filter arguments in expressions': [
    "Text module: This is some text from a rich text editor. It goes on a bit, so it's a good candidate for truncating.…",
  ],
};

const server = await preview({ preview: { port: 4174, strictPort: true } });
const base = 'http://localhost:4174/';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const errors = [];
let current = 'initial load';
page.on('pageerror', (e) => errors.push(`${current}: ${e.message}`));

const readPreview = () =>
  page.evaluate(() => {
    const deep = (n) => {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent;
      if (n.nodeType !== 1 && n.nodeType !== 11) return '';
      if (n.tagName === 'STYLE') return '';
      if (n.tagName === 'SLOT') return [...n.assignedNodes()].map(deep).join('');
      return [...(n.shadowRoot ?? n).childNodes].map(deep).join('');
    };
    const text = (n) => deep(n).replace(/\s+/g, ' ').trim();
    const app = document.querySelector('ufm-playground-app').shadowRoot;
    // Block labels are rendered by the block list editor; collections and descriptions by <ufm-preview>
    const preview = app.querySelector('ufm-preview[mode="collection"], ufm-preview[mode="description"]')?.shadowRoot;
    const blocks = app.querySelector('ufm-block-list-editor')?.shadowRoot;
    const rows = preview
      ? [...preview.querySelectorAll('tbody tr:not(.empty), .property')]
      : [...(blocks?.querySelectorAll('.block > .header umb-ufm-render') ?? [])];
    const empty = app.querySelector('ufm-preview.empty-preview')?.shadowRoot?.querySelector('umb-ufm-render');
    return { rows: rows.map(text), empty: empty ? text(empty) : undefined, blankWarning: !!app.querySelector('.blank-warning') };
  });

// What the "Nothing filled in" block shows, for a few examples
const EXPECTED_EMPTY = {
  Expression: { text: "A text block with the heading ''", blankWarning: false },
  'Label value component': { text: '/', blankWarning: false },
  Fallbacks: { text: 'Untitled heading', blankWarning: false },
  'Nested blocks': { text: 'Tabs:', blankWarning: false },
  'Gotcha: arrow function without brackets': { text: 'Things:', blankWarning: false },
};

let failures = 0;
await page.goto(base);
await page.waitForTimeout(3000);
const examples = page.locator('ufm-playground-app uui-select').first().locator('select');
const names = (await examples.locator('option').allTextContents()).map((name) => name.trim());

for (const [name, expected] of Object.entries(EXPECTED)) {
  if (!names.includes(name)) {
    console.log(`✗ ${name}: example not found`);
    failures++;
    continue;
  }
  current = name;
  await examples.selectOption({ label: name });
  await page.waitForTimeout(1000);
  const { rows, empty, blankWarning } = await readPreview();
  const ok = JSON.stringify(rows) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(rows)}`}`);
  if (!ok) failures++;

  if (EXPECTED_EMPTY[name]) {
    const actualEmpty = { text: empty, blankWarning };
    const emptyOk = JSON.stringify(actualEmpty) === JSON.stringify(EXPECTED_EMPTY[name]);
    console.log(`${emptyOk ? '✓' : '✗'} ${name} (nothing filled in)${emptyOk ? '' : `\n    expected ${JSON.stringify(EXPECTED_EMPTY[name])}\n    actual   ${JSON.stringify(actualEmpty)}`}`);
    if (!emptyOk) failures++;
  }
}

// Values the template doesn't use (e.g. a real block's, from the bookmarklet) are kept, so they're
// there when the template uses them
current = 'unused values';
const encode = (state) => Buffer.from(JSON.stringify(state)).toString('base64url');
const decode = (hash) => JSON.parse(Buffer.from(hash.replace(/^#/, ''), 'base64url').toString());
await page.goto(`${base}#${encode({ template: 'No values here', values: [{ heading: 'Real heading' }, {}], exact: true })}`);
await page.reload();
await page.waitForTimeout(3000);
const saved = decode(await page.evaluate(() => location.hash));
await page.goto(`${base}#${encode({ ...saved, template: '${ heading || "(none)" }' })}`);
await page.reload();
await page.waitForTimeout(3000);
const kept = await readPreview();
const keptOk = saved.values?.[0]?.heading === 'Real heading' && JSON.stringify(kept.rows) === JSON.stringify(['Real heading', '(none)']);
console.log(`${keptOk ? '✓' : '✗'} Unused values are kept${keptOk ? '' : ` ${JSON.stringify({ saved, rows: kept.rows })}`}`);
if (!keptOk) failures++;

// A label that's blank when nothing's filled in gets a warning
current = 'blank label';
await page.goto(`${base}#${Buffer.from(JSON.stringify({ template: '{=heading}' })).toString('base64url')}`);
await page.reload();
await page.waitForTimeout(3000);
const blank = await readPreview();
const blankOk = blank.empty === '' && blank.blankWarning;
console.log(`${blankOk ? '✓' : '✗'} Blank label warning${blankOk ? '' : ` ${JSON.stringify(blank)}`}`);
if (!blankOk) failures++;

// embed.js from another origin
const blog = createServer((_, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><ufm-preview template='{=heading} <uui-tag color="positive">New</uui-tag>' values='{"heading":"Embedded"}' playground></ufm-preview>
    <script type="module" src="${base}embed.js"></script>`);
}).listen(4175);
current = 'embed';
await page.goto('http://localhost:4175/');
await page.waitForTimeout(2000);
const embedded = await page.evaluate(() => {
  const root = document.querySelector('ufm-preview').shadowRoot;
  const tag = root.querySelector('umb-ufm-render').shadowRoot.querySelector('uui-tag');
  return { text: root.querySelector('.block')?.textContent.trim(), tagColour: tag && getComputedStyle(tag).backgroundColor, link: root.querySelector('a.playground')?.href };
});
const embedOk = embedded.tagColour === 'rgb(11, 129, 82)' && embedded.link?.startsWith(base);
console.log(`${embedOk ? '✓' : '✗'} embed.js from another origin${embedOk ? '' : ` ${JSON.stringify(embedded)}`}`);
if (!embedOk) failures++;

// Umbraco's <umb-ufm-js-expression> re-evaluates as it's removed, after it's lost the UFM context
// (and so its filters), so an expression using a filter pipe throws "… is not a function" when a
// template is replaced. It's harmless (the element's on its way out), so only report it.
const isTeardownQuirk = (error) => / is not a function$/.test(error);
const quirks = errors.filter(isTeardownQuirk);
const realErrors = errors.filter((e) => !isTeardownQuirk(e));
if (quirks.length) console.log(`ℹ Ignored ${quirks.length} known teardown error(s) from Umbraco's expression element: ${quirks.join('; ')}`);
if (realErrors.length) {
  console.log(`✗ Page errors: ${realErrors.join('; ')}`);
  failures++;
}

await browser.close();
blog.close();
server.httpServer.close();
console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
