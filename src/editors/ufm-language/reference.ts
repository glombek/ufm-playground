/** Reference information about UFM's built-in syntax, for completions and hovers. */

export interface FilterInfo {
  description: string;
  /** Arguments after the value, e.g. `length` for `truncate`. */
  args: Array<{ name: string; example: string; optional?: boolean }>;
}

export const FILTERS: Record<string, FilterInfo> = {
  bytes: { description: 'Formats a number of bytes, e.g. `1536` → `1.5 kB`.', args: [{ name: 'decimals', example: '2', optional: true }] },
  fallback: { description: "Uses the fallback text when the value is an empty string. (Not when it's never been set!)", args: [{ name: 'fallback', example: 'Untitled' }] },
  lowercase: { description: 'Converts the value to lower case.', args: [] },
  stripHtml: { description: 'Strips HTML tags, e.g. from a rich text value, leaving the text.', args: [] },
  titleCase: { description: 'Capitalises The First Letter Of Each Word.', args: [] },
  truncate: {
    description: 'Shortens the value to a number of characters, adding a tail (`…` by default, or `false` for none) if it had to cut anything.',
    args: [
      { name: 'length', example: '35' },
      { name: 'tail', example: '…', optional: true },
    ],
  },
  uppercase: { description: 'Converts the value to UPPER CASE.', args: [] },
  wordLimit: { description: "Limits the value to a number of words (with no tail, unlike `truncate`).", args: [{ name: 'limit', example: '15' }] },
};

export interface ComponentInfo {
  description: string;
  /** What goes after the colon. */
  content: 'alias' | 'key';
}

export const COMPONENTS: Record<string, ComponentInfo> = {
  umbValue: { description: "Renders a property's value. Arrays are joined with commas. Shorthand: `{=alias}`.", content: 'alias' },
  umbLocalize: {
    description: "Renders a backoffice translation, in the current user's language. Shorthand: `{#key}`. (Not dictionary items.)",
    content: 'key',
  },
  umbContentName: { description: 'Renders the name(s) of picked documents or media.', content: 'alias' },
  umbMemberName: { description: 'Renders the name(s) of picked members.', content: 'alias' },
  umbLink: { description: "Renders the name(s) of picked links, falling back to the picked item's name.", content: 'alias' },
  umbFormName: { description: 'Renders the name of a picked Umbraco Form (needs Umbraco Forms).', content: 'alias' },
  umbElementName: { description: 'Renders the name(s) of picked elements (Umbraco 18+).', content: 'alias' },
};

export const SPECIAL_VARIABLES: Record<string, string> = {
  $settings: "The block's settings, e.g. `$settings.hideFromMenu`. Only in expressions.",
  $index: "The block's position in the list, starting at 0.",
};

/** Members to suggest after a `.`, as Monaco snippets. */
export interface Member {
  label: string;
  snippet: string;
}

export const STRING_MEMBERS: Array<Member> = [
  { label: 'length', snippet: 'length' },
  { label: 'toUpperCase()', snippet: 'toUpperCase()' },
  { label: 'toLowerCase()', snippet: 'toLowerCase()' },
  { label: 'trim()', snippet: 'trim()' },
  { label: 'split(…)', snippet: 'split(${1:" "})' },
  { label: 'replace(…)', snippet: 'replace(${1:"find"}, ${2:"replace"})' },
  { label: 'includes(…)', snippet: 'includes(${1:"text"})' },
  { label: 'startsWith(…)', snippet: 'startsWith(${1:"text"})' },
  { label: 'slice(…)', snippet: 'slice(${1:0}, ${2:10})' },
];

export const ARRAY_MEMBERS: Array<Member> = [
  { label: 'length', snippet: 'length' },
  { label: 'join(…)', snippet: 'join(${1:", "})' },
  { label: 'map(…)', snippet: 'map((${1:x}) => ${2:x})' },
  { label: 'filter(…)', snippet: 'filter((${1:x}) => ${2:x})' },
  { label: 'find(…)', snippet: 'find((${1:x}) => ${2:x})' },
  { label: 'slice(…)', snippet: 'slice(${1:0}, ${2:2})' },
  { label: 'includes(…)', snippet: 'includes(${1:"text"})' },
];

export const BLOCK_MEMBERS: Array<Member> = [
  { label: 'contentData', snippet: 'contentData' },
  { label: 'contentData.length', snippet: 'contentData.length' },
  {
    label: 'contentData.map(…) (a property of each block)',
    snippet: 'contentData.map((${1:block}) => ${1:block}.values.find((v) => v.alias == "${2:heading}").value).join(${3:", "})',
  },
];

export const LINK_MEMBERS: Array<Member> = [
  { label: '[0].name', snippet: '[0].name' },
  { label: '[0].url', snippet: '[0].url' },
  ...ARRAY_MEMBERS,
];

/** Inline HTML that's handy in labels, plus Umbraco's own elements (which survive sanitising). */
export const TAGS: Record<string, { description: string; snippet: string; attributes?: Record<string, Array<string>> }> = {
  strong: { description: 'Bold text.', snippet: '<strong>$0</strong>' },
  em: { description: 'Italic text.', snippet: '<em>$0</em>' },
  q: { description: 'An inline quote, with quotation marks.', snippet: '<q>$0</q>' },
  code: { description: 'Code.', snippet: '<code>$0</code>' },
  small: { description: 'Small print.', snippet: '<small>$0</small>' },
  mark: { description: 'Highlighted text.', snippet: '<mark>$0</mark>' },
  span: { description: 'A span, e.g. to add a style.', snippet: '<span style="$1">$0</span>', attributes: { style: [], title: [] } },
  abbr: { description: 'An abbreviation, with a tooltip.', snippet: '<abbr title="$1">$0</abbr>', attributes: { title: [] } },
  sub: { description: 'Subscript.', snippet: '<sub>$0</sub>' },
  sup: { description: 'Superscript.', snippet: '<sup>$0</sup>' },
  br: { description: 'A line break.', snippet: '<br>' },
  'uui-tag': {
    description: "A UUI tag, as used around the backoffice.",
    snippet: '<uui-tag color="${1|positive,default,warning,danger|}" look="${2|primary,secondary,outline,placeholder|}">$0</uui-tag>',
    attributes: { color: ['default', 'positive', 'warning', 'danger'], look: ['primary', 'secondary', 'outline', 'placeholder'] },
  },
  'uui-badge': {
    description: 'A UUI badge.',
    snippet: '<uui-badge color="${1|default,positive,warning,danger|}" look="${2|primary,secondary,outline,placeholder|}">$0</uui-badge>',
    attributes: { color: ['default', 'positive', 'warning', 'danger'], look: ['primary', 'secondary', 'outline', 'placeholder'] },
  },
  'umb-icon': {
    description: "One of Umbraco's icons. The style stops it sitting on its own line.",
    snippet: '<umb-icon name="$1" style="display: inline-block; vertical-align: middle"></umb-icon>',
    attributes: { name: [], style: [], color: [] },
  },
};

export const MARKDOWN_SNIPPETS: Array<{ label: string; snippet: string; description: string }> = [
  { label: '**bold**', snippet: '**$0**', description: 'Bold' },
  { label: '_italic_', snippet: '_$0_', description: 'Italic' },
  { label: '`code`', snippet: '`$0`', description: 'Code, shown literally (UFM inside is not rendered)' },
  { label: '[link](url)', snippet: '[$1]($2)', description: 'A link (opens in a new tab)' },
  { label: '${ expression }', snippet: '\\${ $0 }', description: 'A UFM expression' },
  { label: '{umbValue: alias}', snippet: '{umbValue: $0}', description: "A property's value" },
];
