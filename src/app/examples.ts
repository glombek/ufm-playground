import type { PlaygroundState } from '../state.js';

/** Examples from the UFM cheat sheet, with the same values as the article's sample project. */
export const EXAMPLES: Array<PlaygroundState & { name: string }> = [
  {
    name: 'Expression',
    template: "A text block with the heading '${ heading }'",
    values: { heading: 'Contact us' },
  },
  {
    name: 'Label value component',
    template: '{umbValue: heading} / {=heading}',
    values: { heading: 'Contact us' },
  },
  {
    name: 'Content picker',
    template: 'Call to Action: {umbContentName: page}',
    values: { page: ['Contact us'] },
    kinds: { page: 'names' },
  },
  {
    name: 'Multi URL picker',
    template: 'Call to Action: {umbLink: link} (${ link[0].url })',
    values: { link: [{ name: 'Make an enquiry', url: 'https://example.com/contact' }] },
  },
  {
    name: 'Rich text',
    template: 'Text module: ${ bodyText | stripHtml }',
    values: { bodyText: { markup: '<p>This is some text from a <strong>rich text editor</strong>.</p>' } },
  },
  {
    name: 'Truncate',
    template: 'Text module: ${ truncate(stripHtml(bodyText), 35) }',
    values: {
      bodyText: { markup: "<p>This is some text from a <strong>rich text editor</strong>. It goes on a bit, so it's a good candidate for truncating.</p>" },
    },
  },
  {
    name: 'Word limit',
    template: 'Text module: {umbValue: bodyText | stripHtml | wordLimit:4}',
    values: { bodyText: { markup: '<p>This is some text from a <strong>rich text editor</strong>.</p>' } },
  },
  {
    name: 'Yes/No',
    template: 'Text with image (${ flipped ? "Image right" : "Image left" })',
    values: [{ flipped: true }, { flipped: false }],
  },
  {
    name: 'Settings',
    template: 'Text with image (${ $settings.flipped ? "Image right" : "Image left" })',
    values: [{ $settings: { flipped: true } }, { $settings: { flipped: false } }],
  },
  {
    name: '$index',
    template: '${ $index + 1 }. {=heading}',
    values: [{ heading: 'Thing 1' }, { heading: 'Thing 2' }, { heading: 'Cat (in hat)' }],
  },
  {
    name: 'Fallbacks',
    template: '${ heading || "Untitled heading" }',
    values: [{ heading: 'Contact us' }, { heading: '' }, { heading: null }],
  },
  {
    name: 'Fallback to another field',
    template: '${ truncate(title || stripHtml(bodyText), 20) }',
    values: [
      { title: 'A title', bodyText: { markup: '<p>Some body text</p>' } },
      { title: null, bodyText: { markup: "<p>Some body text, because there's no title</p>" } },
    ],
  },
  {
    name: 'Markdown and HTML',
    template: '**Quote:** <q>{=quote}</q> - _{=attribution}_',
    values: { quote: "Joe, you're actually quite funny sometimes", attribution: 'Lotte Pitcher' },
  },
  {
    name: 'Web components',
    template: '<umb-icon name="icon-phone" style="display: inline-block; vertical-align: middle"></umb-icon> {=heading} <uui-tag color="positive" look="primary">New</uui-tag>',
    values: { heading: 'Contact us' },
  },
  {
    name: 'Arrays',
    template: 'Things: ${ tags.join(" / ") } (${ tags.length } tags)',
    values: { tags: ['Thing 1', 'Thing 2', 'Cat (in hat)'] },
  },
  {
    name: 'Nested blocks',
    template: 'Tabs: ${ tabs.contentData.map((tab) => tab.values.find((v) => v.alias == "heading").value).join(" / ") }',
    values: { tabs: [{ heading: 'Umbraco development' }, { heading: '.NET development' }, { heading: 'Front-end builds' }] },
    kinds: { tabs: 'blocks' },
  },
  {
    name: 'Colour picker',
    template: 'Colour: ${ colour.label } (#${ colour.value })',
    values: { colour: { label: 'Raspberry', value: 'e91e63' } },
  },
  {
    name: 'Localisation',
    template: '{umbLocalize: general_name}: {=heading}',
    values: { heading: 'Contact us' },
  },
  {
    name: 'Collection column',
    template: '${ value ? "⭐ Featured" : "" }',
    mode: 'collection',
    values: [{ value: true }, { value: false }],
  },
  {
    name: 'Property description',
    template: 'Descriptions support **UFM** too, so you can use _Markdown_, [links](https://docs.umbraco.com) and localisation ("{umbLocalize: general_name}").',
    mode: 'description',
  },
  {
    name: 'Gotcha: arrow function without brackets',
    template: 'Things: ${ tags.map(t => t.toUpperCase()).join(", ") }',
    values: { tags: ['Thing 1', 'Thing 2'] },
  },
  {
    name: 'Gotcha: filter arguments in expressions',
    template: 'Text module: ${ bodyText | stripHtml | truncate: 35 }',
    values: {
      bodyText: { markup: "<p>This is some text from a <strong>rich text editor</strong>. It goes on a bit, so it's a good candidate for truncating.</p>" },
    },
  },
];
