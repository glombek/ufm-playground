/**
 * What the `ufm` language knows about the template being edited, for completions and hovers.
 * Kept apart from the language itself so it can be updated without loading Monaco.
 */
import { FILTERS } from './reference.js';

export interface UfmLanguageData {
  /** Property aliases, with a short description of their value (e.g. "Rich text"). */
  properties: Array<{ alias: string; detail?: string; kind?: string; members?: Array<string> }>;
  settings: Array<{ alias: string; detail?: string; kind?: string; members?: Array<string> }>;
  /** Aliases of registered filters (including custom ones). */
  filters: Array<string>;
  /** Registered components: alias and optional marker. */
  components: Array<{ alias: string; marker?: string }>;
  /** Localization keys and their text. */
  terms: () => Array<[string, string]>;
  /** Names of available icons. */
  icons: () => Array<string>;
}

let data: UfmLanguageData = { properties: [], settings: [], filters: Object.keys(FILTERS), components: [], terms: () => [], icons: () => [] };

/** Tells the language about the template being edited. */
export function setUfmLanguageData(newData: Partial<UfmLanguageData>) {
  data = { ...data, ...newData };
}

export function getUfmLanguageData() {
  return data;
}
