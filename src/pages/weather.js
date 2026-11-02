import { loadConfig } from '../lib/storage.js';
import { formatTemp } from '../lib/weather.js';
import { getWeather } from './weather-data.js';
import { enableNav, el, focusFirst } from './nav.js';

const $ = (id) => document.getElementById(id);
const dayTitle = (d, i) => (i === 0 ? 'Сьогодні' : i === 1 ? 'Завтра' : d.dayName[0].toUpperCase() + d.dayName.slice(1));

async function init() {
  const cfg = await loadConfig();
  $('heading').textContent = `Погода: ${cfg.weather.city}`;
  const w = await getWeather(cfg.weather).catch(() => null);
  if (!w) {
    $('msg').hidden = false;
    $('msg').textContent = 'Не вдалося дізнатися погоду. Перевірте інтернет і спробуйте пізніше.';
    return;
  }
  const n = w.now;
  $('now').replaceChildren(
    el('div', { class: 'icon', text: n.icon }),
    el('div', {},
      el('div', { class: 'temp', text: formatTemp(n.temp) }),
      el('div', { class: 'text', text: n.text }),
      el('div', { class: 'sub', text: `Відчувається як ${formatTemp(n.feels)} · вітер ${Math.round(n.wind)} м/с` })));
  $('days').replaceChildren(...w.days.map((d, i) => el('div', { class: 'day' },
    el('div', { class: 'name', text: dayTitle(d, i) }),
    el('div', { class: 'icon', text: d.icon }),
    el('div', { class: 'range', text: `${formatTemp(d.min)} … ${formatTemp(d.max)}` }),
    el('div', { class: 'text', text: d.text }),
    ...(d.rain != null && d.rain >= 30 ? [el('div', { class: 'rain', text: `☂️ опади: ${d.rain}%` })] : []))));
}

enableNav();
init().finally(focusFirst);
