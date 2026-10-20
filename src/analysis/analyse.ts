/**
 * Works out what a UFM template uses (property aliases, settings, `$index`), how it uses them (so
 * we can guess sensible placeholder values) and anything that looks wrong.
 *
 * This mirrors the tokenizers in Umbraco's UFM Marked plugins rather than running Marked itself,
 * and parses expressions with the same expression engine the backoffice uses.
 */
import { EvalAstFactory, Parser } from '@umbraco-cms/backoffice/external/heximal-expressions';

export type ValueKind = 'text' | 'richText' | 'boolean' | 'number' | 'list' | 'tags' | 'names' | 'links' | 'blocks' | 'object';

export interface AliasUsage {
  alias: string;
  /** Kinds suggested by how the alias is used, most specific last. */
  hints: Set<ValueKind>;
  /** Property aliases used within nested blocks, e.g. `v.alias == "heading"`. */
  nestedAliases: Set<string>;
  /** Properties accessed on the value, e.g. `colour.label`. */
  members: Set<string>;
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** The bit of the template the diagnostic is about. */
  source?: string;
  /** Where that is in the template (character offsets). */
  from?: number;
  to?: number;
}

export interface Analysis {
  properties: Map<string, AliasUsage>;
  settings: Map<string, AliasUsage>;
  usesIndex: boolean;
  localizationKeys: Set<string>;
  diagnostics: Array<Diagnostic>;
}

export interface AnalysisOptions {
  /** Aliases of the registered UFM filters. */
  filters: Array<string>;
  /** Registered UFM components: alias prefix and optional marker. */
  components: Array<{ alias: string; marker?: string }>;
}

const DEPRECATED_FILTERS: Record<string, string> = {
  'strip-html': 'stripHtml',
  'title-case': 'titleCase',
  'word-limit': 'wordLimit',
};

const GLOBALS = new Set(['Math', 'Date', 'JSON', 'window', 'document', 'console', 'Number', 'String', 'Array', 'Object']);
const ARRAY_METHODS = new Set(['join', 'map', 'filter', 'find', 'slice', 'some', 'every', 'includes', 'indexOf', 'reduce', 'reverse', 'sort', 'at']);
const STRING_METHODS = new Set(['toUpperCase', 'toLowerCase', 'trim', 'split', 'replace', 'replaceAll', 'startsWith', 'endsWith', 'substring', 'padStart', 'padEnd', 'charAt']);

const astFactory = new EvalAstFactory();

/** An HTML open or close tag, roughly as Marked's inline HTML tokenizer sees them. */
const HTML_TAG = /<\/?[a-zA-Z][\w:-]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;

export function analyse(template: string, options: AnalysisOptions): Analysis {
  const analysis: Analysis = {
    properties: new Map(),
    settings: new Map(),
    usesIndex: false,
    localizationKeys: new Set(),
    diagnostics: [],
  };

  // Code spans and escaped syntax are rendered literally, so ignore them
  let source = template.replace(/(`+)[\s\S]*?\1/g, (m) => ' '.repeat(m.length)).replace(/\\[{$]/g, '  ');

  // Marked passes HTML tags through as-is, before UFM sees them, so UFM inside a tag (e.g. in an
  // attribute) isn't processed: it's output literally
  source = source.replace(HTML_TAG, (tag, offset: number) => {
    for (const ufm of tag.matchAll(/\$\{(?:[^{}]|\{[^{}]*\})*\}|\{\s*(?:[=#]|[a-zA-Z][\w-]*\s*:)[^}]*\}/g)) {
      analysis.diagnostics.push({
        severity: 'warning',
        message: `UFM isn't processed inside HTML tags, so "${ufm[0]}" will be output as-is, not replaced with a value. (Templates can't set attributes from values.)`,
        source: ufm[0],
        from: offset + ufm.index!,
        to: offset + ufm.index! + ufm[0].length,
      });
    }
    return ' '.repeat(tag.length);
  });

  // Label templates from Umbraco 13 and earlier used AngularJS, which UFM doesn't understand
  for (const match of source.matchAll(/\{\{[\s\S]*?\}\}/g)) {
    analysis.diagnostics.push({
      severity: 'warning',
      message:
        'This looks like an AngularJS label template, from Umbraco 13 or earlier, so it will be shown as plain text. ' +
        'Use a UFM expression instead, e.g. ${ heading } rather than {{ heading }}. ' +
        'Filters have changed too: ncNodeName is now the {umbContentName: alias} component, ncRichText is stripHtml, and umbWordLimit is wordLimit.',
      source: match[0],
      from: match.index,
      to: match.index! + match[0].length,
    });
  }

  for (const match of source.matchAll(/(?<!\\)\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    withRange(analysis, match, () => analyseExpression(match[1], match[0], analysis, options));
  }

  const withoutExpressions = source.replace(/(?<!\\)\$\{((?:[^{}]|\{[^{}]*\})*)\}/g, (m) => ' '.repeat(m.length));
  for (const match of withoutExpressions.matchAll(/\{\s*([^\s:}]*?)\s*:([^}]*)\}|\{\s*([=#])([^}]*)\}/g)) {
    const prefix = match[1] ?? match[3];
    const content = match[2] ?? match[4];
    withRange(analysis, match, () => analyseComponent(prefix, content, match[0], analysis, options));
  }

  return analysis;
}

/** Gives any diagnostics added while analysing a token that token's position. */
function withRange(analysis: Analysis, match: RegExpMatchArray, analyseToken: () => void) {
  const before = analysis.diagnostics.length;
  analyseToken();
  for (const diagnostic of analysis.diagnostics.slice(before)) {
    diagnostic.from ??= match.index!;
    diagnostic.to ??= match.index! + match[0].length;
  }
}

function usage(map: Map<string, AliasUsage>, alias: string): AliasUsage {
  let entry = map.get(alias);
  if (!entry) {
    entry = { alias, hints: new Set(), nestedAliases: new Set(), members: new Set() };
    map.set(alias, entry);
  }
  return entry;
}

function analyseComponent(prefix: string, content: string, source: string, analysis: Analysis, options: AnalysisOptions) {
  const component = options.components.find((c) => c.alias === prefix || (c.marker && c.marker === prefix));
  if (!component) {
    // Not something UFM recognises, so it'll be rendered as-is. Only flag things that look intentional.
    if (/^[a-zA-Z][\w-]*$/.test(prefix)) {
      analysis.diagnostics.push({
        severity: 'warning',
        message: `There's no UFM component with the alias "${prefix}", so this will be shown as plain text.`,
        source,
      });
    }
    return;
  }

  const [alias, ...filters] = content.split('|').map((x) => x.trim());
  if (!alias) {
    analysis.diagnostics.push({ severity: 'warning', message: 'This component has no property alias, so renders nothing.', source });
    return;
  }

  if (component.alias === 'umbLocalize') {
    analysis.localizationKeys.add(alias);
    return;
  }

  const entry = usage(analysis.properties, alias);
  if (component.alias === 'umbContentName' || component.alias === 'umbMemberName') entry.hints.add('names');
  if (component.alias === 'umbLink') entry.hints.add('links');

  for (const filter of filters) {
    const [name] = filter.split(':').map((x) => x.trim());
    checkFilter(name, source, analysis, options);
    if (name === 'stripHtml' || name === 'strip-html') entry.hints.add('richText');
    if (name === 'bytes') entry.hints.add('number');
  }

  if (/truncate\s*:\s*\d+\s*:\s+\S/.test(content)) {
    analysis.diagnostics.push({
      severity: 'info',
      message:
        'Component filter arguments are trimmed, so a truncate tail can\'t start with a space. Use an expression if you need one: ${ truncate(value, 35, " (more)") }',
      source,
    });
  }
}

function checkFilter(name: string, source: string, analysis: Analysis, options: AnalysisOptions) {
  if (DEPRECATED_FILTERS[name]) {
    analysis.diagnostics.push({
      severity: 'warning',
      message: `The "${name}" filter alias is removed in Umbraco 18. Use "${DEPRECATED_FILTERS[name]}" instead.`,
      source,
    });
  } else if (!options.filters.includes(name)) {
    analysis.diagnostics.push({
      severity: 'error',
      message: `There's no UFM filter called "${name}". Available filters: ${availableFilters(options)}.`,
      source,
    });
  }
}

type Node = { type: string; [key: string]: any };

function analyseExpression(expression: string, source: string, analysis: Analysis, options: AnalysisOptions) {
  let ast: Node | undefined;
  try {
    ast = new Parser(expression, astFactory).parse() as Node | undefined;
  } catch (error) {
    const message = (error as Error).message;
    analysis.diagnostics.push({
      severity: 'error',
      message: /was 11 \(=>\)/.test(message)
        ? 'Arrow functions need brackets around their parameters in UFM, e.g. (x) => x.name rather than x => x.name. As it is, this expression renders nothing.'
        : `This expression can't be parsed, so renders nothing (${message}).`,
      source,
    });
    return;
  }

  if (/\|\s*[\w-]+\s*:/.test(expression)) {
    analysis.diagnostics.push({
      severity: 'warning',
      message:
        'Filter arguments with ":" are silently ignored in expressions. Call the filter like a function instead, e.g. ${ truncate(stripHtml(bodyText), 35) }.',
      source,
    });
  }

  if (ast) walk(ast, new Set(), { analysis, options, source });
}

interface WalkContext {
  analysis: Analysis;
  options: AnalysisOptions;
  source: string;
}

/**
 * Walks an expression AST, recording property usage.
 * @param scope Names bound by enclosing arrow functions.
 * @returns The alias usage the node resolves to, if it's a reference to a property (or a member of one).
 */
function walk(node: Node | undefined, scope: Set<string>, ctx: WalkContext, parentHint?: ValueKind): AliasUsage | undefined {
  if (!node) return;
  const { analysis, options } = ctx;

  switch (node.type) {
    case 'ID': {
      const name = node.value as string;
      if (scope.has(name) || name === 'this' || name === 'undefined' || name === 'null') return;
      if (name === '$index') {
        analysis.usesIndex = true;
        return;
      }
      if (name === '$settings') return;
      if (options.filters.includes(name)) return;
      if (GLOBALS.has(name)) {
        analysis.diagnostics.push({ severity: 'error', message: `"${name}" isn't available in UFM expressions, they're sandboxed.`, source: ctx.source });
        return;
      }
      const entry = usage(analysis.properties, name);
      if (parentHint) entry.hints.add(parentHint);
      return entry;
    }

    case 'Getter': {
      // $settings.alias
      if (node.receiver?.type === 'ID' && node.receiver.value === '$settings') {
        const entry = usage(analysis.settings, node.name);
        if (parentHint) entry.hints.add(parentHint);
        return entry;
      }
      const receiver = walk(node.receiver, scope, ctx);
      if (!receiver) return;
      if (node.name === 'markup') {
        receiver.hints.add('richText');
      } else if (node.name === 'contentData') {
        receiver.hints.add('blocks');
        return receiver;
      } else if (node.name === 'values' && receiver.hints.has('blocks')) {
        return receiver;
      } else if (node.name === 'length') {
        if (!receiver.hints.has('blocks')) receiver.hints.add('list');
      } else if ((node.name === 'name' || node.name === 'url') && receiver.hints.has('list')) {
        receiver.hints.add('links');
      } else {
        receiver.members.add(node.name);
      }
      return;
    }

    case 'Index': {
      const receiver = walk(node.receiver, scope, ctx);
      if (receiver && !receiver.hints.has('blocks')) receiver.hints.add('list');
      walk(node.argument, scope, ctx);
      return receiver;
    }

    case 'Invoke': {
      const args: Array<Node> = node.arguments ?? [];

      if (!node.method) {
        // A top-level function call, e.g. truncate(stripHtml(bodyText), 35)
        const name = node.receiver?.type === 'ID' ? (node.receiver.value as string) : undefined;
        if (name && !scope.has(name) && !options.filters.includes(name)) {
          analysis.diagnostics.push({
            severity: GLOBALS.has(name) ? 'error' : 'warning',
            message: `"${name}" isn't a UFM filter, so can't be called here. Available filters: ${availableFilters(options)}.`,
            source: ctx.source,
          });
        } else if (!name) {
          walk(node.receiver, scope, ctx);
        }
        args.forEach((arg, i) => walk(arg, scope, ctx, i === 0 && name === 'stripHtml' ? 'richText' : i === 0 && name === 'bytes' ? 'number' : undefined));
        return;
      }

      const receiver = walk(node.receiver, scope, ctx);
      if (receiver) {
        if (ARRAY_METHODS.has(node.method) && !receiver.hints.has('links')) receiver.hints.add('list');
        else if (STRING_METHODS.has(node.method)) receiver.hints.add('text');
      }
      for (const arg of args) {
        if (arg?.type === 'ArrowFunction') walkArrow(arg, scope, ctx, receiver);
        else walk(arg, scope, ctx);
      }
      return;
    }

    case 'Binary': {
      if (node.operator === '|' || node.operator === '|>') {
        const filterName = node.right?.type === 'ID' ? (node.right.value as string) : undefined;
        if (filterName) checkFilter(filterName, ctx.source, analysis, options);
        walk(node.left, scope, ctx, filterName === 'stripHtml' ? 'richText' : filterName === 'bytes' ? 'number' : parentHint);
        return;
      }
      // v.alias == "heading" inside a nested block lookup
      if ((node.operator === '==' || node.operator === '===') && isAliasGetter(node.left) && node.right?.type === 'Literal') {
        currentNestedTarget?.nestedAliases.add(String(node.right.value));
      }
      const arithmetic = ['-', '*', '/', '%', '<', '>', '<=', '>='].includes(node.operator);
      walk(node.left, scope, ctx, arithmetic ? 'number' : node.operator === '||' || node.operator === '??' ? parentHint : undefined);
      walk(node.right, scope, ctx, arithmetic ? 'number' : node.operator === '||' || node.operator === '??' ? parentHint : undefined);
      return;
    }

    case 'Unary':
      walk(node.child, scope, ctx, node.operator === '!' ? 'boolean' : 'number');
      return;

    case 'Ternary':
      walk(node.condition, scope, ctx, 'boolean');
      walk(node.trueExpr, scope, ctx, parentHint);
      walk(node.falseExpr, scope, ctx, parentHint);
      return;

    case 'List':
      (node.items ?? []).forEach((item: Node) => walk(item, scope, ctx));
      return;

    case 'Map':
      Object.values(node.entries ?? {}).forEach((item) => walk(item as Node, scope, ctx));
      return;

    case 'ArrowFunction':
      walkArrow(node, scope, ctx);
      return;

    default:
      return;
  }
}

/** The property whose nested blocks are currently being looked through (for `v.alias == "x"`). */
let currentNestedTarget: AliasUsage | undefined;

function walkArrow(node: Node, scope: Set<string>, ctx: WalkContext, receiver?: AliasUsage) {
  const inner = new Set([...scope, ...(node.params as Array<string>)]);
  const previous = currentNestedTarget;
  if (receiver?.hints.has('blocks')) currentNestedTarget = receiver;
  walk(node.body, inner, ctx);
  currentNestedTarget = previous;
}

function isAliasGetter(node: Node | undefined) {
  return node?.type === 'Getter' && node.name === 'alias';
}

function availableFilters(options: AnalysisOptions) {
  return options.filters.filter((f) => !DEPRECATED_FILTERS[f]).join(', ');
}
