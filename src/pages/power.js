import { loadConfig } from '../lib/storage.js';
import { DAY_MIN, fmtMin, dayKey } from '../lib/power.js';
import { formatDateUk } from '../lib/datetime.js';
import { getPower, slotsFor } from './power-data.js';
import { enableNav, el, focusFirst } from './nav.js';

const $ = (id) => document.getElementById(id);
const pct = (min) => `${(min / DAY_MIN) * 100}%`;

function strip(slots, nowMin) {
  const box = el('div', { class: 'strip' });
  for (const [a, b] of slots) box.append(el('div', { class: 'off', style: `left:${pct(a)};width:${pct(b - a)}` }));
  if (nowMin != null) {
    box.append(el('div', { class: 'past', style: `width:${pct(nowMin)}` }));
    box.append(el('div', { class: 'now', style: `left:${pct(nowMin)}` }));
  }
  const hours = el('div', { class: 'hours' });
  for (let h = 0; h <= 24; h += 3) hours.append(el('span', { style: `left:${pct(h * 60)}`, text: String(h) }));
  return [box, hours];
}

function say(slots) {
  if (!slots.length) return el('p', { class: 'say', text: 'Світло не вимикатимуть' });
  const p = el('p', { class: 'say', text: 'Світла немає: ' });
  slots.forEach(([a, b], i) => p.append(...(i ? [', '] : []), el('b', { text: `${fmtMin(a)}–${fmtMin(b)}` })));
  return p;
}

function renderDay(box, title, slots, nowMin) {
  box.replaceChildren(el('h2', { text: title }));
  if (!slots) {
    box.append(el('p', { class: 'none', text: nowMin == null
      ? 'Графік на завтра ще не оголосили (зазвичай увечері)'
      : 'Графік на сьогодні не вдалося дізнатися. Перевірте інтернет.' }));
    return;
  }
  box.append(...strip(slots, nowMin), say(slots));
}

async function init() {
  const cfg = await loadConfig();
  const group = cfg.power.group;
  $('heading').textContent = `💡 Світло: група ${group}`;
  const { days, at } = await getPower().catch(() => ({ days: {}, at: 0 }));
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayTitle = (word, d) => `${word}, ${formatDateUk(d).replace(/ \d{4}$/, '')}`;
  renderDay($('today'), dayTitle('Сьогодні', now), slotsFor(days, group, now), now.getHours() * 60 + now.getMinutes());
  renderDay($('tomorrow'), dayTitle('Завтра', tomorrow), slotsFor(days, group, tomorrow), null);
  const upd = days[dayKey(now)]?.updated;
  $('src').textContent = at ? `Дані Львівобленерго${upd ? ` · графік станом на ${upd}` : ''}` : '';
}

enableNav();
init().finally(focusFirst);
setInterval(init, 60000);
