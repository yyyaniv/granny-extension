// One calendar for everything: weather (the 7-day forecast), the UGCC calendar (feasts; fast days in red),
// the lunar sowing calendar (green / grey stripe at the bottom of a day).
// Arrow keys walk the days; the left panel shows everything about the chosen day.
import { loadConfig } from '../lib/storage.js';
import { rateDay, monthCalendar, formatDays, PHASES, CROPS } from '../lib/moon.js';
import { feastsOfYear, fastOn } from '../lib/church.js';
import { formatTemp } from '../lib/weather.js';
import { getWeather } from './weather-data.js';
import { enableNav, el, focusItem } from './nav.js';

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const MONTHS_OF = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const DAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
const RATING = {
  good: '✅ Добрий день, щоб сіяти й садити',
  bad: '❌ Краще нічого не сіяти й не садити',
  neutral: '🌱 Звичайний день для городу',
};
const $ = (id) => document.getElementById(id);
const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const now = new Date();
const todayKey = key(now.getFullYear(), now.getMonth(), now.getDate());
let shown = new Date(now.getFullYear(), now.getMonth(), 1);
let listView = false;
let cfg = null;
let weather = new Map(); // 'YYYY-MM-DD' -> forecast day
const feastCache = new Map(); // year -> Map(key -> [names])

function feastsOn(y, m, d) {
  if (!cfg || cfg.church === 'off') return [];
  if (!feastCache.has(y)) {
    const map = new Map();
    for (const f of feastsOfYear(y, cfg.church)) {
      const k = key(f.date.getFullYear(), f.date.getMonth(), f.date.getDate());
      map.set(k, [...(map.get(k) || []), f.name]);
    }
    feastCache.set(y, map);
  }
  return feastCache.get(y).get(key(y, m, d)) || [];
}

function showDay(y, m, d) {
  const date = new Date(y, m, d, 12);
  const k = key(y, m, d);
  const diff = Math.round((date - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 86400000);
  const when = diff === 0 ? 'Сьогодні' : diff === 1 ? 'Завтра' : diff === -1 ? 'Вчора' : DAYS[date.getDay()];
  const r = rateDay(date);
  const p = PHASES[r.phase];
  const feasts = feastsOn(y, m, d);
  const fast = cfg ? fastOn(date, cfg.church) : null;
  const w = weather.get(k);
  const okCrops = r.rating === 'bad' ? [] : CROPS.filter((c) => c.ok(r));
  $('detail').replaceChildren(
    el('div', { class: 'when', text: when }),
    el('div', { class: 'date', text: `${d} ${MONTHS_OF[m]}` }),
    ...feasts.map((f) => el('div', { class: 'feast', text: `🕯 ${f}` })),
    ...(fast ? [el('div', { class: 'fast', text: fast })] : []),
    ...(w ? [el('div', { class: 'wx', text: `${w.icon} ${formatTemp(w.min)} … ${formatTemp(w.max)}, ${w.text}${w.rain != null && w.rain >= 30 ? ` · ☂️ ${w.rain}%` : ''}` })] : []),
    el('div', { class: `rating ${r.rating}`, text: RATING[r.rating] }),
    ...(okCrops.length ? [el('div', { class: 'ok' }, el('b', { text: 'Добре: ' }), okCrops.map((c) => `${c.icon} ${c.name}`).join('; '))] : []),
    el('div', { class: 'note', text: p.advice }));
}

function renderGrid(cal, y, m) {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const cells = Array.from({ length: lead }, () => el('div', { class: 'cell empty' }));
  for (const d of cal.days) {
    const k = key(y, m, d.day);
    const w = weather.get(k);
    const feast = feastsOn(y, m, d.day).length > 0;
    const fast = cfg && fastOn(new Date(y, m, d.day, 12), cfg.church);
    cells.push(el('button', {
      class: `cell sow-${d.rating}${k === todayKey ? ' is-today' : ''}${feast ? ' feast' : ''}${fast ? ' fast' : ''}`,
      type: 'button',
      'data-nav': true,
      ...(k === todayKey ? { 'data-autofocus': true } : {}),
      onfocus: () => showDay(y, m, d.day),
      onclick: () => showDay(y, m, d.day),
    },
    el('span', { class: 'n', text: String(d.day) }),
    el('span', { class: 'i', text: `${feast ? '🕯' : ''}${w ? `${w.icon}${formatTemp(w.max)}` : ''}` })));
  }
  $('grid').style.setProperty('--rows', String(Math.ceil(cells.length / 7)));
  $('grid').replaceChildren(...cells);
}

function renderList(cal, y, m) {
  const row = (label, days, cls = '') => (days.length ? [el('div', { class: `lrow ${cls}`.trim() }, el('span', { class: 'lab', text: label }), el('span', { class: 'days', text: formatDays(days) }))] : []);
  const feasts = cal.days.flatMap((d) => feastsOn(y, m, d.day).map((f) => `${d.day} — ${f}`));
  const fastNames = new Map(); // name -> [days]
  for (const d of cal.days) {
    const f = cfg && fastOn(new Date(y, m, d.day, 12), cfg.church);
    if (f) fastNames.set(f, [...(fastNames.get(f) || []), d.day]);
  }
  $('list').replaceChildren(
    ...[...fastNames].flatMap(([name, days]) => row(name, days, 'fast')),
    ...row('✅ Добре сіяти й садити', cal.good, 'good'),
    ...row('❌ Краще не сіяти', cal.bad, 'bad'),
    ...cal.crops.flatMap((c) => row(`${c.icon} ${c.name}`, c.days)),
    ...(feasts.length ? [el('div', { class: 'feasts', text: `🕯 ${feasts.join(' · ')}` })] : []));
}

function render(focusDay = true) {
  const y = shown.getFullYear();
  const m = shown.getMonth();
  const cal = monthCalendar(y, m);
  $('month').textContent = `${MONTHS[m]} ${y}`;
  $('view').textContent = listView ? '📅 Календар' : '🌱 Що й коли садити';
  $('cal').hidden = listView;
  $('list').hidden = !listView;
  if (listView) renderList(cal, y, m); else renderGrid(cal, y, m);
  if (!listView && focusDay) {
    const cell = $('grid').querySelector('.is-today') || $('grid').querySelector('button.cell');
    if (cell) focusItem(cell);
  }
}

const step = (k) => { shown = new Date(shown.getFullYear(), shown.getMonth() + k, 1); render(false); showDay(shown.getFullYear(), shown.getMonth(), 1); };
$('prev').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
$('view').addEventListener('click', () => { listView = !listView; render(false); });

async function init() {
  cfg = await loadConfig();
  showDay(now.getFullYear(), now.getMonth(), now.getDate());
  render();
  if (cfg.weather.enabled) {
    const w = await getWeather(cfg.weather).catch(() => null);
    if (w) {
      weather = new Map(w.days.map((d) => [d.date, d]));
      const f = document.activeElement;
      const day = f && f.classList.contains('cell') ? Number(f.querySelector('.n').textContent) : null;
      render(false);
      if (!listView) {
        const cell = day && [...$('grid').querySelectorAll('button.cell')][day - 1];
        if (cell) { cell.focus({ preventScroll: true }); showDay(shown.getFullYear(), shown.getMonth(), day); }
      }
    }
  }
}

enableNav();
init();
