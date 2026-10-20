import { css, html, LitElement, nothing } from '@umbraco-cms/backoffice/external/lit';
import { analyse, type Analysis, type AliasUsage, type Diagnostic, type ValueKind } from '../analysis/analyse.js';
import {
  convertPlaceholder,
  fromRuntimeValue,
  inferKind,
  kindFromValue,
  KINDS,
  samplePlaceholder,
  toRuntimeValue,
  type Placeholder,
} from '../analysis/placeholders.js';
import type { PreviewMode } from '../components/ufm-preview.js';
import '../components/ufm-preview.js';
import '../editors/block-list-editor.js';
import './embed-dialog.js';
import { setUfmLanguageData } from '../editors/ufm-language/data.js';
import { decodeState, encodeState, type PlaygroundState } from '../state.js';
import { getCatalogue, getTerms, hasTerm, startUfm } from '../ufm/runtime.js';
import { iconNames } from '../ufm/ui.js';
import { EXAMPLES } from './examples.js';

type Values = Record<string, unknown>;

interface Block {
  props: Map<string, Placeholder>;
  settings: Map<string, Placeholder>;
  /**
   * Values the template doesn't (currently) use, e.g. the rest of a real block's values from the
   * bookmarklet. Kept, and given to the label (as Umbraco does), so they're there when it uses them.
   */
  rest: Values;
  restSettings: Values;
}

const emptyBlock = (): Block => ({ props: new Map(), settings: new Map(), rest: {}, restSettings: {} });

const MODES: Array<{ value: PreviewMode; name: string }> = [
  { value: 'block', name: 'Block label' },
  { value: 'collection', name: 'Collection column' },
  { value: 'description', name: 'Property description' },
];

type DebugTab = 'markup' | 'values' | 'analysis' | 'state';

const SEVERITY_ICONS = { error: 'icon-alert', warning: 'icon-alert', info: 'icon-info' };

declare const __UMBRACO_VERSION__: string;

export class UfmPlaygroundAppElement extends LitElement {
  static override properties = {
    _template: { state: true },
    _mode: { state: true },
    _analysis: { state: true },
    _blocks: { state: true },
    _markup: { state: true },
    _showDebug: { state: true },
    _debugTab: { state: true },
    _copied: { state: true },
    _emptyBlank: { state: true },
  };

  /** Whether the label renders blank when nothing's filled in. */
  private _emptyBlank = false;

  private _template = '';
  private _mode: PreviewMode = 'block';
  private _analysis?: Analysis;
  private _blocks: Array<Block> = [emptyBlock()];
  /** The values are complete (e.g. from a real site), so properties without values are unset. */
  private _exact = false;
  private _markup = '';
  private _showDebug = false;
  private _debugTab: DebugTab = 'markup';
  private _copied = false;

  /** Values the user has edited, kept when an alias disappears from the template so retyping it restores them. */
  #remembered = new Map<string, Placeholder>();
  #analyseTimer?: number;
  /** Values from a loaded state, applied once we know (from the template) what kind each one is. */
  #pending?: { values: Array<Values>; kinds: Record<string, ValueKind> };

  override connectedCallback() {
    super.connectedCallback();
    this.#load(decodeState(location.hash) ?? EXAMPLES[0]);
    window.addEventListener('hashchange', this.#onHashChange);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.#onHashChange);
  }

  #onHashChange = () => {
    const state = decodeState(location.hash);
    if (state && encodeState(state) !== encodeState(this.#state())) this.#load(state);
  };

  #load(state: PlaygroundState) {
    this._template = state.template;
    this._mode = state.mode ?? 'block';
    const values = state.values === undefined ? [{}] : Array.isArray(state.values) ? state.values : [state.values];
    this.#pending = { values, kinds: state.kinds ?? {} };
    this._exact = !!state.exact;
    this._blocks = values.map(() => emptyBlock());
    void this.#analyse();
  }

  async #analyse() {
    const context = await startUfm();
    const catalogue = (this.#catalogue = await getCatalogue());
    const analysis = analyse(this._template, catalogue);
    this.#addModeDiagnostics(analysis);

    const pending = this.#pending;
    this.#pending = undefined;
    // Kinds from the loaded state win, then any chosen for values the template wasn't using
    const kinds = { ...this.#restKinds, ...pending?.kinds };
    this._blocks = this._blocks.map((block, i) => {
      const given = pending?.values[i];
      const { $settings, $index: _, ...givenProps } = given ?? {};
      const props = this.#syncPlaceholders(block.props, block.rest, analysis.properties, given ? givenProps : undefined, kinds, '');
      const settings = this.#syncPlaceholders(block.settings, block.restSettings, analysis.settings, given ? (($settings as Values) ?? {}) : undefined, kinds, '$settings.');
      return { props: props.used, rest: props.rest, settings: settings.used, restSettings: settings.rest };
    });
    this._analysis = analysis;
    this._markup = await context.parse(this._template, this._mode !== 'description');
    this.#updateLanguageData(catalogue);
    this.#saveState();
  }

  /**
   * Works out the placeholders for the properties the template uses, from (in order) what's loaded,
   * what's already there, values the template wasn't using, and values edited earlier. Anything else
   * gets a sample value, or is unset if the values are exact.
   */
  #syncPlaceholders(
    current: Map<string, Placeholder>,
    rest: Values,
    usages: Map<string, AliasUsage>,
    given: Values | undefined,
    kinds: Record<string, ValueKind> | undefined,
    prefix: string,
  ) {
    const used = new Map<string, Placeholder>();
    // Every value known for this block, whether or not the template uses it
    const pool: Values = given ? { ...given } : { ...rest, ...this.#toValues(current) };
    for (const [alias, usage] of usages) {
      const kind = kinds?.[prefix + alias] ?? (alias in pool ? kindFromValue(pool[alias], inferKind(usage)) : inferKind(usage));
      if (!given && current.has(alias)) used.set(alias, current.get(alias)!);
      else if (alias in pool) used.set(alias, fromRuntimeValue(pool[alias], kind));
      else if (!given && this.#remembered.has(prefix + alias)) used.set(alias, this.#remembered.get(prefix + alias)!);
      else used.set(alias, this._exact ? { ...samplePlaceholder(usage, kind), unset: true } : samplePlaceholder(usage, kind));
      delete pool[alias];
    }
    return { used, rest: pool };
  }

  #updateLanguageData(catalogue: Awaited<ReturnType<typeof getCatalogue>>) {
    const describe = (usages: Map<string, AliasUsage> | undefined, placeholders: Map<string, Placeholder> | undefined) =>
      [...(usages ?? new Map<string, AliasUsage>()).values()].map((usage) => {
        const kind = placeholders?.get(usage.alias)?.kind ?? inferKind(usage);
        return { alias: usage.alias, kind, detail: KINDS[kind].label, members: [...usage.members] };
      });
    // Real properties the template doesn't use yet are worth suggesting too
    const others = (group: 'rest' | 'restSettings', used: Map<string, AliasUsage> | undefined) => {
      const aliases = new Set(this._blocks.flatMap((b) => Object.keys(b[group])).filter((alias) => !used?.has(alias)));
      return [...aliases].map((alias) => {
        const value = this._blocks.find((b) => alias in b[group])?.[group][alias];
        const kind = kindFromValue(value, 'text');
        return { alias, kind, detail: `${KINDS[kind].label} (not used yet)` };
      });
    };
    setUfmLanguageData({
      properties: [...describe(this._analysis?.properties, this._blocks[0]?.props), ...others('rest', this._analysis?.properties)],
      settings: [...describe(this._analysis?.settings, this._blocks[0]?.settings), ...others('restSettings', this._analysis?.settings)],
      filters: catalogue.filters,
      components: catalogue.components,
      terms: getTerms,
      icons: iconNames,
    });
  }

  #addModeDiagnostics(analysis: Analysis) {
    const others = [...analysis.properties.keys()].filter((a) => a !== 'value');
    if (this._mode === 'collection' && others.length) {
      analysis.diagnostics.push({
        severity: 'warning',
        message: `Collection column templates only get the column's value, as "value". ${others.map((a) => `"${a}"`).join(', ')} won't have a value in Umbraco.`,
      });
    }
    if (this._mode === 'collection' && (analysis.settings.size || analysis.usesIndex)) {
      analysis.diagnostics.push({ severity: 'warning', message: '$settings and $index are only available in block labels.' });
    }
    if (this._mode === 'block' && analysis.properties.has('value') && analysis.properties.size === 1) {
      analysis.diagnostics.push({ severity: 'info', message: '"value" is how collection column templates refer to their value. In a block label, use the property alias.' });
    }
    for (const key of analysis.localizationKeys) {
      if (!hasTerm(key)) {
        analysis.diagnostics.push({
          severity: 'warning',
          message: `There's no backoffice translation for "${key}", so it renders the key itself. (Dictionary items aren't supported, but you can register your own translations with a localization extension.)`,
        });
      }
    }
  }

  // ---- State --------------------------------------------------------------------------------

  #toValues(placeholders: Map<string, Placeholder>) {
    const values: Values = {};
    for (const [alias, placeholder] of placeholders) {
      try {
        values[alias] = toRuntimeValue(placeholder);
      } catch {
        values[alias] = undefined;
      }
    }
    return values;
  }

  #blockValues(block: Block, index: number): Values {
    const item = { ...block.rest, ...this.#toValues(block.props) };
    if (block.settings.size || Object.keys(block.restSettings).length) item.$settings = { ...block.restSettings, ...this.#toValues(block.settings) };
    item.$index = index;
    return item;
  }

  #state(): PlaygroundState {
    const kinds: Record<string, ValueKind> = {};
    const values = this._blocks.map((block) => {
      block.props.forEach((p, alias) => (kinds[alias] = p.kind));
      block.settings.forEach((p, alias) => (kinds[`$settings.${alias}`] = p.kind));
      const { $index: _, ...item } = this.#blockValues(block, 0);
      return item;
    });
    return { template: this._template, mode: this._mode, values: values.length === 1 ? values[0] : values, kinds, ...(this._exact ? { exact: true } : {}) };
  }

  #saveState() {
    history.replaceState(null, '', `#${encodeState(this.#state())}`);
  }

  // ---- Event handlers -----------------------------------------------------------------------

  #onTemplateInput(e: Event) {
    this._template = (e.target as HTMLElement & { value: string }).value;
    clearTimeout(this.#analyseTimer);
    this.#analyseTimer = window.setTimeout(() => void this.#analyse(), 150);
  }

  #onExample(e: Event) {
    const select = e.target as HTMLElement & { value: string };
    const example = EXAMPLES[Number(select.value)];
    if (!example) return;
    this.#remembered.clear();
    this.#load(example);
  }

  #onMode(e: Event) {
    this._mode = (e.target as HTMLElement & { value: string }).value as PreviewMode;
    void this.#analyse();
  }

  #updatePlaceholder(index: number, group: 'props' | 'settings', alias: string, placeholder: Placeholder) {
    // A property's type is the same in every block, so changing it in one changes them all
    const kindChanged = this._blocks[index]?.[group].get(alias)?.kind !== placeholder.kind;
    const usage = (group === 'props' ? this._analysis?.properties : this._analysis?.settings)?.get(alias);
    this._blocks = this._blocks.map((b, i) => {
      if (i === index) return { ...b, [group]: new Map(b[group]).set(alias, placeholder) };
      const other = b[group].get(alias);
      if (!kindChanged || !other) return b;
      return { ...b, [group]: new Map(b[group]).set(alias, convertPlaceholder(other, placeholder.kind, usage)) };
    });
    this.#remembered.set(group === 'settings' ? `$settings.${alias}` : alias, placeholder);
    // The kind of value may have changed, which changes what's worth completing
    if (this.#catalogue) this.#updateLanguageData(this.#catalogue);
    this.#saveState();
  }

  #catalogue?: Awaited<ReturnType<typeof getCatalogue>>;

  #addBlock() {
    const template = this._blocks[this._blocks.length - 1];
    this._blocks = [...this._blocks, template ? { ...template, props: new Map(template.props), settings: new Map(template.settings) } : emptyBlock()];
    this.#saveState();
  }

  #duplicateBlock(index: number) {
    const block = this._blocks[index];
    this._blocks = [...this._blocks.slice(0, index + 1), { ...block, props: new Map(block.props), settings: new Map(block.settings) }, ...this._blocks.slice(index + 1)];
    this.#saveState();
  }

  #removeBlock(index: number) {
    this._blocks = this._blocks.filter((_, i) => i !== index);
    this.#saveState();
  }

  async #copyLink() {
    await navigator.clipboard.writeText(location.href);
    this._copied = true;
    setTimeout(() => (this._copied = false), 2000);
  }

  // ---- Rendering ----------------------------------------------------------------------------

  override render() {
    return html`
      <header>
        <div class="title">
          <umb-icon name="icon-brackets"></umb-icon>
          <h1>UFM Playground</h1>
          <span class="version">Umbraco ${__UMBRACO_VERSION__}</span>
        </div>
        <div class="actions">
          <uui-button look="primary" color="default" label="Copy link" .state=${this._copied ? 'success' : undefined} @click=${this.#copyLink}>
            <uui-icon name="icon-link"></uui-icon> Copy link
          </uui-button>
          <uui-button look="outline" color="default" label="Embed code" title="Show this on another page, like a blog post" @click=${() => this.renderRoot.querySelector('ufm-embed-dialog')?.open()}>
            <uui-icon name="icon-code"></uui-icon> Embed code
          </uui-button>
          <!-- The backoffice's router (loaded with its editors) turns same-origin links into
               history.pushState unless they have a target, so this one needs one to navigate -->
          <uui-button look="outline" color="default" label="Get the bookmarklet" title="Send labels from your Umbraco site to the playground" href="/bookmarklet/" target="_top">
            <uui-icon name="icon-bookmark"></uui-icon> Bookmarklet
          </uui-button>
        </div>
      </header>
      <main>
        <div class="column">
          <uui-box headline="Template">
            <div slot="header-actions" class="toolbar">
              <uui-select
                label="Examples"
                placeholder="Examples…"
                .options=${EXAMPLES.map((example, i) => ({ name: example.name, value: String(i) }))}
                @change=${this.#onExample}></uui-select>
              <uui-select
                label="Used as a"
                .options=${MODES.map((m) => ({ name: m.name, value: m.value, selected: m.value === this._mode }))}
                @change=${this.#onMode}></uui-select>
            </div>
            <p class="intro">
              Try out <a href="https://docs.umbraco.com/umbraco-cms/reference/umbraco-flavored-markdown" target="_blank">Umbraco Flavored Markdown</a>, rendered by
              Umbraco's own UFM code. Completions pop up as you type (or press <kbd>Ctrl</kbd>+<kbd>Space</kbd>), and hover over anything for help.
            </p>
            <ufm-template-editor .value=${this._template} .diagnostics=${this._analysis?.diagnostics ?? []} @input=${this.#onTemplateInput}></ufm-template-editor>
            ${this.#renderDiagnostics()}
          </uui-box>
          ${this.#renderDebug()}
        </div>
        <div class="column">${this.#renderOutput()}</div>
      </main>
      <ufm-embed-dialog .state=${this.#state()}></ufm-embed-dialog>
      <footer>
        Placeholder values stand in for your content: names for content, media and member pickers aren't looked up, they're just what you enter.
        Built by Joe Glombek, using the <a href="https://www.npmjs.com/package/@umbraco-cms/backoffice" target="_blank">@umbraco-cms/backoffice</a> package. Not affiliated with Umbraco HQ.
      </footer>
    `;
  }

  #renderDebug() {
    const tabs: Array<{ id: DebugTab; label: string; description: string }> = [
      { id: 'markup', label: 'Markup', description: 'What UFM turns the template into, before its components and expressions render.' },
      { id: 'values', label: 'Label values', description: "Exactly what each block's label is given, as in Umbraco, then the \"Nothing filled in\" block's." },
      { id: 'analysis', label: 'Analysis', description: 'What the playground worked out from the template, to choose the placeholder values.' },
      { id: 'state', label: 'State', description: "What's saved in the URL (and in links you share)." },
    ];
    const tab = tabs.find((t) => t.id === this._debugTab)!;
    return html`<uui-box headline="Debug">
      <uui-button slot="header-actions" compact look="secondary" label=${this._showDebug ? 'Hide' : 'Show'} @click=${() => (this._showDebug = !this._showDebug)}></uui-button>
      ${this._showDebug
        ? html`
            <uui-tab-group>
              ${tabs.map((t) => html`<uui-tab label=${t.label} .active=${t.id === this._debugTab} @click=${() => (this._debugTab = t.id)}></uui-tab>`)}
            </uui-tab-group>
            <p class="hint">${tab.description}</p>
            <umb-code-editor
              class="debug"
              language=${this._debugTab === 'markup' ? 'html' : 'json'}
              .readonly=${true}
              .wordWrap=${true}
              .disableMinimap=${true}
              .disableLineNumbers=${true}
              .code=${this.#debugContent()}></umb-code-editor>
          `
        : html`<p class="hint">The generated markup, the values each label is given, and more.</p>`}
    </uui-box>`;
  }

  #debugContent() {
    const json = (value: unknown) => JSON.stringify(value, (_, v) => (v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v), 2);
    switch (this._debugTab) {
      case 'markup':
        return this._markup;
      case 'values': {
        const empty: Values = { $index: this._blocks.length };
        if (this._analysis?.settings.size) empty.$settings = {};
        return json([...this._blocks.map((b, i) => this.#blockValues(b, i)), empty]);
      }
      case 'analysis': {
        const describe = (usages?: Map<string, AliasUsage>) =>
          Object.fromEntries(
            [...(usages ?? new Map<string, AliasUsage>()).values()].map((u) => [
              u.alias,
              { kind: this._blocks[0]?.props.get(u.alias)?.kind ?? this._blocks[0]?.settings.get(u.alias)?.kind ?? inferKind(u), hints: u.hints, nestedAliases: u.nestedAliases, members: u.members },
            ]),
          );
        return json({
          properties: describe(this._analysis?.properties),
          settings: describe(this._analysis?.settings),
          usesIndex: this._analysis?.usesIndex,
          localizationKeys: this._analysis?.localizationKeys,
          diagnostics: this._analysis?.diagnostics,
        });
      }
      case 'state':
        return json(this.#state());
    }
  }

  #renderDiagnostics() {
    const diagnostics = this._analysis?.diagnostics ?? [];
    if (!diagnostics.length) return html`<p class="ok"><uui-icon name="icon-check"></uui-icon> No problems found</p>`;
    return html`<ul class="diagnostics">
      ${diagnostics.map(
        (d: Diagnostic) => html`<li class=${d.severity}>
          <uui-icon name=${SEVERITY_ICONS[d.severity]}></uui-icon>
          <span>${d.message}${d.source ? html` <code>${d.source}</code>` : nothing}</span>
        </li>`,
      )}
    </ul>`;
  }

  #renderOutput() {
    // Labels parsed before UFM has finished starting would render its syntax as plain text
    if (!this._analysis) return html`<uui-box headline="Blocks"><uui-loader-bar></uui-loader-bar></uui-box>`;
    switch (this._mode) {
      case 'description':
        return html`<uui-box headline="Property description">
          <ufm-preview .template=${this._template} mode="description" .exactValues=${true}></ufm-preview>
        </uui-box>`;
      case 'collection': {
        const rows = [...this._blocks.map((b, i) => this.#blockValues(b, i)), { $empty: true }];
        return html`
          <uui-box headline="Collection">
            <ufm-preview
              .template=${this._template}
              .values=${rows}
              mode="collection"
              .exactValues=${true}
              @label-resolved=${(e: CustomEvent<{ index: number; text: string }>) => {
                if (e.detail.index === rows.length - 1) this._emptyBlank = !e.detail.text.trim();
              }}></ufm-preview>
            ${this.#renderBlankWarning('cell')}
          </uui-box>
          <uui-box headline="Rows">${this.#renderBlockEditor('Page ${ $index + 1 }', 'row', 'icon-document')}</uui-box>
        `;
      }
      default:
        return html`<uui-box headline="Blocks">
          <p class="hint">Each block's label is rendered from the template. Open a block to change its values.</p>
          ${this.#renderBlockEditor(this._template, 'block', 'icon-document')}
          ${this._analysis?.usesIndex ? html`<p class="hint"><code>$index</code> is each block's position, starting at 0.</p>` : nothing}
          ${this.#renderEmptyBlock()}
        </uui-box>`;
    }
  }

  /** A block with nothing filled in, as an editor would see it straight after adding it. */
  #renderEmptyBlock() {
    const empty: Values = { $index: this._blocks.length };
    if (this._analysis?.settings.size) empty.$settings = {};
    return html`<div class="empty-block">
      <h3>Nothing filled in</h3>
      <p class="hint">A new block, before an editor has entered anything: every property is unset. Make sure it still makes sense!</p>
      <ufm-preview
        class="empty-preview"
        .template=${this._template}
        .values=${[empty]}
        .exactValues=${true}
        @label-resolved=${(e: CustomEvent<{ text: string }>) => (this._emptyBlank = !e.detail.text.trim())}></ufm-preview>
      ${this.#renderBlankWarning('label')}
    </div>`;
  }

  #renderBlankWarning(what: 'label' | 'cell') {
    if (!this._emptyBlank) return nothing;
    return html`<p class="blank-warning">
      <uui-icon name="icon-alert"></uui-icon>
      <span>
        With nothing filled in, this ${what} is blank${what === 'label' ? ", so editors would only see the block's icon" : ''}. Consider a fallback, e.g.
        <code>\${ heading || "Untitled heading" }</code>, or some fixed text.
      </span>
    </p>`;
  }

  #renderBlockEditor(label: string, blockName: string, icon: string) {
    return html`<ufm-block-list-editor
      .blocks=${this._blocks}
      .label=${label}
      .icon=${icon}
      block-name=${blockName}
      .labelValue=${(block: Block, index: number) => this.#blockValues(block, index)}
      .renderBlockEditor=${(block: Block, index: number) => this.#renderValueEditors(block, index)}
      @add=${this.#addBlock}
      @duplicate=${(e: CustomEvent<number>) => this.#duplicateBlock(e.detail)}
      @remove=${(e: CustomEvent<number>) => this.#removeBlock(e.detail)}></ufm-block-list-editor>`;
  }

  #renderValueEditors(block: Block, index: number) {
    const others = this.#otherProperties(block);
    if (!block.props.size && !block.settings.size && !others.length) {
      return html`<p class="hint">Use a property alias in the template, e.g. <code>{=heading}</code> or <code>\${ heading }</code>, and it'll appear here.</p>`;
    }
    const editors = (group: 'props' | 'settings', placeholders: Map<string, Placeholder>, usages?: Map<string, AliasUsage>) =>
      [...placeholders].map(
        ([alias, placeholder]) => html`<ufm-value-editor
          .alias=${alias}
          .prefix=${group === 'settings' ? '$settings.' : ''}
          .placeholder=${placeholder}
          .usage=${usages?.get(alias)}
          @change=${(e: CustomEvent<Placeholder>) => this.#updatePlaceholder(index, group, alias, e.detail)}></ufm-value-editor>`,
      );
    return html`
      ${block.props.size ? html`<h3>Content</h3>${editors('props', block.props, this._analysis?.properties)}` : nothing}
      ${block.settings.size ? html`<h3>Settings</h3>${editors('settings', block.settings, this._analysis?.settings)}` : nothing}
      ${others.length
        ? html`<h3>Other properties</h3>
            <p class="hint">This block's other values, which the template doesn't use (yet).</p>
            ${others.map(
              ({ alias, group, placeholder }) => html`<div class="other">
                <ufm-value-editor
                  .alias=${alias}
                  .prefix=${group === 'restSettings' ? '$settings.' : ''}
                  .placeholder=${placeholder}
                  @change=${(e: CustomEvent<Placeholder>) => this.#updateRest(index, group, alias, e.detail)}></ufm-value-editor>
                <uui-button compact look="secondary" label="Use in template" @click=${() => this.#useInTemplate(alias, group)}></uui-button>
              </div>`,
            )}`
        : nothing}
    `;
  }

  /** Kinds chosen for values the template doesn't use, so they don't change back to the guess from their shape. */
  #restKinds: Record<string, ValueKind> = {};

  #otherProperties(block: Block) {
    return (['rest', 'restSettings'] as const).flatMap((group) =>
      Object.entries(block[group]).map(([alias, value]) => {
        const key = group === 'restSettings' ? `$settings.${alias}` : alias;
        const kind = this.#restKinds[key] ?? kindFromValue(value, 'text');
        return { alias, group, placeholder: fromRuntimeValue(value, kind) };
      }),
    );
  }

  #updateRest(index: number, group: 'rest' | 'restSettings', alias: string, placeholder: Placeholder) {
    this.#restKinds[group === 'restSettings' ? `$settings.${alias}` : alias] = placeholder.kind;
    let value: unknown;
    try {
      value = toRuntimeValue(placeholder);
    } catch {
      return; // e.g. JSON that isn't valid yet
    }
    this._blocks = this._blocks.map((b, i) => (i === index ? { ...b, [group]: { ...b[group], [alias]: value } } : b));
    this.#saveState();
  }

  /** Adds a property the template doesn't use to the end of the template. */
  #useInTemplate(alias: string, group: 'rest' | 'restSettings') {
    this._template = `${this._template.trimEnd()} ${group === 'restSettings' ? `\${ $settings.${alias} }` : `{=${alias}}`}`.trim();
    void this.#analyse();
  }

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      font-family: var(--uui-font-family);
      font-size: var(--uui-type-default-size, 14px);
      color: var(--uui-color-text);
      background: var(--uui-color-background);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--uui-size-space-4);
      padding: var(--uui-size-space-3) var(--uui-size-space-5);
      background: var(--uui-color-header-surface);
      color: var(--uui-color-header-contrast-emphasis);
    }
    .title {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3);
    }
    .title umb-icon {
      font-size: 1.4em;
    }
    h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .version {
      color: var(--uui-color-header-contrast);
      font-size: 0.9em;
    }
    header .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--uui-size-space-2);
    }
    header uui-button[look='outline'] {
      --uui-button-contrast: var(--uui-color-header-contrast-emphasis);
      --uui-button-border-color: var(--uui-color-header-contrast);
      --uui-button-contrast-hover: var(--uui-color-header-contrast-emphasis);
      --uui-button-border-color-hover: var(--uui-color-header-contrast-emphasis);
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--uui-size-layout-1);
      padding: var(--uui-size-layout-1);
      align-items: start;
      max-width: 1600px;
      margin: 0 auto;
    }
    @media (max-width: 1000px) {
      main {
        grid-template-columns: minmax(0, 1fr);
        padding: var(--uui-size-space-4);
      }
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: var(--uui-size-layout-1);
      min-width: 0;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: var(--uui-size-space-2);
    }
    .intro {
      margin-top: 0;
    }
    kbd {
      font-family: inherit;
      font-size: 0.85em;
      padding: 0 4px;
      border: 1px solid var(--uui-color-border);
      border-radius: 3px;
      background: var(--uui-color-surface-alt);
    }
    .ok {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-2);
      color: var(--uui-color-positive-standalone);
      margin-bottom: 0;
    }
    .diagnostics {
      list-style: none;
      padding: 0;
      margin: var(--uui-size-space-4) 0 0;
      display: flex;
      flex-direction: column;
      gap: var(--uui-size-space-2);
    }
    .diagnostics li {
      display: flex;
      gap: var(--uui-size-space-3);
      align-items: baseline;
      padding: var(--uui-size-space-3) var(--uui-size-space-4);
      border-radius: var(--uui-border-radius);
      border-left: 4px solid;
      background: var(--uui-color-surface-alt);
    }
    .diagnostics uui-icon {
      flex: none;
      position: relative;
      top: 2px;
    }
    .diagnostics .error {
      border-color: var(--uui-color-danger);
    }
    .diagnostics .error uui-icon {
      color: var(--uui-color-danger);
    }
    .diagnostics .warning {
      border-color: var(--uui-color-warning);
    }
    .diagnostics .warning uui-icon {
      color: var(--uui-color-warning-standalone);
    }
    .diagnostics .info {
      border-color: var(--uui-color-default);
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 0.9em;
      background: var(--uui-color-surface-alt);
      padding: 1px 4px;
      border-radius: 3px;
      overflow-wrap: anywhere;
    }
    .hint {
      color: var(--uui-color-text-alt);
      margin-top: 0;
    }
    .empty-block {
      margin-top: var(--uui-size-layout-1);
      padding-top: var(--uui-size-space-4);
      border-top: 1px solid var(--uui-color-divider-standalone);
    }
    .empty-block h3 {
      margin-top: 0;
    }
    .empty-preview {
      opacity: 0.85;
    }
    .blank-warning {
      display: flex;
      gap: var(--uui-size-space-3);
      align-items: baseline;
      margin: var(--uui-size-space-3) 0 0;
      padding: var(--uui-size-space-3) var(--uui-size-space-4);
      border-left: 4px solid var(--uui-color-warning);
      border-radius: var(--uui-border-radius);
      background: var(--uui-color-surface-alt);
    }
    .blank-warning uui-icon {
      flex: none;
      color: var(--uui-color-warning-standalone);
      position: relative;
      top: 2px;
    }
    .debug {
      display: block;
      height: 280px;
      margin-top: var(--uui-size-space-3);
      border: 1px solid var(--uui-color-border);
    }
    h3 {
      margin: var(--uui-size-space-4) 0 0;
      font-size: 1rem;
    }
    a {
      color: var(--uui-color-interactive);
    }
    a:hover {
      color: var(--uui-color-interactive-emphasis);
    }
    footer {
      padding: 0 var(--uui-size-layout-1) var(--uui-size-layout-1);
      max-width: 1600px;
      margin: 0 auto;
      font-size: 0.9em;
      color: var(--uui-color-text-alt);
    }
  `;
}

customElements.define('ufm-playground-app', UfmPlaygroundAppElement);
