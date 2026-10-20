/**
 * `<ufm-template-editor>`: Umbraco's code editor (Monaco), with the `ufm` language and the
 * template's diagnostics shown inline.
 */
import { css, html, LitElement } from '@umbraco-cms/backoffice/external/lit';
import '@umbraco-cms/backoffice/code-editor';
import type { UmbCodeEditorElement } from '@umbraco-cms/backoffice/code-editor';
import { monaco } from '@umbraco-cms/backoffice/external/monaco-editor';
import type * as Monaco from 'monaco-editor';
import type { Diagnostic } from '../analysis/analyse.js';
import { registerUfmLanguage, setUfmMarkers, UFM_LANGUAGE_ID } from './ufm-language/index.js';

registerUfmLanguage();

export class UfmTemplateEditorElement extends LitElement {
  static override properties = {
    value: { type: String },
    diagnostics: { attribute: false },
  };

  value = '';
  diagnostics: Array<Diagnostic> = [];

  #editor?: Monaco.editor.IStandaloneCodeEditor;

  #onLoaded(e: Event) {
    this.#editor = (e.target as UmbCodeEditorElement).editor?.monacoEditor as Monaco.editor.IStandaloneCodeEditor | undefined;
    if (!this.#editor) return;
    this.#editor.updateOptions({
      fontSize: 15,
      lineNumbers: 'off',
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 8,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      wordWrap: 'on',
      minimap: { enabled: false },
      padding: { top: 8, bottom: 8 },
      quickSuggestions: { other: true, strings: true, comments: false },
      suggestOnTriggerCharacters: true,
      fixedOverflowWidgets: true,
      tabCompletion: 'on',
    });

    const wrap = (id: string, label: string, key: number, before: string, after = before) =>
      this.#editor!.addAction({
        id,
        label,
        keybindings: [monaco.KeyMod.CtrlCmd | key],
        run: (editor) => wrapSelection(editor, before, after),
      });
    wrap('ufm.bold', 'Bold', monaco.KeyCode.KeyB, '**');
    wrap('ufm.italic', 'Italic', monaco.KeyCode.KeyI, '_');
    wrap('ufm.link', 'Link', monaco.KeyCode.KeyK, '[', '](https://)');

    this.#updateMarkers();
  }

  #onInput(e: Event) {
    e.stopPropagation();
    this.value = (e.target as UmbCodeEditorElement).code;
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('diagnostics')) this.#updateMarkers();
  }

  #updateMarkers() {
    const model = this.#editor?.getModel();
    if (model) setUfmMarkers(model, this.diagnostics);
  }

  /** Puts the cursor in the editor. */
  override focus() {
    this.#editor?.focus();
  }

  override render() {
    return html`<umb-code-editor
      language=${UFM_LANGUAGE_ID}
      label="Template"
      .code=${this.value}
      .wordWrap=${true}
      .disableMinimap=${true}
      .disableLineNumbers=${true}
      .disableFolding=${true}
      @loaded=${this.#onLoaded}
      @input=${this.#onInput}></umb-code-editor>`;
  }

  static override styles = css`
    :host {
      display: block;
      border: 1px solid var(--uui-color-border);
      border-radius: var(--uui-border-radius);
      overflow: hidden;
      resize: vertical;
      height: 140px;
      min-height: 60px;
    }
    :host(:focus-within) {
      border-color: var(--uui-color-border-emphasis);
      outline: 2px solid var(--uui-color-focus);
      outline-offset: -1px;
    }
    umb-code-editor {
      height: 100%;
    }
  `;
}

function wrapSelection(editor: Monaco.editor.ICodeEditor, before: string, after: string) {
  const selection = editor.getSelection();
  const model = editor.getModel();
  if (!selection || !model) return;
  const text = model.getValueInRange(selection);
  editor.executeEdits('ufm', [{ range: selection, text: before + text + after }]);
  const start = selection.getStartPosition();
  // Select the wrapped text (or put the cursor between the markers if there wasn't any)
  editor.setSelection(
    new monaco.Selection(start.lineNumber, start.column + before.length, start.lineNumber, start.column + before.length + text.length),
  );
  editor.focus();
}

customElements.define('ufm-template-editor', UfmTemplateEditorElement);

declare global {
  interface HTMLElementTagNameMap {
    'ufm-template-editor': UfmTemplateEditorElement;
  }
}
