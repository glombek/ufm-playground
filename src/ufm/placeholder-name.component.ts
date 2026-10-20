/**
 * Stand-in for the `umbContentName`, `umbMemberName` and `umbLink` components. The real ones
 * look picked items up with the Management API; this renders names straight from the value, so
 * a placeholder value of `"Contact us"`, `["Contact us", "About us"]` or
 * `[{ "name": "Make an enquiry", "url": "/contact" }]` renders as the real thing would.
 */
import { UmbUfmComponentBase, UmbUfmElementBase, UMB_UFM_RENDER_CONTEXT } from '@umbraco-cms/backoffice/ufm';
import type { UfmToken } from '@umbraco-cms/backoffice/ufm';

export class UfmPlaceholderNameComponentApi extends UmbUfmComponentBase {
  render(token: UfmToken) {
    if (!token.text) return;
    // `super`, not `this`, as Marked rebinds `this` when calling render()
    const attributes = super.getAttributes(token.text);
    return `<ufm-placeholder-name ${attributes}></ufm-placeholder-name>`;
  }
}

export { UfmPlaceholderNameComponentApi as api };

export class UfmPlaceholderNameElement extends UmbUfmElementBase {
  static override properties = { alias: { type: String } };
  alias?: string;

  constructor() {
    super();
    this.consumeContext(UMB_UFM_RENDER_CONTEXT, (context) => {
      this.observe(
        context?.value,
        (value) => {
          const picked = this.alias && value && typeof value === 'object' ? (value as Record<string, unknown>)[this.alias] : value;
          const items = Array.isArray(picked) ? picked : picked ? [picked] : [];
          this.value = items.map(nameOf).filter((x) => x).join(', ');
        },
        'observeValue',
      );
    });
  }
}

function nameOf(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const { name, url } = item as { name?: string; url?: string };
    return name || url || '';
  }
  return '';
}

if (!customElements.get('ufm-placeholder-name')) customElements.define('ufm-placeholder-name', UfmPlaceholderNameElement);
