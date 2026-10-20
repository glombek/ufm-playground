import { startIcons } from './ufm/ui.js';
import './app/playground-app.js';

startIcons();

// The editors (Monaco and TipTap) are big, so load them after the page has rendered
void import('./editors/template-editor.js');
void import('./editors/value-editor.js');
