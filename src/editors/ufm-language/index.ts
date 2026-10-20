/**
 * A `ufm` language for Monaco: highlighting, completions and hovers for Umbraco Flavored Markdown
 * (Markdown + HTML + UFM components and expressions).
 *
 * It's registered on the backoffice's own Monaco instance, so works with `<umb-code-editor language="ufm">`.
 * It has no dependencies on the rest of the playground: what it knows about the template being edited
 * (aliases, translations, icons…) is provided with {@link setUfmLanguageData}.
 */
import { monaco } from '@umbraco-cms/backoffice/external/monaco-editor';
import type * as Monaco from 'monaco-editor';
import {
  ARRAY_MEMBERS,
  BLOCK_MEMBERS,
  COMPONENTS,
  FILTERS,
  LINK_MEMBERS,
  MARKDOWN_SNIPPETS,
  SPECIAL_VARIABLES,
  STRING_MEMBERS,
  TAGS,
  type Member,
} from './reference.js';
import { getUfmLanguageData, type UfmLanguageData } from './data.js';

export const UFM_LANGUAGE_ID = 'ufm';

export { setUfmLanguageData, type UfmLanguageData } from './data.js';

const tokenizer: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.ufm',
  tokenizer: {
    root: [
      // Escaped characters are rendered literally
      [/\\[\\{}$*_`[\]<>#]/, 'string.escape'],
      // ${ expression }, handed over to the JavaScript tokenizer
      [/\$\{/, { token: 'delimiter.bracket.ufm-expression', next: '@expression', nextEmbedded: 'javascript' }],
      // {=alias}, {#key}
      [/(\{)(\s*)([=#])/, ['delimiter.bracket.ufm-component', '', { token: 'keyword.ufm-component', next: '@component' }]],
      // {umbValue: alias}
      [/(\{)(\s*)([a-zA-Z][\w-]*)(\s*)(:)/, ['delimiter.bracket.ufm-component', '', 'keyword.ufm-component', '', { token: 'delimiter.ufm-component', next: '@component' }]],
      // Markdown
      [/`[^`]*`/, 'string.code'],
      [/\*\*|__/, 'strong'],
      [/(^|(?<=\s))[*_](?=\S)|(?<=\S)[*_](?=\s|$|[.,;:!?)])/, 'emphasis'],
      [/(\[)([^\]]*)(\])(\()([^)]*)(\))/, ['delimiter.bracket', 'string.link', 'delimiter.bracket', 'delimiter.parenthesis', 'string.link', 'delimiter.parenthesis']],
      [/^#{1,6}\s.*$/, 'keyword.heading'],
      // HTML
      [/<\/?[a-zA-Z][\w-]*/, { token: 'tag', next: '@tag' }],
      [/&[a-zA-Z0-9#]+;/, 'string.escape'],
      [/[^\\$\{`*_[<&#]+/, ''],
      [/./, ''],
    ],
    expression: [[/\}/, { token: 'delimiter.bracket.ufm-expression', next: '@pop', nextEmbedded: '@pop' }]],
    component: [
      [/\}/, { token: 'delimiter.bracket.ufm-component', next: '@pop' }],
      [/\|/, { token: 'operator.ufm-filter', next: '@filter' }],
      [/[^\s|}]+/, 'variable.ufm-alias'],
      [/\s+/, ''],
    ],
    filter: [
      [/\}/, { token: 'delimiter.bracket.ufm-component', next: '@popall' }],
      [/\|/, 'operator.ufm-filter'],
      [/:/, { token: 'delimiter.ufm-filter', next: '@filterArgument' }],
      [/[\w-]+/, 'type.ufm-filter'],
      [/\s+/, ''],
    ],
    filterArgument: [
      [/\}/, { token: 'delimiter.bracket.ufm-component', next: '@popall' }],
      [/\|/, { token: 'operator.ufm-filter', next: '@pop' }],
      [/:/, 'delimiter.ufm-filter'],
      [/[^:|}]+/, 'number.ufm-filter'],
    ],
    tag: [
      [/\/?>/, { token: 'tag', next: '@pop' }],
      [/[\w-]+/, 'attribute.name'],
      [/=/, 'delimiter'],
      [/"[^"]*"|'[^']*'/, 'attribute.value'],
      [/\s+/, ''],
    ],
  },
};

let registered = false;

/** Registers the `ufm` language with Monaco. Safe to call more than once. */
export function registerUfmLanguage() {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: UFM_LANGUAGE_ID, aliases: ['Umbraco Flavored Markdown', 'UFM'] });
  monaco.languages.setMonarchTokensProvider(UFM_LANGUAGE_ID, tokenizer);
  monaco.languages.setLanguageConfiguration(UFM_LANGUAGE_ID, {
    wordPattern: /[\w$][\w$-]*/g,
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '*', close: '*' },
      { open: '_', close: '_' },
      { open: '`', close: '`' },
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.registerCompletionItemProvider(UFM_LANGUAGE_ID, {
    triggerCharacters: ['{', '$', ':', '=', '#', '|', '.', '<', '/', '"', ' ', '('],
    provideCompletionItems,
  });
  monaco.languages.registerHoverProvider(UFM_LANGUAGE_ID, { provideHover });
}

/** Shows diagnostics in the editor. Offsets are character positions in the model's text. */
export function setUfmMarkers(
  model: Monaco.editor.ITextModel,
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string; from?: number; to?: number }>,
) {
  const severities = { error: monaco.MarkerSeverity.Error, warning: monaco.MarkerSeverity.Warning, info: monaco.MarkerSeverity.Info };
  monaco.editor.setModelMarkers(
    model,
    UFM_LANGUAGE_ID,
    diagnostics
      .filter((d) => d.from !== undefined)
      .map((d) => {
        const start = model.getPositionAt(d.from!);
        const end = model.getPositionAt(d.to ?? d.from!);
        return {
          severity: severities[d.severity],
          message: d.message,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        };
      }),
  );
}

// ---- Completions ------------------------------------------------------------------------------

type Context =
  | { type: 'expression'; text: string }
  | { type: 'component'; text: string }
  | { type: 'tag'; text: string; before: string }
  | { type: 'markdown' };

/** Works out what the cursor is in, from the text before it. */
function contextAt(before: string): Context {
  const expressionStart = unclosedFrom(before, before.lastIndexOf('${'));
  if (expressionStart !== undefined) return { type: 'expression', text: before.slice(expressionStart + 2) };

  const braceStart = unclosedFrom(before, before.lastIndexOf('{'));
  if (braceStart !== undefined && before[braceStart - 1] !== '\\') return { type: 'component', text: before.slice(braceStart + 1) };

  const tagStart = before.lastIndexOf('<');
  if (tagStart >= 0 && !before.slice(tagStart).includes('>') && /^<\/?[a-zA-Z]?[\w-]*/.test(before.slice(tagStart))) {
    return { type: 'tag', text: before.slice(tagStart), before: before.slice(0, tagStart) };
  }
  return { type: 'markdown' };
}

/** The index of a `{`/`${` if it hasn't been closed by the end of the text. */
function unclosedFrom(text: string, start: number) {
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return undefined;
  }
  return start;
}

function provideCompletionItems(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  context: Monaco.languages.CompletionContext,
): Monaco.languages.CompletionList {
  const data = getUfmLanguageData();
  const before = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, position.column));
  const word = model.getWordUntilPosition(position);
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  const ctx = contextAt(before);
  const kinds = monaco.languages.CompletionItemKind;
  const snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  const items: Array<Omit<Monaco.languages.CompletionItem, 'range'> & { range?: Monaco.IRange }> = [];
  const alias = (p: UfmLanguageData['properties'][number], prefix = '') =>
    items.push({ label: prefix + p.alias, insertText: p.alias, kind: kinds.Variable, detail: p.detail ?? 'Property', sortText: `0${p.alias}` });

  if (ctx.type === 'expression') {
    const text = ctx.text;
    if (/\$settings\.[\w$]*$/.test(text)) {
      data.settings.forEach((p) => alias(p));
    } else if (/\|\s*[\w$]*$/.test(text)) {
      data.filters.forEach((name) => items.push({ label: name, insertText: name, kind: kinds.Function, documentation: filterDocs(name) }));
    } else if (/\.[\w$]*$/.test(text)) {
      const base = /([\w$]+)((?:\[[^\]]*\]|\.[\w$]+)*)\.[\w$]*$/.exec(text);
      memberCompletions(base?.[1], base?.[2] ?? '').forEach((member) =>
        items.push({ label: member.label, insertText: member.snippet, insertTextRules: snippet, kind: member.label.includes('(') ? kinds.Method : kinds.Property }),
      );
    } else {
      data.properties.forEach((p) => alias(p));
      Object.entries(SPECIAL_VARIABLES).forEach(([name, description]) =>
        items.push({ label: name, insertText: name === '$settings' ? '\\$settings.' : '\\$index', insertTextRules: snippet, kind: kinds.Keyword, documentation: description, sortText: `1${name}`, command: name === '$settings' ? { id: 'editor.action.triggerSuggest', title: '' } : undefined }),
      );
      data.filters.forEach((name) => {
        const args = FILTERS[name]?.args.filter((a) => !a.optional) ?? [];
        const call = `${name}(\${1:value}${args.map((a, i) => `, \${${i + 2}:${a.example}}`).join('')})`;
        items.push({ label: `${name}(…)`, insertText: call, insertTextRules: snippet, kind: kinds.Function, documentation: filterDocs(name), sortText: `2${name}` });
      });
      ['true', 'false', 'null'].forEach((k) => items.push({ label: k, insertText: k, kind: kinds.Keyword, sortText: `3${k}` }));
    }
  } else if (ctx.type === 'component') {
    const text = ctx.text;
    if (/^\s*[\w-]*$/.test(text)) {
      for (const { alias: name, marker } of data.components) {
        const info = COMPONENTS[name];
        const what = info?.content === 'key' ? 'key' : 'alias';
        items.push({ label: name, insertText: `${name}: \${1:${what}}`, insertTextRules: snippet, kind: kinds.Module, documentation: info?.description, sortText: `0${name}` });
        if (marker) items.push({ label: marker, insertText: `${marker}\${1:${what}}`, insertTextRules: snippet, kind: kinds.Module, detail: `Shorthand for ${name}`, documentation: info?.description, sortText: `1${marker}` });
      }
    } else if (/^\s*(?:umbLocalize\s*:|#)\s*[\w]*$/.test(text)) {
      for (const [key, value] of data.terms()) items.push({ label: key, insertText: key, kind: kinds.Text, detail: value });
    } else if (/\|\s*[\w-]*$/.test(text)) {
      data.filters.forEach((name) => {
        const args = FILTERS[name]?.args.filter((a) => !a.optional) ?? [];
        items.push({
          label: name,
          insertText: name + args.map((a, i) => `:\${${i + 1}:${a.example}}`).join(''),
          insertTextRules: snippet,
          kind: kinds.Function,
          documentation: filterDocs(name),
        });
      });
    } else if (/^\s*(?:[\w-]+\s*:|=)\s*[\w$]*$/.test(text)) {
      data.properties.forEach((p) => alias(p));
    }
  } else if (ctx.type === 'tag') {
    const text = ctx.text;
    const tagRange = new monaco.Range(position.lineNumber, position.column - text.length, position.lineNumber, position.column);
    let match: RegExpExecArray | null;
    if ((match = /^<umb-icon\b[^>]*\bname="([\w-]*)$/.exec(text))) {
      data.icons().forEach((icon) => items.push({ label: icon, insertText: icon, kind: kinds.Value }));
    } else if ((match = /^<([\w-]+)\b[^>]*\s([\w-]+)="([\w-]*)$/.exec(text))) {
      (TAGS[match[1]]?.attributes?.[match[2]] ?? []).forEach((value) => items.push({ label: value, insertText: value, kind: kinds.Value }));
    } else if ((match = /^<([\w-]+)\b[^>]*\s([\w-]*)$/.exec(text))) {
      Object.keys(TAGS[match[1]]?.attributes ?? {}).forEach((attribute) =>
        items.push({ label: attribute, insertText: `${attribute}="$1"`, insertTextRules: snippet, kind: kinds.Property }),
      );
    } else if (/^<\/[\w-]*$/.test(text)) {
      const open = openTags(ctx.before);
      const last = open[open.length - 1];
      if (last) items.push({ label: `</${last}>`, insertText: `</${last}>`, kind: kinds.Snippet, range: tagRange });
    } else if (/^<[\w-]*$/.test(text)) {
      Object.entries(TAGS).forEach(([tag, info]) =>
        items.push({ label: tag, insertText: info.snippet, insertTextRules: snippet, kind: kinds.Snippet, documentation: info.description, range: tagRange }),
      );
    }
  } else if (context.triggerKind === monaco.languages.CompletionTriggerKind.Invoke) {
    // Only when asked for (Ctrl+Space), so it doesn't get in the way of writing text
    MARKDOWN_SNIPPETS.forEach((s) => items.push({ label: s.label, insertText: s.snippet, insertTextRules: snippet, kind: kinds.Snippet, documentation: s.description }));
  }

  return { suggestions: items.map((item) => ({ range, ...item }) as Monaco.languages.CompletionItem) };
}

/** What to suggest after `base` + `chain` + `.`, e.g. `tags.` or `link[0].` */
function memberCompletions(base: string | undefined, chain: string): Array<Member> {
  const data = getUfmLanguageData();
  const property = data.properties.find((p) => p.alias === base);
  if (property && !chain) {
    switch (property.kind) {
      case 'richText':
        return [{ label: 'markup', snippet: 'markup' }];
      case 'blocks':
        return BLOCK_MEMBERS;
      case 'links':
        return LINK_MEMBERS;
      case 'list':
      case 'tags':
      case 'names':
        return ARRAY_MEMBERS;
      case 'object':
        return (property.members ?? []).map((m) => ({ label: m, snippet: m }));
      default:
        return STRING_MEMBERS;
    }
  }
  if (property?.kind === 'links' && /^\[\d+\]$/.test(chain)) return [{ label: 'name', snippet: 'name' }, { label: 'url', snippet: 'url' }];
  // Don't know: offer everything that's commonly useful
  const all = new Map([...STRING_MEMBERS, ...ARRAY_MEMBERS].map((m) => [m.label, m]));
  return [...all.values()];
}

function openTags(text: string) {
  const stack: Array<string> = [];
  for (const [, closing, name, selfClosing] of text.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    if (name === 'br' || selfClosing) continue;
    if (closing) {
      const index = stack.lastIndexOf(name);
      if (index >= 0) stack.splice(index);
    } else {
      stack.push(name);
    }
  }
  return stack;
}

function filterDocs(name: string): Monaco.IMarkdownString | undefined {
  const info = FILTERS[name];
  if (!info) return { value: 'A custom filter.' };
  const args = info.args.map((a) => (a.optional ? `[:${a.name}]` : `:${a.name}`)).join('');
  const call = info.args.map((a) => `, ${a.name}${a.optional ? '?' : ''}`).join('');
  return { value: `${info.description}\n\n\`{=alias | ${name}${args}}\` or \`\${ ${name}(value${call}) }\`` };
}

// ---- Hovers -----------------------------------------------------------------------------------

function provideHover(model: Monaco.editor.ITextModel, position: Monaco.Position): Monaco.languages.Hover | null {
  const data = getUfmLanguageData();
  const word = model.getWordAtPosition(position);
  if (!word) return null;
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  const name = word.word;
  const before = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, word.startColumn));
  const ctx = contextAt(before);
  if (ctx.type === 'markdown' || ctx.type === 'tag') {
    if (ctx.type === 'tag' && TAGS[name]) return { range, contents: [{ value: `**<${name}>**` }, { value: TAGS[name].description }] };
    return null;
  }

  if (COMPONENTS[name] && ctx.type === 'component' && /^\s*[\w-]*$/.test(ctx.text)) {
    return { range, contents: [{ value: `**${name}** (component)` }, { value: COMPONENTS[name].description }] };
  }
  if (data.filters.includes(name)) {
    return { range, contents: [{ value: `**${name}** (filter)` }, filterDocs(name)!] };
  }
  if (SPECIAL_VARIABLES[name]) return { range, contents: [{ value: `**${name}**` }, { value: SPECIAL_VARIABLES[name] }] };
  const settingsMatch = /\$settings\.$/.test(ctx.text);
  const property = (settingsMatch ? data.settings : data.properties).find((p) => p.alias === name);
  if (property) return { range, contents: [{ value: `**${settingsMatch ? '$settings.' : ''}${name}** (${settingsMatch ? 'setting' : 'property'})` }, { value: property.detail ?? '' }] };
  return null;
}
