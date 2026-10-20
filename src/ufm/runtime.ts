/**
 * Boots the real Umbraco Flavored Markdown implementation from `@umbraco-cms/backoffice`
 * outside of the backoffice.
 *
 * In the backoffice, UFM is wired up by the extension registry and a global context. Here we
 * register just the UFM manifests we need, create a single UFM context, and provide it to the
 * whole page. Components which need the Management API (content, member and link names) are
 * swapped for stand-ins which render placeholder names from the values instead.
 */
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbLocalizationManager } from '@umbraco-cms/backoffice/localization-api';
import { UMB_UFM_CONTEXT, UmbUfmContext, UmbUfmFilterBase } from '@umbraco-cms/backoffice/ufm';
import type { ManifestUfmComponent, ManifestUfmFilter } from '@umbraco-cms/backoffice/ufm';
import { manifests as markedExtensionManifests } from '@ufm-internal/extensions/manifests.js';
import { manifests as filterManifests } from '@ufm-internal/filters/manifests.js';

const componentManifests: Array<ManifestUfmComponent> = [
  // The real components, which only need the values passed in
  {
    type: 'ufmComponent',
    alias: 'Umb.Markdown.LabelValue',
    name: 'Label Value UFM Component',
    api: () => import('@ufm-internal/components/label-value/label-value.component.js'),
    meta: { alias: 'umbValue', marker: '=' },
  },
  {
    type: 'ufmComponent',
    alias: 'Umb.Markdown.Localize',
    name: 'Localize UFM Component',
    api: () => import('@ufm-internal/components/localize/localize.component.js'),
    meta: { alias: 'umbLocalize', marker: '#' },
  },
  // Stand-ins for components which look items up with the Management API
  {
    type: 'ufmComponent',
    alias: 'Umb.Markdown.ContentName',
    name: 'Content Name UFM Component (placeholder)',
    api: () => import('./placeholder-name.component.js'),
    meta: { alias: 'umbContentName' },
  },
  {
    type: 'ufmComponent',
    alias: 'Umb.Markdown.Link',
    name: 'Link UFM Component (placeholder)',
    api: () => import('./placeholder-name.component.js'),
    meta: { alias: 'umbLink' },
  },
  {
    type: 'ufmComponent',
    alias: 'Umb.Markdown.MemberName',
    name: 'Member Name UFM Component (placeholder)',
    api: () => import('./placeholder-name.component.js'),
    meta: { alias: 'umbMemberName' },
  },
];

class UfmRuntimeHostElement extends UmbLitElement {}
customElements.define('ufm-runtime-host', UfmRuntimeHostElement);

let ready: Promise<UmbUfmContext> | undefined;

/** Starts UFM for this page. Safe to call more than once. */
export function startUfm(): Promise<UmbUfmContext> {
  ready ??= start();
  return ready;
}

async function start() {
  umbExtensionsRegistry.registerMany([...markedExtensionManifests, ...filterManifests, ...componentManifests]);

  // The UFM context's controllers only run while their host is connected
  const host = new UfmRuntimeHostElement();
  host.hidden = true;
  document.body.append(host);
  const context = new UmbUfmContext(host);

  // Provide the context to every element on the page, not just the host's descendants
  new UmbContextProvider(document.documentElement, UMB_UFM_CONTEXT, context).hostConnected();

  // Filters and components load asynchronously, and templates parsed before they've arrived
  // would render as plain text, so wait until everything has been picked up
  await Promise.all([
    registerDefaultLocalization(),
    waitFor(() => context.getFilters().length >= filterManifests.length),
    waitFor(async () => {
      const html = await context.parse('{=x}{#x}{umbContentName: x}', true);
      return ['ufm-label-value', 'ufm-localize', 'ufm-placeholder-name'].every((tag) => html.includes(tag));
    }),
  ]);
  return context;
}

async function waitFor(condition: () => boolean | Promise<boolean>, timeout = 10_000) {
  const start = performance.now();
  while (!(await condition())) {
    if (performance.now() - start > timeout) throw new Error('Timed out waiting for UFM to start');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The filters and components UFM currently knows about. */
export async function getCatalogue() {
  const context = await startUfm();
  return {
    filters: context.getFilters().map((f) => f.alias),
    components: umbExtensionsRegistry
      .getByType('ufmComponent')
      .map((m) => ({ alias: (m as ManifestUfmComponent).meta.alias, marker: (m as ManifestUfmComponent).meta.marker })),
  };
}

/** All the localization keys, with their (English) text, for completions. */
export function getTerms(): Array<[string, string]> {
  const terms = umbLocalizationManager.localizations.get('en') ?? {};
  return Object.entries(terms)
    .filter(([key]) => !key.startsWith('$'))
    .map(([key, value]) => [key, typeof value === 'string' ? value : '(depends on arguments)']);
}

/** Whether a localization key exists (otherwise umbLocalize renders the key itself). */
export function hasTerm(key: string) {
  return [...umbLocalizationManager.localizations.values()].some((terms) => key in terms);
}

/** Registers extra filters (e.g. ones written in the playground). */
export function registerFilter(alias: string, filter: (...args: Array<any>) => unknown) {
  const manifestAlias = `UfmPlayground.Filter.${alias}`;
  if (umbExtensionsRegistry.isRegistered(manifestAlias)) umbExtensionsRegistry.unregister(manifestAlias);
  const manifest: ManifestUfmFilter = {
    type: 'ufmFilter',
    alias: manifestAlias,
    name: `${alias} UFM Filter`,
    api: class extends UmbUfmFilterBase {
      filter(...args: Array<unknown>) {
        return filter(...args) as string;
      }
    },
    meta: { alias },
  };
  umbExtensionsRegistry.register(manifest);
}

/** Registers (or overrides) localization terms, keyed like `section_key`. */
export function registerTerms(terms: Record<string, string>, culture = 'en') {
  umbLocalizationManager.registerLocalization({ $code: culture, $dir: 'ltr', ...terms } as any);
}

async function registerDefaultLocalization() {
  // The backoffice's own English translations, flattened to `section_key` as the backoffice does
  const { default: sections } = await import('@umb-assets/lang/en.js');
  const terms: Record<string, unknown> = {};
  for (const [section, entries] of Object.entries(sections as Record<string, Record<string, unknown>>)) {
    for (const [key, value] of Object.entries(entries)) terms[`${section}_${key}`] = value;
  }
  umbLocalizationManager.registerLocalization({ $code: 'en', $dir: 'ltr', ...terms } as any);
}
