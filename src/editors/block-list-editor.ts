/**
 * `<ufm-block-list-editor>`: a list of blocks that looks and behaves like Umbraco's block list in
 * inline editing mode. Each block's label is a UFM template, rendered by the real UFM code, and
 * clicking a block opens its editor.
 *
 * It doesn't own the blocks: it renders them, and fires `add`, `duplicate` and `remove` events
 * (with the block's index in `detail`) for the owner to act on.
 */
import { css, html, LitElement, nothing, repeat, type TemplateResult } from '@umbraco-cms/backoffice/external/lit';

export class UfmBlockListEditorElement<T = unknown> extends LitElement {
  static override properties = {
    blocks: { attribute: false },
    label: { type: String },
    icon: { type: String },
    blockName: { type: String, attribute: 'block-name' },
    labelValue: { attribute: false },
    renderBlockEditor: { attribute: false },
    _open: { state: true },
  };

  blocks: Array<T> = [];
  /** The UFM label template. */
  label = '';
  icon = 'icon-document';
  /** What a block's called, for the "Add" button. */
  blockName = 'block';
  /** The value the label is rendered with. */
  labelValue: (block: T, index: number) => unknown = (block) => block;
  /** Renders the editor shown when a block's open. */
  renderBlockEditor: (block: T, index: number) => TemplateResult | typeof nothing = () => nothing;

  private _open?: number;

  /** Opens a block's editor (e.g. after adding one). */
  open(index: number | undefined) {
    this._open = index;
  }

  #fire(type: 'add' | 'duplicate' | 'remove', index?: number) {
    this.dispatchEvent(new CustomEvent(type, { detail: index }));
  }

  override render() {
    return html`
      ${repeat(
        this.blocks,
        (_, index) => index,
        (block, index) => this.#renderBlock(block, index),
      )}
      <uui-button id="add" look="placeholder" label="Add ${this.blockName}" @click=${() => this.#fire('add')}></uui-button>
    `;
  }

  #renderBlock(block: T, index: number) {
    const open = this._open === index;
    return html`
      <div class="block ${open ? 'open' : ''}">
        <div class="header">
          <button
            type="button"
            class="open-button"
            aria-expanded=${open}
            title=${open ? 'Close' : 'Edit the values'}
            @click=${() => (this._open = open ? undefined : index)}>
            <uui-symbol-expand ?open=${open}></uui-symbol-expand>
            <umb-icon name=${this.icon}></umb-icon>
            <umb-ufm-render inline .markdown=${this.label} .value=${this.labelValue(block, index)}></umb-ufm-render>
          </button>
          <uui-action-bar>
            <uui-button label="Copy" title="Add a copy of this ${this.blockName}" @click=${() => this.#fire('duplicate', index)}>
              <uui-icon name="icon-documents"></uui-icon>
            </uui-button>
            <uui-button label="Delete" title="Delete this ${this.blockName}" @click=${() => this.#fire('remove', index)}>
              <uui-icon name="icon-trash"></uui-icon>
            </uui-button>
          </uui-action-bar>
        </div>
        ${open ? html`<div class="content">${this.renderBlockEditor(block, index)}</div>` : nothing}
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--uui-size-space-2);
    }
    .block {
      position: relative;
      border: 1px solid var(--uui-color-border);
      border-radius: var(--uui-border-radius);
      background: var(--uui-color-surface);
      transition: border-color 120ms;
    }
    .block:hover,
    .block.open {
      border-color: var(--uui-color-border-emphasis);
    }
    .header {
      display: flex;
      align-items: center;
      min-height: var(--uui-size-16);
    }
    .open-button {
      flex: 1;
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3);
      min-height: var(--uui-size-16);
      padding: 0 var(--uui-size-space-4);
      border: none;
      background: none;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .open-button umb-icon {
      flex: none;
      font-size: 1.2em;
    }
    uui-action-bar {
      margin-right: var(--uui-size-space-3);
      opacity: 0;
      transition: opacity 120ms;
    }
    .block:hover uui-action-bar,
    .block:focus-within uui-action-bar,
    .block.open uui-action-bar {
      opacity: 1;
    }
    .content {
      border-top: 1px solid var(--uui-color-border);
      padding: var(--uui-size-space-2) var(--uui-size-space-5);
    }
    #add {
      width: 100%;
      --uui-button-height: var(--uui-size-16);
    }
  `;
}

customElements.define('ufm-block-list-editor', UfmBlockListEditorElement);

declare global {
  interface HTMLElementTagNameMap {
    'ufm-block-list-editor': UfmBlockListEditorElement;
  }
}
