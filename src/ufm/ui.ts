/**
 * The bits of the backoffice UI that labels can use: the UUI component library (so templates can
 * use `<uui-tag>` and friends), its light theme and font, and `<umb-icon>` with Umbraco's icon set.
 *
 * The CSS is injected at runtime rather than imported as a stylesheet, because `embed.js` is
 * included on other sites, where Vite's separate CSS files wouldn't be loaded.
 */
import '@umbraco-ui/uui';
import theme from '@umbraco-ui/uui/themes/light.css?inline';
import latoRegular from '@uui-dist/assets/fonts/LatoLatin-Regular.woff2?url';
import latoItalic from '@uui-dist/assets/fonts/LatoLatin-Italic.woff2?url';
import latoBold from '@uui-dist/assets/fonts/LatoLatin-Bold.woff2?url';
import latoBoldItalic from '@uui-dist/assets/fonts/LatoLatin-BoldItalic.woff2?url';
import '@umb-core/components/icon/icon.element.js';
import { UmbIconRegistry } from '@umb-core/icon-registry/icon.registry.js';
import icons from '@umb-core/icon-registry/icons.js';

const fonts = [
  [latoRegular, 'normal', 400],
  [latoItalic, 'italic', 400],
  [latoBold, 'normal', 700],
  [latoBoldItalic, 'italic', 700],
] as const;

const style = document.createElement('style');
style.dataset.ufmPlayground = '';
style.textContent =
  theme +
  fonts
    .map(
      ([url, fontStyle, weight]) =>
        `@font-face{font-family:Lato;src:url(${new URL(url, import.meta.url).href}) format("woff2");font-style:${fontStyle};font-weight:${weight};font-display:swap}`,
    )
    .join('');
document.head.append(style);

/** The names of Umbraco's icons, e.g. `icon-document`. */
export const iconNames = () => icons.filter((icon) => !icon.hidden).map((icon) => icon.name);

let started = false;

/** Lets every `<umb-icon>`/`<uui-icon>` on the page find Umbraco's icons (each loads on demand). */
export function startIcons() {
  if (started) return;
  started = true;
  const registry = new UmbIconRegistry();
  registry.setIcons(icons);
  registry.attach(document.documentElement);
}
