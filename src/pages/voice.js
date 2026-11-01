import { enableNav } from './nav.js';
import { startVoiceFlow } from './voice-flow.js';

enableNav();
startVoiceFlow(document.getElementById('flow'));
