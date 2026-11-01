import { loadConfig } from '../lib/storage.js';
import { buildTopicQuery, buildYoutubeSearchUrl } from '../lib/query.js';
import { pickRandom } from '../lib/pick.js';
import { enableNav, el, focusFirst, goHome } from './nav.js';
import { startVoiceFlow } from './voice-flow.js';

const SHOWN = 5;
const id = new URLSearchParams(location.search).get('id');
const content = document.getElementById('content');
const flow = document.getElementById('flow');

async function init() {
  const cfg = await loadConfig();
  const topic = cfg.topics.find((t) => t.id === id);
  if (!topic) return goHome();
  document.getElementById('heading').textContent = `${topic.icon} ${topic.title}`;
  document.title = topic.title;

  let shown = [];
  const more = el('button', { class: 'big muted', 'data-nav': true, onclick: () => { draw(); more.focus(); } },
    el('span', { class: 'icon', text: '🔄' }), el('span', { text: 'Інші' }));
  const voice = el('button', {
    class: 'big muted',
    'data-nav': true,
    onclick: () => {
      content.hidden = true;
      flow.hidden = false;
      startVoiceFlow(flow, { prefix: topic.prefix }).begin();
    },
  }, el('span', { class: 'icon', text: '🎤' }), el('span', { text: 'Сказати своє' }));

  function draw() {
    shown = pickRandom(topic.items, SHOWN, Math.random, shown);
    const links = shown.map((item, i) => el('a', {
      class: 'big accent',
      href: buildYoutubeSearchUrl(buildTopicQuery(topic.prefix, item)),
      'data-nav': true,
      ...(i === 0 ? { 'data-autofocus': true } : {}),
    }, item));
    // Nothing to reshuffle when the pool fits on one screen.
    content.replaceChildren(...links, ...(topic.items.length > SHOWN ? [more] : []), voice);
  }

  draw();
  focusFirst();
}

enableNav();
init();
