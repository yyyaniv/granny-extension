import { enableNav } from './nav.js';
import { startVoiceFlow } from './voice-flow.js';

enableNav();
// she already chose "Пошукати голосом" on the home page: start listening right away
startVoiceFlow(document.getElementById('flow')).begin();
