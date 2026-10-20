/**
 * `<ufm-embed-dialog>`: choose the options for embedding what's in the playground in another page
 * with `<ufm-preview>`, see how it'll look, and copy the code.
 */
import { css, html, LitElement, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { PlaygroundState } from '../state.js';
import '../components/ufm-preview.js';

interface EmbedOptions {
  showTemplate: boolean;
  editable: boolean;
  playground: boolean;
  icon: string;
  script: boolean;
}

const DEFAULT_ICON = 'icon-document';

export class UfmEmbedDialogElement extends LitElement {
  static override properties = {
    state: { attribute: false },
    _options: { state: true },
    _copied: { state: true },
  };

  state?: PlaygroundState;

  private _options: EmbedOptions = { showTemplate: true, editable: true, playground: true, icon: DEFAULT_ICON, script: true };
  private _copied = false;

  open() {
    this.shadowRoot?.querySelector('dialog')?.showModal();
  }

  #close() {
    this.shadowRoot?.querySelector('dialog')?.close();
  }

  #set<K extends keyof EmbedOptions>(option: K, value: EmbedOptions[K]) {
    this._options = { ...this._options, [option]: value };
  }

  get #code() {
    if (!this.state) return '';
    const { showTemplate, editable, playground, icon, script } = this._options;
    const attribute = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const values = JSON.stringify(this.state.values ?? {}).replace(/'/g, '&#39;');
    const mode = this.state.mode ?? 'block';
    const attributes = [
      `template="${attribute(this.state.template)}"`,
      `values='${values}'`,
      mode === 'block' ? '' : `mode="${mode}"`,
      mode === 'block' && icon && icon !== DEFAULT_ICON ? `icon="${attribute(icon)}"` : '',
      editable ? 'editable' : showTemplate ? 'show-template' : '',
      playground ? 'playground' : '',
    ].filter((a) => a);
    const element = `<ufm-preview ${attributes.join(' ')}></ufm-preview>`;
    return script ? `<script type="module" src="${location.origin}/embed.js"></script>\n\n${element}` : element;
  }

  async #copy() {
    await navigator.clipboard.writeText(this.#code);
    this._copied = true;
    setTimeout(() => (this._copied = false), 2000);
  }

  override render() {
    const { showTemplate, editable, playground, icon, script } = this._options;
    const mode = this.state?.mode ?? 'block';
    return html`<dialog @click=${(e: Event) => e.target === e.currentTarget && this.#close()}>
      <uui-dialog-layout headline="Embed code">
        <p>Show what's in the playground on another page, like a blog post, with a live preview rendered by Umbraco's own UFM code.</p>

        <div class="options">
          <uui-toggle label="Show the template" .checked=${showTemplate || editable} ?disabled=${editable} @change=${(e: Event) => this.#set('showTemplate', (e.target as HTMLInputElement).checked)}></uui-toggle>
          <uui-toggle label="Let readers edit the template" .checked=${editable} @change=${(e: Event) => this.#set('editable', (e.target as HTMLInputElement).checked)}></uui-toggle>
          <uui-toggle label='Add an "Open in the UFM playground" link' .checked=${playground} @change=${(e: Event) => this.#set('playground', (e.target as HTMLInputElement).checked)}></uui-toggle>
          <uui-toggle label="Include the script (once per page)" .checked=${script} @change=${(e: Event) => this.#set('script', (e.target as HTMLInputElement).checked)}></uui-toggle>
          ${mode === 'block'
            ? html`<label class="icon">
                <span>Block icon</span>
                <uui-input label="Block icon" .value=${icon} placeholder=${DEFAULT_ICON} @input=${(e: Event) => this.#set('icon', (e.target as HTMLInputElement).value)}>
                  <umb-icon slot="prepend" name=${icon || DEFAULT_ICON}></umb-icon>
                </uui-input>
              </label>`
            : nothing}
        </div>

        <h3>Preview</h3>
        ${this.state
          ? html`<ufm-preview
              .template=${this.state.template}
              .values=${this.state.values}
              .mode=${mode}
              .icon=${icon || DEFAULT_ICON}
              .showTemplate=${showTemplate}
              .editable=${editable}
              .playground=${playground}></ufm-preview>`
          : nothing}

        <h3>Code</h3>
        <pre class="code"><code>${this.#code}</code></pre>

        <uui-button slot="actions" label="Close" @click=${this.#close}></uui-button>
        <uui-button slot="actions" look="primary" color="positive" label=${this._copied ? 'Copied!' : 'Copy code'} .state=${this._copied ? 'success' : undefined} @click=${this.#copy}></uui-button>
      </uui-dialog-layout>
    </dialog>`;
  }

  static override styles = css`
    dialog {
      width: min(760px, calc(100% - 32px));
      max-height: calc(100vh - 64px);
      padding: 0;
      border: none;
      border-radius: var(--uui-border-radius-3, 15px);
      box-shadow: var(--uui-shadow-depth-5);
      background: var(--uui-color-surface);
      color: var(--uui-color-text);
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.4);
    }
    uui-dialog-layout {
      display: block;
    }
    p {
      margin-top: 0;
    }
    .options {
      display: flex;
      flex-direction: column;
      gap: var(--uui-size-space-3);
    }
    .icon {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3);
    }
    .icon uui-input {
      width: 240px;
    }
    .icon umb-icon {
      margin: 0 var(--uui-size-space-2) 0 var(--uui-size-space-3);
    }
    h3 {
      margin: var(--uui-size-space-5) 0 var(--uui-size-space-2);
      font-size: 1rem;
    }
    .code {
      margin: 0;
      padding: var(--uui-size-space-3) var(--uui-size-space-4);
      border-radius: var(--uui-border-radius);
      background: var(--uui-color-surface-alt);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 13px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 200px;
      overflow: auto;
    }
  `;
}

customElements.define('ufm-embed-dialog', UfmEmbedDialogElement);

declare global {
  interface HTMLElementTagNameMap {
    'ufm-embed-dialog': UfmEmbedDialogElement;
  }
}
