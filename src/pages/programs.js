import { loadConfig } from '../lib/storage.js';
import { todaysEntries } from '../lib/schedule.js';
import { enableNav, el, homeButton } from './nav.js';

const list = document.getElementById('list');

async function render() {
  const cfg = await loadConfig();
  const entries = todaysEntries(cfg.schedule, new Date());
  if (!entries.length) {
    list.append(el('div', { class: 'huge', text: 'Сьогодні нічого немає за розкладом' }));
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  for (const e of entries.slice(0, 8)) {
    const [h, m] = e.time.split(':').map(Number);
    const past = h * 60 + m < nowMin;
    list.append(el('a', {
      class: `big ${past ? 'muted' : 'accent'}`,
      href: `stream.html?entry=${encodeURIComponent(e.id)}`,
      'data-nav': true,
    }, el('span', { text: e.time }), el('span', { text: e.name })));
  }
  list.append(homeButton());
}

enableNav();
render();
