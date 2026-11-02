import { loadConfig, saveConfig, getAnnounceAudio, setAnnounceAudio } from '../lib/storage.js';
import { normalizeConfig, migrateConfig, normalizeEntry, validateEntry, validateTile, newId, ALL_DAYS } from '../lib/config.js';
import { DAY_NAMES_SHORT } from '../lib/datetime.js';
import { getFolderId, listSaved, createCategory, deleteCategory } from '../lib/saved.js';
import { geocodeUrl, parseGeocode } from '../lib/weather.js';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { 'youtube-channel': 'Канал YouTube', 'youtube-video': 'Відео YouTube', 'facebook-profile': 'Facebook' };
let cfg = null;
let editingId = null;

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked') n.checked = v;
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

let statusTimer;
function status(text, isError = false) {
  const s = $('status');
  s.textContent = text;
  s.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  if (!isError) statusTimer = setTimeout(() => { s.textContent = ''; }, 3000);
}

async function persist(okText = 'Збережено ✓') {
  try {
    cfg = await saveConfig(cfg);
    status(okText);
  } catch (e) {
    status('Не вдалося зберегти: ' + (e && e.message ? e.message : 'забагато даних'), true);
  }
}

// ---------------- schedule ----------------
function daysSummary(days) {
  if (days.length === 7) return 'щодня';
  return ALL_DAYS.filter((d) => days.includes(d)).map((d) => DAY_NAMES_SHORT[d]).join(', ');
}

function renderSchedule() {
  const box = $('schedule-list');
  box.replaceChildren();
  if (!cfg.schedule.length) box.append(h('p', {}, 'Записів поки немає.'));
  for (const e of cfg.schedule) {
    const result = h('div', { class: 'check-result', hidden: '' });
    const row = h('div', { class: 'row' + (e.enabled ? '' : ' disabled') },
      h('input', { type: 'checkbox', checked: e.enabled, title: 'Увімкнено', onchange: (ev) => { e.enabled = ev.target.checked; persist(); renderSchedule(); } }),
      h('div', { class: 'grow' }, h('strong', {}, `${e.time} — ${e.name}`), h('br'),
        `${TYPE_LABEL[e.type]} · ${daysSummary(e.days)} · попередити за ${e.warnMinutes} хв`),
      h('button', { onclick: () => openForm(e) }, 'Змінити'),
      h('button', { class: 'danger', onclick: () => { if (confirm(`Видалити «${e.name}»?`)) { cfg.schedule = cfg.schedule.filter((x) => x !== e); persist(); renderSchedule(); } } }, 'Видалити'),
    );
    if (e.type === 'youtube-channel') {
      row.append(h('button', { onclick: () => checkNow(e, result) }, 'Перевірити зараз'));
    }
    row.append(result);
    box.append(row);
  }
}

async function checkNow(entry, out) {
  out.hidden = false;
  out.textContent = 'Перевіряю…';
  const r = await chrome.runtime.sendMessage({ type: 'resolve', entry });
  if (r.status === 'found') {
    const kind = r.item.isLive ? 'іде наживо' : 'запланована на сьогодні';
    out.replaceChildren(`Буде відкрито: «${r.item.title}» (${kind}). `,
      h('a', { href: `https://www.youtube.com/watch?v=${r.item.videoId}`, target: '_blank' }, 'переглянути'));
  } else if (r.status === 'none') {
    out.textContent = `не знайдено (переглянуто відео: ${r.total}). Перевірте ключові слова або дату у назві.`;
  } else {
    out.textContent = `Помилка: ${r.message || 'не вдалося завантажити'}`;
  }
}

function openForm(entry) {
  const f = $('entry-form');
  const e = entry || normalizeEntry({ id: newId('e'), name: '', type: 'youtube-channel', time: '18:00' });
  editingId = entry ? entry.id : null;
  f.hidden = false;
  $('entry-title').textContent = entry ? 'Зміна запису' : 'Новий запис';
  f.elements.name.value = e.name;
  f.elements.type.value = e.type;
  f.elements.url.value = e.url;
  f.elements.keywords.value = e.keywords;
  f.elements.time.value = e.time;
  f.elements.warnMinutes.value = e.warnMinutes;
  f.elements.enabled.checked = e.enabled;
  for (const cb of f.querySelectorAll('[data-day]')) cb.checked = e.days.includes(Number(cb.dataset.day));
  $('everyday').checked = e.days.length === 7;
  $('entry-errors').textContent = '';
  syncType();
  f.scrollIntoView({ behavior: 'smooth' });
}

function syncType() {
  $('kw-label').hidden = $('entry-form').elements.type.value !== 'youtube-channel';
}

function initForm() {
  const f = $('entry-form');
  const days = $('days');
  for (const d of ALL_DAYS) {
    days.append(h('label', { class: 'inline' }, h('input', { type: 'checkbox', 'data-day': String(d), onchange: () => {
      $('everyday').checked = f.querySelectorAll('[data-day]:checked').length === 7;
    } }), ' ' + DAY_NAMES_SHORT[d]));
  }
  $('everyday').addEventListener('change', (ev) => {
    for (const cb of f.querySelectorAll('[data-day]')) cb.checked = ev.target.checked;
  });
  f.elements.type.addEventListener('change', syncType);
  $('add-entry').addEventListener('click', () => openForm(null));
  $('cancel-entry').addEventListener('click', () => { f.hidden = true; });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const days = [...f.querySelectorAll('[data-day]:checked')].map((c) => Number(c.dataset.day));
    const e = {
      id: editingId || newId('e'),
      name: f.elements.name.value.trim(),
      type: f.elements.type.value,
      url: f.elements.url.value.trim(),
      keywords: f.elements.keywords.value.trim(),
      days,
      time: f.elements.time.value,
      warnMinutes: f.elements.warnMinutes.value,
      enabled: f.elements.enabled.checked,
    };
    const errs = validateEntry(e);
    if (errs.length) { $('entry-errors').replaceChildren(...errs.flatMap((m) => [m, h('br')])); return; }
    const n = normalizeEntry(e);
    const i = cfg.schedule.findIndex((x) => x.id === n.id);
    if (i >= 0) cfg.schedule[i] = n; else cfg.schedule.push(n);
    await persist('Запис збережено ✓');
    f.hidden = true;
    renderSchedule();
  });
}

// ---------------- tiles ----------------
function renderTiles() {
  const box = $('tiles');
  box.replaceChildren();
  cfg.tiles.forEach((t) => {
    const upd = (key) => (ev) => {
      t[key] = ev.target.value.trim();
      const errs = validateTile(t);
      if (errs.length) status(errs[0], true); else persist();
    };
    box.append(h('div', { class: 'tile-row' },
      h('input', { value: t.icon, title: 'Значок', onchange: upd('icon') }),
      h('input', { value: t.name, placeholder: 'Назва', onchange: upd('name') }),
      h('input', { value: t.url, placeholder: 'https://…', onchange: upd('url') }),
      h('button', { class: 'danger', onclick: () => { cfg.tiles = cfg.tiles.filter((x) => x !== t); persist(); renderTiles(); } }, 'Видалити')));
  });
}

// ---------------- news ----------------
function renderNews() {
  const box = $('news');
  box.replaceChildren();
  cfg.news.forEach((t) => {
    const upd = (key) => (ev) => {
      t[key] = ev.target.value.trim();
      const errs = validateTile(t);
      if (errs.length) status(errs[0], true); else persist();
    };
    box.append(h('div', { class: 'tile-row' },
      h('input', { value: t.icon, title: 'Значок', onchange: upd('icon') }),
      h('input', { value: t.name, placeholder: 'Назва', onchange: upd('name') }),
      h('input', { value: t.url, placeholder: 'https://…/rss', onchange: upd('url') }),
      h('button', { class: 'danger', onclick: () => { cfg.news = cfg.news.filter((x) => x !== t); persist(); renderNews(); } }, 'Видалити')));
  });
}

// ---------------- weather ----------------
function renderWeather() {
  $('weather-on').checked = cfg.weather.enabled;
  $('weather-city').textContent = cfg.weather.city;
}

function initWeather() {
  $('weather-on').addEventListener('change', (e) => { cfg.weather.enabled = e.target.checked; persist(); });
  const find = async () => {
    const q = $('weather-q').value.trim();
    const box = $('weather-results');
    if (!q) return status('Вкажіть назву міста.', true);
    box.replaceChildren(h('p', { class: 'note' }, 'Шукаю…'));
    let found = [];
    try { found = parseGeocode(await (await fetch(geocodeUrl(q))).json()); } catch { /* offline */ }
    box.replaceChildren(...(found.length ? found.map((r) => h('div', { class: 'row' },
      h('span', { class: 'grow' }, r.label),
      h('button', {
        class: 'primary',
        onclick: async () => {
          cfg.weather = { ...cfg.weather, city: r.name, lat: r.lat, lon: r.lon };
          await persist('Місто збережено ✓');
          box.replaceChildren();
          $('weather-q').value = '';
          renderWeather();
        },
      }, 'Обрати'))) : [h('p', { class: 'note' }, 'Нічого не знайдено. Спробуйте написати інакше.')]));
  };
  $('weather-find').addEventListener('click', find);
  $('weather-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });
}

// ---------------- topics ----------------
function renderTopics() {
  const box = $('topics');
  box.replaceChildren();
  for (const t of cfg.topics) {
    const set = (key) => (ev) => { t[key] = ev.target.value.trim(); persist(); };
    box.append(h('div', { class: 'topic-box' },
      h('input', { value: t.icon, title: 'Значок', onchange: set('icon') }),
      h('input', { value: t.title, title: 'Назва кнопки', onchange: set('title') }),
      h('input', { value: t.prefix, title: 'Слово, яке додається до пошуку (напр. «рецепт»)', placeholder: 'Префікс пошуку', onchange: set('prefix') }),
      h('textarea', { title: 'Фрази для пошуку: по одній на рядок, щоразу показуються 5 випадкових', onchange: (ev) => { t.items = ev.target.value.split('\n').map((x) => x.trim()).filter(Boolean); persist(); }, value: t.items.join('\n') })));
  }
}

// ---------------- saved videos ----------------
async function renderSaved() {
  const box = $('saved-cats');
  box.replaceChildren();
  let data;
  try { data = await listSaved(); } catch { box.append(h('p', { class: 'note' }, 'Закладки Chrome недоступні.')); return; }
  if (!data.categories.length) box.append(h('p', { class: 'note' }, 'Категорій поки немає — відео зберігаються без категорії.'));
  for (const c of data.categories) {
    box.append(h('div', { class: 'row' },
      h('span', { class: 'grow' }, `${c.title} (${c.items.length})`),
      h('button', {
        class: 'danger',
        onclick: async () => {
          let force = false;
          if (c.items.length) {
            force = confirm(`У категорії «${c.title}» є відео (${c.items.length}). Видалити разом з ними?`);
            if (!force) return;
          }
          await deleteCategory(c.id, force);
          status('Категорію видалено ✓');
          renderSaved();
        },
      }, 'Видалити')));
  }
}

function initSaved() {
  $('cat-add').addEventListener('click', async () => {
    const name = $('cat-name').value.trim();
    if (!name) return status('Вкажіть назву категорії.', true);
    try {
      await createCategory(name);
      $('cat-name').value = '';
      status('Категорію створено ✓');
      renderSaved();
    } catch { status('Не вдалося створити категорію.', true); }
  });
  $('cat-open').addEventListener('click', async () => {
    try {
      const id = await getFolderId(true);
      await chrome.tabs.create({ url: `chrome://bookmarks/?id=${id}` });
    } catch { status('Не вдалося відкрити закладки.', true); }
  });
  renderSaved();
}

// ---------------- general ----------------
function initGeneral() {
  $('hideShorts').checked = cfg.hideShortsComments;
  $('fullscreen').checked = cfg.fullscreenOnStream;
  $('hideShorts').addEventListener('change', (e) => { cfg.hideShortsComments = e.target.checked; persist(); });
  $('fullscreen').addEventListener('change', (e) => { cfg.fullscreenOnStream = e.target.checked; persist(); });
  $('add-tile').addEventListener('click', () => {
    cfg.tiles.push({ id: newId('t'), name: 'Новий сайт', icon: '🌐', url: 'https://' });
    renderTiles();
  });
  $('add-news').addEventListener('click', () => {
    cfg.news.push({ id: newId('n'), name: 'Нове джерело', icon: '📰', url: 'https://' });
    renderNews();
  });
}

// ---------------- audio ----------------
const readDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function refreshAudioInfo() {
  const a = await getAnnounceAudio();
  $('audio-info').textContent = a ? `Збережено власний звук (${Math.round(a.length / 1024)} КБ).` : 'Власного звуку немає — буде дзвіночок.';
}

async function storeAudio(blob) {
  if (blob.size > 2.5 * 1024 * 1024) { status('Файл завеликий (максимум близько 2 МБ).', true); return; }
  try {
    await setAnnounceAudio(await readDataUrl(blob));
    status('Звук збережено ✓');
  } catch (e) {
    status('Не вдалося зберегти звук.', true);
  }
  refreshAudioInfo();
}

function initAudio() {
  $('audio-file').addEventListener('change', (e) => { if (e.target.files[0]) storeAudio(e.target.files[0]); });
  $('audio-play').addEventListener('click', async () => {
    const a = await getAnnounceAudio();
    if (a) new Audio(a).play().catch(() => status('Не вдалося відтворити.', true));
    else (await import('../lib/announce.js')).playChime();
  });
  $('audio-del').addEventListener('click', async () => { await setAnnounceAudio(null); status('Звук видалено'); refreshAudioInfo(); });
  let rec = null;
  $('audio-rec').addEventListener('click', async () => {
    const btn = $('audio-rec');
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        rec = null;
        btn.textContent = '● Записати';
        await storeAudio(new Blob(chunks, { type: 'audio/webm' }));
      };
      rec.start();
      btn.textContent = '■ Зупинити запис';
      setTimeout(() => { if (rec) rec.stop(); }, 20000);
    } catch {
      status('Немає доступу до мікрофона.', true);
    }
  });
  refreshAudioInfo();
}

// ---------------- mic ----------------
function initMic() {
  $('mic-allow').addEventListener('click', async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      $('mic-info').textContent = 'Мікрофон дозволено ✓';
    } catch {
      $('mic-info').textContent = 'Доступ не надано. Натисніть кнопку ще раз і оберіть «Дозволити».';
    }
  });
}

// ---------------- export / import ----------------
function initBackup() {
  $('export').addEventListener('click', () => {
    const data = JSON.stringify({ format: 'granny-config', version: 1, config: cfg }, null, 2);
    const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'babusia-nalashtuvannia.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const raw = parsed.config || parsed;
      cfg = normalizeConfig(migrateConfig(raw, 1).config); // old backups: new topic pools
      await persist('Налаштування завантажено ✓');
      renderAll();
    } catch {
      status('Файл не схожий на налаштування.', true);
    }
    e.target.value = '';
  });
}

function renderAll() {
  renderSchedule();
  renderTiles();
  renderTopics();
  renderNews();
  renderWeather();
  $('hideShorts').checked = cfg.hideShortsComments;
  $('fullscreen').checked = cfg.fullscreenOnStream;
}

async function init() {
  cfg = await loadConfig();
  initForm();
  initGeneral();
  initAudio();
  initMic();
  initBackup();
  initSaved();
  initWeather();
  renderAll();
  // First run: store defaults so that background sees a config.
  const s = await chrome.storage.sync.get('cfg_schedule');
  if (!s.cfg_schedule) await persist('Початкові налаштування збережено ✓');
}

init();
