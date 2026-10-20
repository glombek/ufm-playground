/**
 * Playground state, as stored in the URL hash so templates can be shared and linked to (e.g. from
 * the `<ufm-preview playground>` embed).
 */
import type { ValueKind } from './analysis/analyse.js';
import type { PreviewMode } from './components/ufm-preview.js';

export interface PlaygroundState {
  template: string;
  mode?: PreviewMode;
  /** Property values (plus `$settings`/`$index`), or an array of them for several blocks. */
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Kinds of value chosen in the playground, keyed by alias (or `$settings.alias`), where they differ from the guess. */
  kinds?: Record<string, ValueKind>;
  /**
   * The values are complete (e.g. from a real site, via the bookmarklet), so properties that aren't
   * in them are unset, rather than getting placeholder values.
   */
  exact?: boolean;
}

let playgroundBase: string | undefined;

/** Sets where the playground lives (the embed sets this from its own URL). */
export function setPlaygroundBase(url: string) {
  playgroundBase = url;
}

export function playgroundUrl(state: PlaygroundState) {
  const base = playgroundBase ?? `${location.origin}/`;
  return `${base}#${encodeState(state)}`;
}

export function encodeState(state: PlaygroundState) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(hash: string): PlaygroundState | undefined {
  try {
    const base64 = hash.replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!base64) return;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const state = JSON.parse(new TextDecoder().decode(bytes));
    return typeof state?.template === 'string' ? state : undefined;
  } catch {
    return undefined;
  }
}
