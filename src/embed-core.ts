/**
 * The renderer that `<ufm-preview>` (`embed.js`) loads for this build's Umbraco version:
 * `<ufm-preview-core>`, with the UFM runtime, UUI and icons.
 */
import './ufm/ui.js';
import './components/ufm-preview.js';
import { setPlaygroundBase } from './state.js';

// This version's playground is in the same folder as this script (or the one above, in development)
setPlaygroundBase(new URL(import.meta.url.endsWith('.ts') ? '../' : './', import.meta.url).href);
