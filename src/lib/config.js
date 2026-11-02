// Config defaults, migration and validation (pure).

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const ENTRY_TYPES = ['youtube-channel', 'youtube-video', 'facebook-profile'];

let counter = 0;
export function newId(prefix = 'id') {
  counter++;
  return `${prefix}${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultTiles() {
  return [
    { id: 'youtube', name: 'YouTube', icon: '▶️', url: 'https://www.youtube.com/' },
    { id: 'facebook', name: 'Facebook', icon: '👥', url: 'https://www.facebook.com/' },
  ];
}

// Schema version of stored config. 2 = bigger topic pools + «Історії» topic; 3 = «Новини» topic.
export const CONFIG_VERSION = 3;

// Topic lists shipped in 1.0.0 (kept to recognise untouched installs when migrating).
const OLD_DEFAULT_ITEMS = {
  recipes: ['борщ', 'вареники', 'голубці', 'соління', 'випічка'],
  garden: ['помідори', 'огірки', 'картопля', 'розсада', 'шкідники'],
  health: ['тиск', 'суглоби', 'народні засоби'],
};

export function defaultTopics() {
  return [
    {
      id: 'recipes', icon: '🍲', title: 'Рецепти', prefix: 'рецепт',
      items: [
        'борщ український', 'вареники з картоплею', 'вареники з вишнями', 'голубці', 'ліниві вареники',
        'налисники з сиром', 'пампушки до борщу', 'деруни', 'сирники', 'холодець',
        'солоні огірки', 'квашена капуста', 'пиріг з яблуками', 'пиріг з капустою', 'домашня випічка',
        'картопляники', 'смажені кабачки', 'кутя', 'паска', 'лечо на зиму', 'баклажани на зиму', 'кисіль',
      ],
    },
    {
      id: 'garden', icon: '🍅', title: 'Город', prefix: 'город',
      items: [
        'помідори', 'огірки в теплиці', 'садіння картоплі', 'розсада перцю', 'розсада помідорів',
        'шкідники', 'колорадський жук', 'цибуля', 'часник', 'капуста',
        'морква', 'добрива', 'підживлення огірків', 'обрізка винограду', 'кабачки',
        'лунний календар', 'полуниця', 'обрізка яблуні', 'борошниста роса', 'квіти на клумбі', 'теплиця',
      ],
    },
    {
      id: 'news', icon: '📺', title: 'Новини', prefix: '',
      items: [
        'Еспресо новини', 'Суспільне новини', 'Українська правда новини', 'новини України сьогодні', 'Еспресо наживо',
        'Суспільне Новини наживо', 'новини Львова', 'новини дня', 'підсумки дня', 'погода на тиждень',
        'новини з фронту', 'головне за день', 'вечірні новини', 'ранкові новини', 'Еспресо ввечері',
      ],
    },
    {
      id: 'health', icon: '💊', title: "Здоров'я", prefix: "здоров'я",
      items: [
        'тиск', 'суглоби', 'народні засоби', 'гімнастика для суглобів', 'лікувальна фізкультура',
        'зарядка для літніх людей', 'як знизити тиск', 'ходьба для здоров\'я', 'трав\'яні чаї', 'харчування при діабеті',
        'профілактика серця', 'безсоння', 'болить спина', 'масаж', 'дихальна гімнастика',
        'вітаміни', 'гарний настрій', 'пам\'ять і мозок',
      ],
    },
    {
      id: 'stories', icon: '📖', title: 'Історії', prefix: '',
      items: [
        'життєві історії', 'історія з життя до сліз', 'повчальна історія', 'аудіо розповідь', 'історії про село',
        'оповідання українською', 'цікаві історії з життя', 'історії про любов', 'історія про бабусю', 'християнські історії',
        'притчі', 'аудіокнига українською', 'спогади про село', 'історії про дітей і онуків', 'розповіді на ніч',
        'історії про вірних друзів', 'історія про сусідів', 'добрі історії',
      ],
    },
  ];
}

const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Upgrades stored config to the current schema (pure).
 * raw: { topics?: array }. Returns { config, version, changed }.
 * Untouched 1.0.0 default topics get the new pools; customised topics stay as they are;
 * «stories» is appended once. Fresh installs (no topics) are left to the defaults.
 */
export function migrateConfig(raw, fromVersion) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const from = Number(fromVersion) || 1;
  if (from >= CONFIG_VERSION || !Array.isArray(r.topics)) {
    return { config: r, version: CONFIG_VERSION, changed: false };
  }
  const fresh = defaultTopics();
  let changed = false;
  const topics = r.topics.map((t) => {
    const old = t && OLD_DEFAULT_ITEMS[t.id];
    const def = fresh.find((d) => d.id === (t && t.id));
    if (old && def && sameList(t.items, old)) { changed = true; return { ...t, items: [...def.items] }; }
    return t;
  });
  if (from < 2 && !topics.some((t) => t && t.id === 'stories')) {
    topics.push(fresh.find((d) => d.id === 'stories'));
    changed = true;
  }
  if (!topics.some((t) => t && t.id === 'news')) {
    // right after «Город» when it is there
    const at = topics.findIndex((t) => t && t.id === 'garden');
    topics.splice(at >= 0 ? at + 1 : topics.length, 0, fresh.find((d) => d.id === 'news'));
    changed = true;
  }
  return { config: { ...r, topics }, version: CONFIG_VERSION, changed };
}

export function defaultNews() {
  return [
    { id: 'espreso', name: 'Еспресо', icon: '☕', url: 'https://espreso.tv/rss' },
    { id: 'pravda', name: 'Українська правда', icon: '📰', url: 'https://www.pravda.com.ua/rss/view_news/' },
    { id: 'suspilne', name: 'Суспільне', icon: '📻', url: 'https://suspilne.media/rss/all.rss' },
  ];
}

export function defaultWeather() {
  return { city: 'Львів', lat: 49.838, lon: 24.023, enabled: true };
}

export function defaultSchedule() {
  return [
    { id: 'sample-rosary', name: 'Вервиця', type: 'youtube-channel', url: 'https://www.youtube.com/@ugcctv', keywords: 'ВЕРВИЦЯ ЄДНАЄ', days: [...ALL_DAYS], time: '18:00', warnMinutes: 3, enabled: false },
    { id: 'sample-247', name: 'Молитва (цілодобово)', type: 'youtube-video', url: 'https://www.youtube.com/watch?v=Bcp9VNIW4ss', keywords: '', days: [...ALL_DAYS], time: '20:00', warnMinutes: 3, enabled: false },
  ];
}

export function defaultConfig() {
  return {
    tiles: defaultTiles(),
    schedule: defaultSchedule(),
    topics: defaultTopics(),
    news: defaultNews(),
    weather: defaultWeather(),
    hideShortsComments: true,
    fullscreenOnStream: true,
  };
}

const str = (v, d = '') => (typeof v === 'string' ? v.trim() : d);

function normTime(t) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(str(t));
  if (!m) return str(t) || '18:00';
  return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`;
}

export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
    : [...ALL_DAYS];
  const warn = Number(raw.warnMinutes);
  return {
    id: str(raw.id) || newId('e'),
    name: str(raw.name),
    type: ENTRY_TYPES.includes(raw.type) ? raw.type : 'youtube-channel',
    url: str(raw.url),
    keywords: str(raw.keywords),
    days,
    time: normTime(raw.time),
    warnMinutes: raw.warnMinutes != null && raw.warnMinutes !== '' && Number.isFinite(warn) && warn >= 0 ? Math.floor(warn) : 3,
    enabled: raw.enabled !== false,
  };
}

function normTile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return { id: str(raw.id) || newId('t'), name: str(raw.name), icon: str(raw.icon, '🌐') || '🌐', url: str(raw.url) };
}

function normTopic(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const items = Array.isArray(raw.items) ? raw.items.map((x) => str(x)).filter(Boolean) : [];
  return { id: str(raw.id) || newId('c'), icon: str(raw.icon, '🔎') || '🔎', title: str(raw.title), prefix: str(raw.prefix), items };
}

function normWeather(raw) {
  const d = defaultWeather();
  if (!raw || typeof raw !== 'object') return d;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const ok = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && str(raw.city);
  return { ...(ok ? { city: str(raw.city), lat, lon } : { city: d.city, lat: d.lat, lon: d.lon }), enabled: raw.enabled !== false };
}

export function normalizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const list = (v, fn, dflt) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : dflt());
  return {
    tiles: list(r.tiles, normTile, defaultTiles),
    schedule: list(r.schedule, normalizeEntry, defaultSchedule),
    topics: list(r.topics, normTopic, defaultTopics),
    news: list(r.news, normTile, defaultNews),
    weather: normWeather(r.weather),
    hideShortsComments: r.hideShortsComments !== false,
    fullscreenOnStream: r.fullscreenOnStream !== false,
  };
}

const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || ''));

/** Returns a list of Ukrainian error messages (empty when valid). */
export function validateEntry(e) {
  const errs = [];
  if (!e || !str(e.name)) errs.push('Вкажіть назву, яку побачить бабуся.');
  if (!e || !ENTRY_TYPES.includes(e.type)) errs.push('Оберіть тип джерела.');
  if (!e || !isHttp(e.url)) errs.push('Посилання має починатися з https://');
  if (e && e.type === 'youtube-channel' && !str(e.keywords)) errs.push('Для каналу YouTube вкажіть ключові слова з назви трансляції.');
  if (!e || !/^\d{1,2}:\d{2}$/.test(str(e.time)) || !parseOk(e.time)) errs.push('Вкажіть час у форматі ГГ:ХХ.');
  if (!e || !Array.isArray(e.days) || !e.days.length) errs.push('Оберіть хоча б один день тижня.');
  const w = e ? Number(e.warnMinutes) : NaN;
  if (!Number.isFinite(w) || w < 0 || w > 120) errs.push('Попередження: від 0 до 120 хвилин.');
  return errs;
}

function parseOk(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function validateTile(t) {
  const errs = [];
  if (!t || !str(t.name)) errs.push('Вкажіть назву плитки.');
  if (!t || !isHttp(t.url)) errs.push('Посилання має починатися з https://');
  return errs;
}
