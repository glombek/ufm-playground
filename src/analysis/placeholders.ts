/**
 * Placeholder values: guessing a kind of value for each alias, a sample value for it, and turning
 * what's edited into the value Umbraco would actually give a label.
 */
import type { AliasUsage, ValueKind } from './analyse.js';

export interface Link {
  name: string;
  url: string;
}

/** The value each kind's editor works with. */
export interface PlaceholderValues {
  text: string;
  /** HTML. */
  richText: string;
  boolean: boolean;
  number: number | null;
  list: Array<string>;
  tags: Array<string>;
  names: Array<string>;
  links: Array<Link>;
  /** One object of property values per block. */
  blocks: Array<Record<string, unknown>>;
  /** JSON text, which may not (yet) be valid. */
  object: string;
}

export type Placeholder<K extends ValueKind = ValueKind> = {
  [P in K]: {
    kind: P;
    value: PlaceholderValues[P];
    /** As if the property had never been given a value. */
    unset?: boolean;
  };
}[K];

export const KINDS: Record<ValueKind, { label: string; description: string; icon: string }> = {
  text: { label: 'Text', description: 'A textstring or textarea.', icon: 'icon-autofill' },
  richText: { label: 'Rich text', description: 'The rich text editor.', icon: 'icon-browser-window' },
  boolean: { label: 'Toggle', description: 'A true/false toggle.', icon: 'icon-checkbox' },
  number: { label: 'Number', description: 'A numeric or slider.', icon: 'icon-autofill' },
  list: { label: 'List', description: 'Repeatable textstrings, a checkbox list or a dropdown.', icon: 'icon-ordered-list' },
  tags: { label: 'Tags', description: 'Tags.', icon: 'icon-tags' },
  names: { label: 'Picked items', description: 'A content, media or member picker. Names are shown as entered, not looked up.', icon: 'icon-document' },
  links: { label: 'Links', description: 'A multi URL picker.', icon: 'icon-link' },
  blocks: { label: 'Nested blocks', description: 'A block list.', icon: 'icon-thumbnail-list' },
  object: { label: 'JSON', description: 'Anything else, e.g. a colour picker\'s { "label", "value" }.', icon: 'icon-brackets' },
};

const PRIORITY: Array<ValueKind> = ['links', 'names', 'blocks', 'richText', 'list', 'object', 'number', 'boolean', 'text'];

export function inferKind(usage: AliasUsage): ValueKind {
  if (usage.members.size > 0 && !usage.hints.has('links') && !usage.hints.has('blocks')) return 'object';
  const kind = PRIORITY.find((kind) => usage.hints.has(kind)) ?? 'text';
  // Lists can't tell what made them, but the alias might
  return kind === 'list' && /tags?$/i.test(usage.alias) ? 'tags' : kind;
}

/**
 * The kind of a real value (e.g. from Umbraco, via the bookmarklet), where its shape makes that
 * clear, otherwise the kind guessed from the template.
 */
export function kindFromValue(value: unknown, inferred: ValueKind): ValueKind {
  if (value === null || value === undefined) return inferred;
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return ['text', 'richText', 'names'].includes(inferred) ? inferred : 'text';
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) return ['list', 'tags', 'names'].includes(inferred) ? inferred : 'list';
    if (value.every((v) => v && typeof v === 'object' && ('url' in v || 'name' in v))) return 'links';
    return inferred === 'blocks' ? 'blocks' : 'object';
  }
  if (typeof value === 'object') {
    if ('markup' in value) return 'richText';
    if ('contentData' in value) return 'blocks';
    return 'object';
  }
  return inferred;
}

export function humanise(alias: string) {
  const words = alias
    .replace(/^\$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Aliases to give nested blocks, from how the template uses them. */
export function nestedAliasesOf(usage: AliasUsage) {
  return usage.nestedAliases.size ? [...usage.nestedAliases] : ['title'];
}

export function samplePlaceholder(usage: AliasUsage, kind: ValueKind = inferKind(usage)): Placeholder {
  const label = humanise(usage.alias);
  switch (kind) {
    case 'text':
      return { kind, value: usage.alias === 'value' ? 'Sample value' : label };
    case 'richText':
      return {
        kind,
        value: `<p>This is some <strong>rich text</strong> for the ${label.toLowerCase()}. It goes on a bit, so it's a good candidate for truncating.</p>`,
      };
    case 'boolean':
      return { kind, value: true };
    case 'number':
      return { kind, value: 42 };
    case 'list':
    case 'tags':
      return { kind, value: ['Thing 1', 'Thing 2', 'Cat (in hat)'] };
    case 'names':
      return { kind, value: ['Contact us'] };
    case 'links':
      return { kind, value: [{ name: 'Make an enquiry', url: 'https://example.com/contact' }] };
    case 'blocks': {
      const aliases = nestedAliasesOf(usage);
      return { kind, value: ['First', 'Second', 'Third'].map((n) => Object.fromEntries(aliases.map((a) => [a, `${n} ${humanise(a).toLowerCase()}`]))) };
    }
    case 'object': {
      const members = usage.members.size ? [...usage.members] : ['label', 'value'];
      return { kind, value: JSON.stringify(Object.fromEntries(members.map((m) => [m, humanise(m)])), null, 2) };
    }
  }
}

/** Turns a placeholder into the value Umbraco gives the label. Throws if it isn't valid (i.e. bad JSON). */
export function toRuntimeValue(placeholder: Placeholder): unknown {
  if (placeholder.unset) return null;
  switch (placeholder.kind) {
    // These match the shapes the backoffice gives labels (checked against Umbraco 17)
    case 'richText':
      return { markup: placeholder.value, blocks: { layout: {}, contentData: [], settingsData: [], expose: [] } };
    case 'number':
      return placeholder.value ?? undefined;
    case 'list':
    case 'tags':
    case 'names':
      return placeholder.value.filter((x) => x !== '');
    case 'links':
      return placeholder.value.map(({ name, url }) => ({
        icon: 'icon-link',
        name,
        published: true,
        queryString: null,
        target: null,
        trashed: false,
        type: 'external',
        unique: null,
        url,
        culture: null,
      }));
    case 'blocks': {
      const key = (i: number) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
      return {
        layout: { 'Umbraco.BlockList': placeholder.value.map((_, i) => ({ contentKey: key(i), settingsKey: null })) },
        contentData: placeholder.value.map((item, i) => ({
          key: key(i),
          contentTypeKey: '00000000-0000-0000-0000-000000000000',
          values: Object.entries(item).map(([alias, value]) => ({ alias, value, culture: null, segment: null })),
        })),
        settingsData: [],
        expose: placeholder.value.map((_, i) => ({ contentKey: key(i), culture: null, segment: null })),
      };
    }
    case 'object':
      return JSON.parse(placeholder.value);
    default:
      return placeholder.value;
  }
}

/** Turns a value (e.g. from an embed's `values` attribute) into a placeholder of the given kind. */
export function fromRuntimeValue(value: unknown, kind: ValueKind): Placeholder {
  if (value === null) return { ...emptyPlaceholder(kind), unset: true };
  const asArray = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === '' ? [] : [v]);
  const nameOf = (x: unknown) => (x && typeof x === 'object' ? String((x as { name?: unknown }).name ?? JSON.stringify(x)) : String(x));
  switch (kind) {
    case 'text':
      return { kind, value: value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') };
    case 'richText':
      return { kind, value: value && typeof value === 'object' && 'markup' in value ? String((value as { markup: unknown }).markup ?? '') : String(value ?? '') };
    case 'boolean':
      return { kind, value: typeof value === 'string' ? /^\s*(true|1|yes)\s*$/i.test(value) : Boolean(value) };
    case 'number': {
      const number = Number(value);
      return { kind, value: value === undefined || value === '' || Number.isNaN(number) ? null : number };
    }
    case 'list':
    case 'tags':
    case 'names':
      return { kind, value: asArray(value).map(nameOf) };
    case 'links':
      return {
        kind,
        value: asArray(value).map((x) =>
          x && typeof x === 'object' ? { name: String((x as Link).name ?? ''), url: String((x as Link).url ?? '') } : { name: String(x), url: '' },
        ),
      };
    case 'blocks': {
      const contentData = (value as { contentData?: Array<{ values: Array<{ alias: string; value: unknown }> }> })?.contentData;
      const items = contentData ? contentData.map((block) => Object.fromEntries(block.values.map((v) => [v.alias, v.value]))) : asArray(value);
      return {
        kind,
        value: items.map((item) =>
          item && typeof item === 'object' ? { ...(item as Record<string, unknown>) } : { title: String(item) },
        ),
      };
    }
    case 'object':
      return { kind, value: JSON.stringify(value ?? null, null, 2) };
  }
}

/** Switches a placeholder to another kind, keeping as much of its value as makes sense. */
export function convertPlaceholder(placeholder: Placeholder, kind: ValueKind, usage?: AliasUsage): Placeholder {
  let converted: Placeholder | undefined;
  try {
    converted = fromRuntimeValue(toRuntimeValue({ ...placeholder, unset: false }), kind);
  } catch {
    // e.g. invalid JSON
  }
  const empty = !converted || (Array.isArray(converted.value) ? converted.value.length === 0 : converted.value === '' || converted.value === null);
  const result = empty && usage ? samplePlaceholder(usage, kind) : (converted ?? emptyPlaceholder(kind));
  return { ...result, unset: placeholder.unset };
}

function emptyPlaceholder(kind: ValueKind): Placeholder {
  const empty: PlaceholderValues = { text: '', richText: '', boolean: false, number: null, list: [], tags: [], names: [], links: [], blocks: [], object: 'null' };
  return { kind, value: empty[kind] } as Placeholder;
}
