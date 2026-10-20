/**
 * `<ufm-value-editor>`: edits one placeholder value, laid out like a property in the backoffice,
 * using the backoffice's own inputs where they work without a server: the rich text editor
 * (TipTap), repeatable textstrings and the code editor (for JSON).
 *
 * Fires `change` with the new placeholder in `detail`.
 */
import { css, html, LitElement, nothing } from '@umbraco-cms/backoffice/external/lit';
import '@umb-core/property/components/property-layout/property-layout.element.js';
import '@umb-core/components/multiple-text-string-input/input-multiple-text-string.element.js';
import '@umb-core/components/multiple-text-string-input/input-multiple-text-string-item.element.js';
import '@umb-core/components/input-toggle/input-toggle.element.js';
import '@umb-tags/components/tags-input/tags-input.element.js';
import '@umbraco-cms/backoffice/code-editor';
import type { AliasUsage, ValueKind } from '../analysis/analyse.js';
import { convertPlaceholder, humanise, KINDS, nestedAliasesOf, type Link, type Placeholder } from '../analysis/placeholders.js';
import { registerRichTextEditor, richTextConfiguration } from './rich-text.js';

registerRichTextEditor();

type Changeable = HTMLElement & { value?: unknown; checked?: boolean; items?: Array<string>; code?: string };

export class UfmValueEditorElement extends LitElement {
  static override properties = {
    alias: { type: String },
    prefix: { type: String },
    placeholder: { attribute: false },
    usage: { attribute: false },
    _editing: { state: true },
    _extraColumns: { state: true },
    _removedColumns: { state: true },
  };

  alias = '';
  /** Shown before the alias, e.g. `$settings.` */
  prefix = '';
  placeholder?: Placeholder;
  usage?: AliasUsage;

  /** The index of the picked item or link being edited. */
  private _editing?: number;
  /** Properties added to nested blocks, beyond the ones the template uses. */
  private _extraColumns: Array<string> = [];
  /** Properties removed from nested blocks, which stay hidden even if the template uses them. */
  private _removedColumns: Array<string> = [];

  #change(placeholder: Placeholder) {
    this.placeholder = placeholder;
    this.dispatchEvent(new CustomEvent('change', { detail: placeholder }));
  }

  #set(value: unknown) {
    this.#change({ ...this.placeholder!, value } as Placeholder);
  }

  override render() {
    const p = this.placeholder;
    if (!p) return nothing;
    return html`
      <umb-property-layout label=${humanise(this.alias)} alias=${this.alias} description=${`\`${this.prefix}${this.alias}\` · ${KINDS[p.kind].description}`}>
        <div slot="action-menu" class="options">
          <uui-select
            label="Kind of value"
            .options=${Object.entries(KINDS).map(([value, info]) => ({ name: info.label, value, selected: value === p.kind }))}
            @change=${(e: Event) => this.#change(convertPlaceholder(p, (e.target as Changeable).value as ValueKind, this.usage))}></uui-select>
          <uui-toggle
            label="Unset"
            title="As if the property had never been given a value"
            .checked=${!!p.unset}
            @change=${(e: Event) => this.#change({ ...p, unset: (e.target as Changeable).checked })}></uui-toggle>
        </div>
        <div slot="editor">${p.unset ? html`<p class="unset">No value</p>` : this.#renderEditor(p)}</div>
      </umb-property-layout>
    `;
  }

  #renderEditor(p: Placeholder) {
    const value = (e: Event) => (e.target as Changeable).value;
    switch (p.kind) {
      case 'text':
        return html`<uui-input label=${this.alias} .value=${p.value} @input=${(e: Event) => this.#set(String(value(e) ?? ''))}></uui-input>`;
      case 'number':
        return html`<uui-input
          type="number"
          label=${this.alias}
          .value=${p.value === null ? '' : String(p.value)}
          @input=${(e: Event) => this.#set(value(e) === '' ? null : Number(value(e)))}></uui-input>`;
      case 'boolean':
        return html`<umb-input-toggle .checked=${p.value} .showLabels=${true} .labelOn=${'True'} .labelOff=${'False'} @change=${(e: Event) => this.#set((e.target as Changeable).checked)}></umb-input-toggle>`;
      case 'richText':
        return html`<umb-input-tiptap .configuration=${richTextConfiguration} .value=${p.value} @change=${(e: Event) => this.#set(String(value(e) ?? ''))}></umb-input-tiptap>`;
      case 'list':
        return html`<umb-input-multiple-text-string .items=${p.value} @change=${(e: Event) => this.#set([...((e.target as Changeable).items ?? [])])}></umb-input-multiple-text-string>`;
      case 'tags':
        // No tag group, so it doesn't ask the (non-existent) server for suggestions
        return html`<umb-tags-input .items=${p.value} @change=${(e: Event) => this.#set([...((e.target as Changeable).items ?? [])])}></umb-tags-input>`;
      case 'names':
        return this.#renderPicked(p.value, 'icon-document', (name) => name, (name, _, editing) =>
          editing
            ? html`<uui-input label="Name" .value=${name} @change=${(e: Event) => this.#updateItem(String(value(e)))}></uui-input>`
            : nothing,
        );
      case 'links':
        return this.#renderPicked(p.value, 'icon-link', (link) => link.name || link.url, (link, _, editing) =>
          editing
            ? html`<div class="link-fields">
                <uui-input label="Link title" placeholder="Link title" .value=${link.name} @change=${(e: Event) => this.#updateItem({ ...link, name: String(value(e)) })}></uui-input>
                <uui-input label="URL" placeholder="URL" .value=${link.url} @change=${(e: Event) => this.#updateItem({ ...link, url: String(value(e)) })}></uui-input>
              </div>`
            : nothing,
        );
      case 'blocks':
        return this.#renderNestedBlocks(p.value);
      case 'object':
        return html`<umb-code-editor
          class="json"
          language="json"
          .code=${p.value}
          .disableMinimap=${true}
          .disableLineNumbers=${true}
          .disableFolding=${true}
          @input=${(e: Event) => {
            e.stopPropagation();
            this.#set((e.target as Changeable).code ?? '');
          }}></umb-code-editor>`;
    }
  }

  /** Picked items and links, shown like the backoffice's pickers. */
  #renderPicked<T extends string | Link>(
    items: Array<T>,
    icon: string,
    nameOf: (item: T) => string,
    renderEditing: (item: T, index: number, editing: boolean) => unknown,
  ) {
    const empty = (typeof items[0] === 'object' || this.placeholder?.kind === 'links' ? { name: '', url: '' } : '') as T;
    return html`
      <uui-ref-list>
        ${items.map(
          (item, index) => html`
            <uui-ref-node name=${nameOf(item) || '(untitled)'} detail=${typeof item === 'object' ? item.url : ''} @open=${() => (this._editing = this._editing === index ? undefined : index)}>
              <umb-icon slot="icon" name=${icon}></umb-icon>
              <uui-action-bar slot="actions">
                <uui-button label="Edit" @click=${() => (this._editing = this._editing === index ? undefined : index)}></uui-button>
                <uui-button label="Remove" @click=${() => this.#set(items.filter((_, i) => i !== index))}></uui-button>
              </uui-action-bar>
            </uui-ref-node>
            ${renderEditing(item, index, this._editing === index)}
          `,
        )}
      </uui-ref-list>
      <uui-button
        class="add"
        look="placeholder"
        label="Choose"
        @click=${() => {
          this.#set([...items, empty]);
          this._editing = items.length;
        }}></uui-button>
    `;
  }

  #updateItem(item: unknown) {
    const items = [...(this.placeholder!.value as Array<unknown>)];
    items[this._editing!] = item;
    this.#set(items);
  }

  /**
   * Nested blocks, as a table: a row per block, and a column per property of theirs that the template
   * reads (e.g. `v.alias == "heading"`). Labels for the nested blocks themselves don't matter here.
   */
  #renderNestedBlocks(blocks: Array<Record<string, unknown>>) {
    const aliases = [
      ...new Set([...blocks.flatMap((b) => Object.keys(b)), ...this._extraColumns, ...(this.usage ? nestedAliasesOf(this.usage) : [])]),
    ].filter((alias) => !this._removedColumns.includes(alias));
    // Values that aren't text (e.g. a toggle's true, a picker's array) are shown, and edited, as JSON,
    // so they keep their type, as labels might depend on it
    const display = (value: unknown) => (value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value));
    const update = (index: number, alias: string, text: string) =>
      this.#set(
        blocks.map((b, i) => {
          if (i !== index) return b;
          let value: unknown = text;
          if (b[alias] !== undefined && b[alias] !== null && typeof b[alias] !== 'string') {
            try {
              value = JSON.parse(text);
            } catch {
              // Not valid JSON (yet), so keep it as text
            }
          }
          return { ...b, [alias]: value };
        }),
      );

    const addColumn = () => {
      let n = aliases.length + 1;
      while (aliases.includes(`property${n}`)) n++;
      const alias = `property${n}`;
      this._extraColumns = [...this._extraColumns, alias];
      this._removedColumns = this._removedColumns.filter((a) => a !== alias);
      this.#set(blocks.map((b) => ({ ...b, [alias]: '' })));
      // Ready to rename it
      this.updateComplete.then(() => (this.shadowRoot?.querySelector(`.nested-heading uui-input[data-alias="${alias}"]`) as HTMLElement | null)?.focus());
    };
    const renameColumn = (from: string, input: HTMLElement & { value: string }) => {
      const to = input.value.trim();
      if (to === from) return;
      if (!/^[a-zA-Z_$][\w$]*$/.test(to) || aliases.includes(to)) {
        input.value = from; // Not a valid alias, or already used
        return;
      }
      this._extraColumns = this._extraColumns.map((a) => (a === from ? to : a));
      this._removedColumns = [...this._removedColumns.filter((a) => a !== to), from];
      this.#set(blocks.map((b) => Object.fromEntries(Object.entries(b).map(([alias, value]) => [alias === from ? to : alias, value]))));
    };
    const removeColumn = (alias: string) => {
      this._extraColumns = this._extraColumns.filter((a) => a !== alias);
      this._removedColumns = [...this._removedColumns, alias];
      this.#set(blocks.map((b) => Object.fromEntries(Object.entries(b).filter(([a]) => a !== alias))));
    };

    return html`
      <div class="nested" style=${`grid-template-columns: repeat(${aliases.length}, minmax(0, 1fr)) auto`}>
        ${aliases.map(
          (alias) => html`<div class="nested-heading">
            <uui-input
              data-alias=${alias}
              label="Property alias"
              title="Rename this property"
              .value=${alias}
              @change=${(e: Event) => renameColumn(alias, e.target as HTMLElement & { value: string })}
              @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && (e.target as HTMLElement).blur()}>
              <uui-button slot="append" compact label="Remove ${alias}" title="Remove this property from every block" @click=${() => removeColumn(alias)}>
                <uui-icon name="icon-trash"></uui-icon>
              </uui-button>
            </uui-input>
          </div>`,
        )}
        <uui-button compact look="secondary" label="Add a property" title="Add a property" @click=${addColumn}>
          <uui-icon name="icon-add"></uui-icon>
        </uui-button>
        ${blocks.map(
          (block, index) => html`
            ${aliases.map(
              (alias) => html`<uui-input
                label="${humanise(alias)} for block ${index + 1}"
                .value=${display(block[alias])}
                @input=${(e: Event) => update(index, alias, String((e.target as Changeable).value ?? ''))}></uui-input>`,
            )}
            <uui-button compact label="Remove block ${index + 1}" title="Remove this block" @click=${() => this.#set(blocks.filter((_, i) => i !== index))}>
              <uui-icon name="icon-trash"></uui-icon>
            </uui-button>
          `,
        )}
      </div>
      ${(this.usage ? [...this.usage.nestedAliases] : [])
        .filter((alias) => this._removedColumns.includes(alias))
        .map(
          (alias) => html`<p class="hint">
            The template reads <code>${alias}</code>, which these blocks no longer have.
            <uui-button compact look="secondary" label="Add it back" @click=${() => (this._removedColumns = this._removedColumns.filter((a) => a !== alias))}></uui-button>
          </p>`,
        )}
      <uui-button
        class="add"
        look="placeholder"
        label="Add block"
        @click=${() => this.#set([...blocks, Object.fromEntries(aliases.map((a) => [a, `New ${humanise(a).toLowerCase()}`]))])}></uui-button>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }
    umb-property-layout {
      padding: var(--uui-size-space-4) 0;
    }
    .options {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3);
      margin: var(--uui-size-space-2) 0;
    }
    uui-input,
    umb-input-tiptap,
    umb-input-multiple-text-string {
      width: 100%;
    }
    .unset {
      margin: 0;
      color: var(--uui-color-text-alt);
      font-style: italic;
    }
    .json {
      display: block;
      height: 120px;
      border: 1px solid var(--uui-color-border);
    }
    uui-ref-node {
      padding: var(--uui-size-space-1) 0;
    }
    .link-fields {
      display: flex;
      gap: var(--uui-size-space-2);
      margin-bottom: var(--uui-size-space-3);
    }
    .add {
      width: 100%;
    }
    .nested {
      display: grid;
      gap: var(--uui-size-space-2);
      align-items: center;
    }
    .nested-heading uui-input {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-weight: 700;
      --uui-input-background-color: var(--uui-color-surface-alt);
    }
    .nested + .add,
    .hint + .add {
      margin-top: var(--uui-size-space-3);
    }
    .hint {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--uui-size-space-2);
      margin: var(--uui-size-space-3) 0 0;
      color: var(--uui-color-text-alt);
    }
  `;
}

customElements.define('ufm-value-editor', UfmValueEditorElement);

declare global {
  interface HTMLElementTagNameMap {
    'ufm-value-editor': UfmValueEditorElement;
  }
}
