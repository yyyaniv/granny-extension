import { loadConfig } from '../lib/storage.js';
import { DAY_MIN, fmtMin, dayKey } from '../lib/power.js';
import { formatDateUk } from '../lib/datetime.js';
import { getPower, slotsFor, imageFor } from './power-data.js';
import { enableNav, el, focusFirst, goHome } from './nav.js';

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

// ---------- the full official picture (all groups), on top of the page ----------
const page = () => [document.querySelector('.pagehead'), $('days'), $('src')];
let mapFrom = null; // the «Увесь графік» button to focus again on close

function openMap(src, title, from) {
  mapFrom = from ? from.dataset.day : null;
  $('map-title').textContent = title;
  $('map-box').classList.remove('zoom');
  $('map-zoom').textContent = '🔍 Більше';
  $('map-fail').hidden = true;
  const img = $('map-img');
  img.hidden = false;
  img.onerror = () => { img.hidden = true; $('map-fail').hidden = false; };
  img.src = src;
  for (const n of page()) n.hidden = true;
  $('map').hidden = false;
  $('map-back').focus();
}

function closeMap() {
  $('map').hidden = true;
  $('map-img').removeAttribute('src');
  for (const n of page()) n.hidden = false;
  const btn = mapFrom && document.querySelector(`[data-day="${mapFrom}"]`);
  (btn || focusFirst())?.focus?.();
}

const mapOpen = () => !$('map').hidden;

function toggleZoom() {
  const zoomed = $('map-box').classList.toggle('zoom');
  $('map-zoom').textContent = zoomed ? '🔍 Менше' : '🔍 Більше';
  $('map-box').scrollTo(0, 0);
}

// zoomed in: arrows move the picture instead of jumping between buttons
window.addEventListener('keydown', (e) => {
  if (!mapOpen() || !$('map-box').classList.contains('zoom')) return;
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  if (!d) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  $('map-box').scrollBy({ left: d[0] * 160, top: d[1] * 160, behavior: 'smooth' });
}, true);

function mapButton(day, image, title) {
  return el('button', { type: 'button', class: 'big small accent mapbtn', 'data-nav': true, 'data-day': day,
    text: '🗺 Увесь графік', onclick: (e) => openMap(image, title, e.currentTarget) });
}

function renderDay(box, title, slots, nowMin, image, day) {
  box.replaceChildren(el('div', { class: 'phead' }, el('h2', { text: title }), ...(image ? [mapButton(day, image, `Усі групи · ${title.split(",")[0]}`)] : [])));
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
  const { provider, days, at } = await getPower(cfg.power.provider).catch(() => ({ days: {}, at: 0 }));
  const focused = document.activeElement?.dataset?.day; // the minute refresh rebuilds the buttons
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayTitle = (word, d) => `${word}, ${formatDateUk(d).replace(/ \d{4}$/, '')}`;
  renderDay($('today'), dayTitle('Сьогодні', now), slotsFor(days, group, now), now.getHours() * 60 + now.getMinutes(), imageFor(days, now), 'today');
  renderDay($('tomorrow'), dayTitle('Завтра', tomorrow), slotsFor(days, group, tomorrow), null, imageFor(days, tomorrow), 'tomorrow');
  if (focused) document.querySelector(`[data-day="${focused}"]`)?.focus();
  const upd = days[dayKey(now)]?.updated;
  $('src').textContent = at && provider ? `Дані ${provider.name}${upd ? ` · графік станом на ${upd}` : ''}` : '';
}

$('map-back').addEventListener('click', closeMap);
$('map-zoom').addEventListener('click', toggleZoom);
$('map-img').addEventListener('click', toggleZoom);
enableNav({ onEscape: () => (mapOpen() ? closeMap() : goHome()) });
init().finally(focusFirst);
setInterval(init, 60000);
