import { loadConfig } from '../lib/storage.js';
import { todaysEntries } from '../lib/schedule.js';
import { enableNav, el, focusFirst } from './nav.js';

const list = document.getElementById('list');

async function render() {
  const cfg = await loadConfig();
  const entries = todaysEntries(cfg.schedule, new Date());
  if (!entries.length) {
    list.classList.remove('choices');
    list.append(el('div', { class: 'huge', text: 'Сьогодні нічого немає за розкладом' }));
    return;
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  // up to 8 on one screen: two columns, the rows share the height
  const shown = entries.slice(0, 8);
  list.classList.toggle('one-col', shown.length <= 4);
  let first = true;
  for (const e of shown) {
    const [h, m] = e.time.split(':').map(Number);
    const past = h * 60 + m < nowMin;
    list.append(el('a', {
      class: `big ${past ? 'muted' : 'accent'}`,
      href: `stream.html?entry=${encodeURIComponent(e.id)}`,
      'data-nav': true,
      // the next one that has not started yet gets the focus
      ...(!past && first ? { 'data-autofocus': true } : {}),
    }, el('span', { class: 'time', text: e.time }), el('span', { text: e.name })));
    if (!past) first = false;
  }
  focusFirst();
}

enableNav();
render();
