/**
 * Umbraco's own rich text editor (`<umb-input-tiptap>`), for editing rich text placeholder values.
 *
 * Only the TipTap extensions that work without a backoffice are registered: no link, media or block
 * pickers, which need the Management API.
 */
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_MODAL_MANAGER_CONTEXT } from '@umbraco-cms/backoffice/modal';
import { UmbPropertyEditorConfigCollection } from '@umbraco-cms/backoffice/property-editor';
import '@umbraco-cms/backoffice/tiptap';
import { manifest as actionButtonKind } from '@umb-tiptap/extensions/tiptap-toolbar-action-button.kind.js';
import { manifest as buttonKind } from '@umb-tiptap/extensions/tiptap-toolbar-button.kind.js';
import { manifest as menuKind } from '@umb-tiptap/extensions/tiptap-toolbar-menu.kind.js';
import { manifest as styleMenuKind } from '@umb-tiptap/extensions/style-menu/style-menu.kind.js';
import { manifests as core } from '@umb-tiptap/extensions/core/manifests.js';
import { manifests as bold } from '@umb-tiptap/extensions/bold/manifests.js';
import { manifests as italic } from '@umb-tiptap/extensions/italic/manifests.js';
import { manifests as underline } from '@umb-tiptap/extensions/underline/manifests.js';
import { manifests as strike } from '@umb-tiptap/extensions/strike/manifests.js';
import { manifests as heading } from '@umb-tiptap/extensions/heading/manifests.js';
import { manifests as blockquote } from '@umb-tiptap/extensions/blockquote/manifests.js';
import { manifests as codeBlock } from '@umb-tiptap/extensions/code-block/manifests.js';
import { manifests as bulletList } from '@umb-tiptap/extensions/bullet-list/manifests.js';
import { manifests as orderedList } from '@umb-tiptap/extensions/ordered-list/manifests.js';
import { manifests as horizontalRule } from '@umb-tiptap/extensions/horizontal-rule/manifests.js';
import { manifests as clearFormatting } from '@umb-tiptap/extensions/clear-formatting/manifests.js';
import { manifests as undoRedo } from '@umb-tiptap/extensions/undo-redo/manifests.js';
import { manifests as styleSelect } from '@umb-tiptap/extensions/style-select/manifests.js';

let registered = false;

/**
 * Some backoffice inputs ask for confirmation in a modal (e.g. removing a repeatable textstring).
 * There's no modal manager outside the backoffice, so this one just says yes.
 */
function provideModalStandIn() {
  const modalManager = { open: () => ({ onSubmit: () => Promise.resolve({}), reject() {}, submit() {} }) };
  new UmbContextProvider(document.documentElement, UMB_MODAL_MANAGER_CONTEXT, modalManager as any).hostConnected();
}

/** Registers the rich text editor's extensions. Safe to call more than once. */
export function registerRichTextEditor() {
  if (registered) return;
  registered = true;
  provideModalStandIn();
  umbExtensionsRegistry.registerMany([
    actionButtonKind,
    buttonKind,
    menuKind,
    styleMenuKind,
    ...core,
    ...bold,
    ...italic,
    ...underline,
    ...strike,
    ...heading,
    ...blockquote,
    ...codeBlock,
    ...bulletList,
    ...orderedList,
    ...horizontalRule,
    ...clearFormatting,
    ...undoRedo,
    ...styleSelect,
  ] as Array<any>);
}

/** Configuration for `<umb-input-tiptap>`, like a Rich Text Editor data type's settings. */
export const richTextConfiguration = new UmbPropertyEditorConfigCollection([
  {
    alias: 'extensions',
    value: [
      'Umb.Tiptap.RichTextEssentials',
      'Umb.Tiptap.Bold',
      'Umb.Tiptap.Italic',
      'Umb.Tiptap.Underline',
      'Umb.Tiptap.Strike',
      'Umb.Tiptap.Heading',
      'Umb.Tiptap.Blockquote',
      'Umb.Tiptap.CodeBlock',
      'Umb.Tiptap.BulletList',
      'Umb.Tiptap.OrderedList',
      'Umb.Tiptap.HorizontalRule',
    ],
  },
  {
    alias: 'toolbar',
    value: [
      [
        ['Umb.Tiptap.Toolbar.StyleSelect'],
        ['Umb.Tiptap.Toolbar.Bold', 'Umb.Tiptap.Toolbar.Italic', 'Umb.Tiptap.Toolbar.Underline', 'Umb.Tiptap.Toolbar.Strike'],
        ['Umb.Tiptap.Toolbar.BulletList', 'Umb.Tiptap.Toolbar.OrderedList', 'Umb.Tiptap.Toolbar.HorizontalRule'],
        ['Umb.Tiptap.Toolbar.ClearFormatting', 'Umb.Tiptap.Toolbar.Undo', 'Umb.Tiptap.Toolbar.Redo'],
      ],
    ],
  },
  { alias: 'statusbar', value: [[], []] },
]);
