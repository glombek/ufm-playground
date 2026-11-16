/**
 * The script to include on other sites to use `<ufm-preview>`:
 *
 *   <script type="module" src="https://ufm-playground.joe.gl/embed.js"></script>
 *
 * It's deliberately tiny. Each `<ufm-preview>` loads the renderer (`embed-core.js`) for the Umbraco
 * version in its `version` attribute (e.g. `version="17"`), or the latest without one, from that
 * version's folder, and shows a `<ufm-preview-core>` with the same attributes.
 */
declare const __UMBRACO_VERSION__: string;

const LATEST = __UMBRACO_VERSION__.split('.')[0];

/** Properties that can be set from script, as well as by attribute. */
const PROPERTIES = ['template', 'values', 'mode', 'icon', 'showTemplate', 'editable', 'playground'];

/** Attributes that apply to `<ufm-preview>` itself, rather than being passed to the renderer. */
const OWN_ATTRIBUTES = new Set(['version', 'id', 'class', 'style', 'slot']);

/** Only one version's renderer can be on a page, as they define the same elements. */
let loaded: { major: string; ready: Promise<unknown> } | undefined;

async function loadRenderer(major: string): Promise<unknown> {
  // Another version's renderer only rules this one out if it loads: one that fails frees the page
  while (loaded && loaded.major !== major) {
    const other = loaded;
    if (await other.ready.then(() => true, () => false)) {
      throw new Error(`This page already shows Umbraco ${other.major} previews, and only one version can be used on a page.`);
    }
  }
  if (!loaded) {
    const file = import.meta.url.endsWith('.ts') ? 'embed-core.ts' : 'embed-core.js';
    const url = new URL(major === LATEST ? file : `v${major}/${file}`, import.meta.url);
    const ready = import(/* @vite-ignore */ url.href).catch(() => {
      loaded = undefined;
      throw new Error(`There's no Umbraco ${major} version of the UFM playground.`);
    });
    loaded = { major, ready };
  }
  return loaded.ready;
}

export class UfmPreviewElement extends HTMLElement {
  #inner?: HTMLElement & Record<string, unknown>;
  /** Properties set before the renderer loaded. */
  #properties: Record<string, unknown> = {};
  #observer = new MutationObserver(() => this.#copyAttributes());

  static {
    for (const name of PROPERTIES) {
      Object.defineProperty(this.prototype, name, {
        get(this: UfmPreviewElement) {
          return this.#inner ? this.#inner[name] : this.#properties[name];
        },
        set(this: UfmPreviewElement, value: unknown) {
          if (this.#inner) this.#inner[name] = value;
          else this.#properties[name] = value;
        },
      });
    }
  }

  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host { display: block; } .error { color: #d42054; }';
    root.append(style);
    const major = (this.getAttribute('version') ?? LATEST).replace(/^v/i, '').split('.')[0];
    loadRenderer(major).then(
      () => {
        this.#inner = document.createElement('ufm-preview-core') as unknown as HTMLElement & Record<string, unknown>;
        this.#copyAttributes();
        Object.assign(this.#inner, this.#properties);
        root.append(this.#inner);
        this.#observer.observe(this, { attributes: true });
      },
      (error: Error) => {
        const message = document.createElement('p');
        message.className = 'error';
        message.textContent = error.message;
        root.append(message);
      },
    );
  }

  #copyAttributes() {
    const inner = this.#inner;
    if (!inner) return;
    for (const { name } of [...inner.attributes]) if (!this.hasAttribute(name)) inner.removeAttribute(name);
    for (const { name, value } of this.attributes) if (!OWN_ATTRIBUTES.has(name)) inner.setAttribute(name, value);
  }
}

if (!customElements.get('ufm-preview')) customElements.define('ufm-preview', UfmPreviewElement);

declare global {
  interface HTMLElementTagNameMap {
    'ufm-preview': UfmPreviewElement;
  }
}
