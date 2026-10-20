/**
 * "Send to UFM Playground": run on a document in the Umbraco backoffice (14+), it opens the
 * playground with the block labels on the page: their real templates and real values.
 *
 * It doesn't use the Management API. Every block label in the backoffice is rendered by an
 * `<umb-ufm-render>` element, which holds the label's template (`markdown`) and the exact value
 * Umbraco gives it (`value`), so it reads those. Picked items' keys are swapped for the names
 * Umbraco has already looked up and rendered.
 *
 * This is built on its own (see vite.bookmarklet.config.ts) as a self-contained script, and the
 * install page turns it into a `javascript:` link. Nothing is sent anywhere: the values go to the
 * playground in the URL's hash, which browsers don't send to servers.
 */

declare const __PLAYGROUND_URL__: string;
/** A hash of the bookmarklet's source, set when it's built (see vite.bookmarklet.config.ts). */
declare const __BOOKMARKLET_VERSION__: string;

type Values = Record<string, unknown>;

interface UfmRenderElement extends HTMLElement {
  markdown?: string;
  value?: Values;
}

interface LabelGroup {
  propertyAlias: string;
  propertyLabel: string;
  template: string;
  blocks: Array<{ values: Values; text: string; names: Record<string, PickedNames> }>;
}

/** Names looked up by a picker component (`UFM-CONTENT-NAME`, `UFM-MEMBER-NAME` or `UFM-LINK`). */
interface PickedNames {
  component: string;
  names: Array<string>;
}

const BLOCK_ENTRIES = new Set(['UMB-BLOCK-LIST-ENTRY', 'UMB-BLOCK-GRID-ENTRY', 'UMB-RTE-BLOCK', 'UMB-RTE-BLOCK-INLINE']);
const PICKER_COMPONENTS = new Set(['UFM-CONTENT-NAME', 'UFM-MEMBER-NAME', 'UFM-LINK']);
const OVERLAY_ID = 'ufm-playground-bookmarklet';

/** Finds every block label on the page, grouped by property and template. */
function findLabels(): Array<LabelGroup> {
  const groups = new Map<string, LabelGroup>();
  const seenEntries = new Set<Element>();

  const walk = (root: Element | ShadowRoot, property: { alias: string; label: string } | undefined, entry: Element | undefined) => {
    for (const el of Array.from(root.children)) {
      let currentProperty = property;
      let currentEntry = entry;
      if (el.tagName === 'UMB-PROPERTY-LAYOUT') {
        const layout = el as HTMLElement & { alias?: string; label?: string };
        currentProperty = { alias: layout.alias ?? '', label: layout.label ?? layout.alias ?? '' };
      }
      if (BLOCK_ENTRIES.has(el.tagName)) currentEntry = el;

      if (el.tagName === 'UMB-UFM-RENDER' && currentEntry && !seenEntries.has(currentEntry)) {
        const render = el as UfmRenderElement;
        if (render.markdown !== undefined && render.value && typeof render.value === 'object') {
          // One label per block (some blocks render a second, hidden, copy)
          seenEntries.add(currentEntry);
          const propertyAlias = currentProperty?.alias ?? '';
          const key = `${propertyAlias}\n${render.markdown}`;
          if (!groups.has(key)) {
            groups.set(key, { propertyAlias, propertyLabel: currentProperty?.label ?? propertyAlias, template: render.markdown, blocks: [] });
          }
          groups.get(key)!.blocks.push({ values: render.value, text: textOf(render), names: pickedNames(render) });
        }
      }

      walk(el, currentProperty, currentEntry);
      if (el.shadowRoot) walk(el.shadowRoot, currentProperty, currentEntry);
    }
  };

  walk(document.documentElement, undefined, undefined);
  return [...groups.values()];
}

/** The names umbContentName, umbMemberName and umbLink have looked up, by property alias. */
function pickedNames(render: UfmRenderElement) {
  const names: Record<string, PickedNames> = {};
  const walk = (root: Element | ShadowRoot) => {
    for (const el of Array.from(root.children)) {
      if (PICKER_COMPONENTS.has(el.tagName)) {
        const alias = el.getAttribute('alias');
        // The element's value is the looked-up names, before any filters are applied
        const value = (el as HTMLElement & { value?: unknown }).value;
        if (alias && typeof value === 'string') names[alias] = { component: el.tagName, names: value ? value.split(', ') : [] };
      }
      walk(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  if (render.shadowRoot) walk(render.shadowRoot);
  return names;
}

/** The text of an element as it's displayed, following shadow roots. */
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return '';
  if (node instanceof Element && node.tagName === 'STYLE') return '';
  if (node instanceof HTMLSlotElement) return node.assignedNodes().map(textOf).join('');
  const children = node instanceof Element && node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
  return Array.from(children).map(textOf).join('').replace(/\s+/g, ' ').trim();
}

/** Turns a group of labels into the playground's state. */
function toState(group: LabelGroup) {
  const kinds: Record<string, string> = {};
  const values = group.blocks.map(({ values, names }) => {
    const { $index: _, ...rest } = values;
    const item: Values = JSON.parse(JSON.stringify(rest));
    for (const [alias, { component, names: picked }] of Object.entries(names)) {
      if (component === 'UFM-LINK') {
        // Keep the links (their URLs might be used too), filling in names Umbraco looked up
        const links = item[alias];
        if (Array.isArray(links)) item[alias] = links.map((link, i) => (link && typeof link === 'object' && !link.name ? { ...link, name: picked[i] ?? '' } : link));
      } else {
        // Keys mean nothing outside the site, so use the names Umbraco looked up
        item[alias] = picked;
        kinds[alias] = 'names';
      }
    }
    return item;
  });
  // Umbraco leaves out properties that have never been given a value, so `exact` tells the
  // playground that anything missing is unset, rather than wanting a placeholder
  return { template: group.template, mode: 'block', values: values.length === 1 ? values[0] : values, kinds, exact: true };
}

function playgroundUrl(group: LabelGroup) {
  const json = JSON.stringify(toState(group));
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  const hash = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${__PLAYGROUND_URL__}#${hash}`;
}

// ---- A little chooser, for when there's more than one label template on the page ----------

function showOverlay(content: (overlay: HTMLElement) => void) {
  document.getElementById(OVERLAY_ID)?.remove();
  const backdrop = document.createElement('div');
  backdrop.id = OVERLAY_ID;
  backdrop.style.cssText =
    'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-family:var(--uui-font-family,sans-serif)';
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'background:#fff;color:#1b264f;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:24px;max-width:640px;width:calc(100% - 32px);max-height:80vh;overflow:auto';
  backdrop.append(overlay);
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  content(overlay);
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.cssText = 'margin-top:16px;padding:6px 14px;border:1px solid #c2c2c2;border-radius:3px;background:#fff;cursor:pointer;font:inherit';
  closeButton.addEventListener('click', close);
  overlay.append(closeButton);
  document.body.append(backdrop);
  return close;
}

function heading(text: string) {
  const h = document.createElement('h2');
  h.textContent = text;
  h.style.cssText = 'margin:0 0 8px;font-size:18px';
  return h;
}

function paragraph(text: string) {
  const p = document.createElement('p');
  p.textContent = text;
  p.style.cssText = 'margin:0 0 16px;color:#515054';
  return p;
}

function run() {
  const groups = findLabels().filter((g) => g.blocks.length);

  if (!groups.length) {
    showOverlay((overlay) => {
      overlay.append(
        heading('Send to UFM Playground'),
        paragraph(
          'No block labels found on this page. Open a document (or element) with a block list or block grid in the Umbraco backoffice, with its blocks showing, then try again.',
        ),
      );
    });
    return;
  }

  if (groups.length === 1) {
    window.open(playgroundUrl(groups[0]), '_blank');
    return;
  }

  showOverlay((overlay) => {
    overlay.append(heading('Send to UFM Playground'), paragraph('Which label would you like to try out?'));
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    for (const group of groups) {
      const button = document.createElement('button');
      button.style.cssText =
        'display:block;width:100%;text-align:left;padding:10px 14px;border:1px solid #d8d7d9;border-radius:3px;background:#fff;cursor:pointer;font:inherit;color:inherit';
      const title = document.createElement('strong');
      title.textContent = `${group.propertyLabel} · ${group.blocks.length} block${group.blocks.length === 1 ? '' : 's'}`;
      const template = document.createElement('code');
      template.textContent = group.template;
      template.style.cssText = 'display:block;margin:4px 0;font-size:13px;white-space:pre-wrap;word-break:break-word;color:#3544b1';
      const example = document.createElement('span');
      example.textContent = `e.g. "${group.blocks[0].text}"`;
      example.style.cssText = 'font-size:13px;color:#68676b';
      button.dataset.alias = group.propertyAlias;
      button.append(title, template, example);
      button.addEventListener('mouseenter', () => (button.style.borderColor = '#3544b1'));
      button.addEventListener('mouseleave', () => (button.style.borderColor = '#d8d7d9'));
      button.addEventListener('click', () => window.open(playgroundUrl(group), '_blank'));
      list.append(button);
    }
    overlay.append(list);
  });
}

/**
 * Checks whether there's a newer version of the bookmarklet, and if there is, says so (without
 * getting in the way). Bookmarklets are copies of the code, so don't update themselves.
 */
async function checkForUpdate() {
  try {
    const response = await fetch(`${__PLAYGROUND_URL__}bookmarklet-version.json`, { cache: 'no-store' });
    if (!response.ok) return;
    const { version } = (await response.json()) as { version?: string };
    if (!version || version === __BOOKMARKLET_VERSION__) return;
    showUpdateNotice();
  } catch {
    // Offline, or blocked (e.g. by a content security policy): not worth bothering anyone about
  }
}

function showUpdateNotice() {
  const id = `${OVERLAY_ID}-update`;
  document.getElementById(id)?.remove();
  const notice = document.createElement('div');
  notice.id = id;
  notice.setAttribute('role', 'status');
  notice.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:100001;max-width:360px;padding:14px 16px;border-radius:6px;background:#1b264f;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);font-family:var(--uui-font-family,sans-serif);font-size:14px;line-height:1.5';
  const text = document.createElement('div');
  text.textContent = 'There\'s a newer version of the "Send to UFM Playground" bookmarklet. ';
  const link = document.createElement('a');
  link.href = `${__PLAYGROUND_URL__}bookmarklet/`;
  link.target = '_blank';
  link.textContent = 'Update it';
  link.style.cssText = 'color:#fff;font-weight:bold';
  text.append(link);
  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.style.cssText = 'margin-top:8px;padding:2px 10px;border:1px solid rgba(255,255,255,.6);border-radius:3px;background:none;color:#fff;cursor:pointer;font:inherit';
  dismiss.addEventListener('click', () => notice.remove());
  notice.append(text, dismiss);
  document.body.append(notice);
}

run();
void checkForUpdate();
