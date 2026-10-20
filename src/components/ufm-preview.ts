/**
 * `<ufm-preview>` renders a UFM template the way the backoffice would: as a block list label, a
 * collection column or a property description. Used by the playground, and embeddable elsewhere:
 *
 *   <ufm-preview template="Call to action: {umbContentName: page}" values='{"page": "Contact us"}'></ufm-preview>
 *
 * - `values`: a JSON object of property values (plus `$settings`), or an array of them for several
 *   blocks. Any alias the template uses that isn't given gets a placeholder value.
 * - `mode`: `block` (default), `collection` or `description`.
 * - `icon`: the block's icon, e.g. `icon-document`.
 * - `show-template`: also show the template.
 * - `editable`: show the template, and let it be edited, re-rendering the preview as it changes.
 * - `playground`: add an "Open in playground" link.
 */
import { css, html, LitElement, nothing } from '@umbraco-cms/backoffice/external/lit';
import { analyse } from '../analysis/analyse.js';
import { samplePlaceholder, toRuntimeValue } from '../analysis/placeholders.js';
import { getCatalogue, startUfm } from '../ufm/runtime.js';
import { startIcons } from '../ufm/ui.js';
import { playgroundUrl } from '../state.js';

export type PreviewMode = 'block' | 'collection' | 'description';
type Values = Record<string, unknown>;

export class UfmPreviewElement extends LitElement {
  static override properties = {
    template: { type: String },
    values: { type: Object },
    mode: { type: String },
    icon: { type: String },
    showTemplate: { type: Boolean, attribute: 'show-template' },
    editable: { type: Boolean },
    playground: { type: Boolean },
    _items: { state: true },
    _edited: { state: true },
  };

  template = '';
  editable = false;
  /** The template as edited (when `editable`), if it has been. */
  private _edited?: string;
  /** Property values for one block, or an array of them for several. */
  values?: Values | Array<Values>;
  mode: PreviewMode = 'block';
  icon = 'icon-document';
  showTemplate = false;
  playground = false;
  /** When set, values are used as-is, with no placeholders added (the playground does its own). */
  exactValues = false;

  private _items?: Array<Values>;

  override connectedCallback() {
    super.connectedCallback();
    startIcons();
  }

  /** The template being previewed: as edited, or as given. */
  get #template() {
    return this._edited ?? this.template;
  }

  override async willUpdate(changed: Map<string, unknown>) {
    if (changed.has('template')) this._edited = undefined;
    if (changed.has('template') || changed.has('values') || changed.has('mode') || changed.has('_edited')) {
      await startUfm();
      this._items = await this.#buildItems();
    }
  }

  override updated(changed: Map<string, unknown>) {
    // The editable template's text is set here, rather than rendered, so re-rendering while it's
    // being edited doesn't move the cursor
    const editor = this.shadowRoot?.querySelector<HTMLElement>('pre[contenteditable]');
    if (editor && (changed.has('template') || changed.has('editable') || this._edited === undefined) && editor.textContent !== this.#template) {
      editor.textContent = this.#template;
    }
  }

  #onTemplateInput(e: Event) {
    this._edited = (e.target as HTMLElement).textContent ?? '';
  }

  #reset() {
    this._edited = undefined;
  }

  async #buildItems(): Promise<Array<Values>> {
    const given = this.values === undefined ? [{}] : Array.isArray(this.values) ? this.values : [this.values];
    if (this.exactValues) return given;

    // Fill in placeholders for anything the template uses that wasn't given
    const analysis = analyse(this.#template, await getCatalogue());
    return given.map((values, index) => {
      const item: Values = { ...values };
      for (const [alias, usage] of analysis.properties) {
        if (!(alias in item)) item[alias] = toRuntimeValue(samplePlaceholder(usage));
      }
      if (analysis.settings.size) {
        const settings: Values = { ...((item.$settings as Values | undefined) ?? {}) };
        for (const [alias, usage] of analysis.settings) {
          if (!(alias in settings)) settings[alias] = toRuntimeValue(samplePlaceholder(usage));
        }
        item.$settings = settings;
      }
      item.$index ??= index;
      return item;
    });
  }

  override render() {
    return html`
      ${this.editable ? this.#renderEditableTemplate() : this.showTemplate ? html`<pre class="template"><code>${this.template}</code></pre>` : nothing}
      ${this._items ? this.#renderPreview(this._items) : html`<div class="loading">Loading UFM…</div>`}
      ${this.playground
        ? html`<a class="playground" href=${playgroundUrl({ template: this.#template, values: this.values, mode: this.mode })} target="_blank">Open in the UFM playground ↗</a>`
        : nothing}
    `;
  }

  #renderEditableTemplate() {
    const edited = this._edited !== undefined && this._edited !== this.template;
    return html`<div class="editable">
      <pre
        class="template"
        contenteditable="plaintext-only"
        spellcheck="false"
        role="textbox"
        aria-multiline="true"
        aria-label="UFM template (editable)"
        title="Try editing the template"
        @input=${this.#onTemplateInput}></pre>
      <div class="editable-hint">
        ${edited ? html`<button type="button" class="reset" @click=${this.#reset}>Reset</button>` : html`<span>✎ Try editing the template</span>`}
      </div>
    </div>`;
  }

  #renderPreview(items: Array<Values>) {
    switch (this.mode) {
      case 'collection':
        return html`
          <table>
            <thead><tr><th>Name</th><th>Column</th></tr></thead>
            <tbody>
              ${items.map(
                (item, i) => html`<tr class=${item.$empty ? 'empty' : ''}>
                  <td>${item.$empty ? html`<em>Nothing filled in</em>` : `Page ${i + 1}`}</td>
                  <td>
                    <umb-ufm-render
                      inline
                      .markdown=${this.#template}
                      .value=${item.$empty ? {} : { value: item.value }}
                      @umb-ufm-resolved=${(e: CustomEvent<{ text: string }>) => this.#resolved(i, e)}></umb-ufm-render>
                  </td>
                </tr>`,
              )}
            </tbody>
          </table>
        `;
      case 'description':
        return html`
          <div class="property">
            <div class="property-label">
              <strong>Property</strong>
              <umb-ufm-render .markdown=${this.#template} .value=${{ alias: 'property', label: 'Property', description: this.#template }}></umb-ufm-render>
            </div>
            <div class="property-editor"></div>
          </div>
        `;
      default:
        return html`${items.map(
          (item, i) => html`<div class="block">
            <umb-icon name=${this.icon}></umb-icon>
            <umb-ufm-render
              inline
              .markdown=${this.#template}
              .value=${item}
              @umb-ufm-resolved=${(e: CustomEvent<{ text: string }>) => this.#resolved(i, e)}></umb-ufm-render>
          </div>`,
        )}`;
    }
  }

  /** Passes on the text each label rendered (once its components have resolved), e.g. to spot blank labels. */
  #resolved(index: number, e: CustomEvent<{ text: string }>) {
    this.dispatchEvent(new CustomEvent('label-resolved', { detail: { index, text: e.detail.text } }));
  }

  static override styles = css`
    :host {
      display: block;
      font-family: var(--uui-font-family, Lato, sans-serif);
      font-size: 15px;
      line-height: 1.5;
      color: var(--uui-color-text, #1b264f);
    }
    .template {
      margin: 0 0 8px;
      padding: 8px 12px;
      border-radius: 3px;
      background: #f3f3f5;
      font-size: 13px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .editable {
      margin: 0 0 8px;
    }
    .editable .template {
      margin: 0;
      border: 1px solid var(--uui-color-border, #d8d7d9);
      background: var(--uui-color-surface, #fff);
      cursor: text;
      outline: none;
    }
    .editable .template:hover {
      border-color: var(--uui-color-border-emphasis, #a1a1a1);
    }
    .editable .template:focus {
      border-color: var(--uui-color-focus, #3879ff);
      box-shadow: 0 0 0 1px var(--uui-color-focus, #3879ff);
    }
    .editable-hint {
      display: flex;
      justify-content: flex-end;
      min-height: 20px;
      margin-top: 2px;
      font-size: 12px;
      color: var(--uui-color-text-alt, #68676b);
    }
    .reset {
      font: inherit;
      padding: 0 6px;
      border: none;
      background: none;
      color: var(--uui-color-interactive, #1b264f);
      text-decoration: underline;
      cursor: pointer;
    }
    .block {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 50px;
      box-sizing: border-box;
      padding: 8px 16px;
      margin-bottom: 4px;
      border: 1px solid var(--uui-color-border, #d8d7d9);
      border-radius: 3px;
      background: var(--uui-color-surface, #fff);
    }
    .block umb-icon {
      flex: none;
      font-size: 1.2em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--uui-color-surface, #fff);
      border: 1px solid var(--uui-color-border, #d8d7d9);
    }
    th,
    td {
      text-align: left;
      padding: 10px 16px;
      border-bottom: 1px solid var(--uui-color-border, #d8d7d9);
    }
    .property {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) 2fr;
      gap: 24px;
      padding: 16px;
      background: var(--uui-color-surface, #fff);
      border: 1px solid var(--uui-color-border, #d8d7d9);
    }
    .property-editor {
      height: 40px;
      border: 1px solid var(--uui-color-border, #d8d7d9);
      border-radius: 3px;
    }
    tr.empty td {
      background: var(--uui-color-surface-alt, #f3f3f5);
      color: var(--uui-color-text-alt, #3c3c3c);
    }
    .loading {
      color: #68676b;
      font-style: italic;
    }
    .playground {
      display: inline-block;
      margin-top: 4px;
      font-size: 13px;
    }
  `;
}

if (!customElements.get('ufm-preview')) customElements.define('ufm-preview', UfmPreviewElement);

declare global {
  interface HTMLElementTagNameMap {
    'ufm-preview': UfmPreviewElement;
  }
}
