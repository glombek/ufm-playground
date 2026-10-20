/**
 * The script to include on other sites to use `<ufm-preview>`:
 *   <script type="module" src="https://ufm-playground.joe.gl/embed.js"></script>
 */
import './ufm/ui.js';
import './components/ufm-preview.js';
import { setPlaygroundBase } from './state.js';

// The playground is at the root of the site this script comes from
setPlaygroundBase(new URL('/', import.meta.url).href);
