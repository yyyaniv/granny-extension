// Weather from Open-Meteo (free, no key). Pure helpers: URLs, WMO codes, summary.

const DAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];

export function forecastUrl(lat, lon, days = 7) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto', forecast_days: String(days), wind_speed_unit: 'ms',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function geocodeUrl(name) {
  const p = new URLSearchParams({ name: String(name || '').trim(), count: '10', language: 'uk', format: 'json' });
  return `https://geocoding-api.open-meteo.com/v1/search?${p}`;
}

const CYR = /[а-яіїєґ]/i;

/** Geocoding json -> [{ name, label, lat, lon }]. The district (admin2) is shown only when it is in Ukrainian. */
export function parseGeocode(json) {
  const list = (json && Array.isArray(json.results)) ? json.results : [];
  return list.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).map((r) => ({
    name: r.name,
    label: [r.name, CYR.test(r.admin2 || '') ? r.admin2 : '', r.admin1, r.country].filter(Boolean).join(', '),
    admin: [r.admin1, r.admin2].filter(Boolean).join(' '),
    lat: Math.round(r.latitude * 1000) / 1000,
    lon: Math.round(r.longitude * 1000) / 1000,
  }));
}

// Ukrainian -> Latin (official 2010 transliteration). Open-Meteo knows many villages only by their Latin
// name: «Рудки» finds nothing, «Rudky» finds Рудки in Львівська область.
const TR = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia',
};
const TR_START = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };
export function translitUk(text) {
  let out = '';
  let prev = '';
  for (const ch of String(text || '')) {
    const lo = ch.toLowerCase();
    const atStart = !/[a-zа-яіїєґʼ'’]/i.test(prev);
    let t;
    if (lo === 'г' && prev.toLowerCase() === 'з') t = 'gh';
    else if (atStart && TR_START[lo]) t = TR_START[lo];
    else if (lo in TR) t = TR[lo];
    else if (/[ʼ'’]/.test(ch)) t = '';
    else t = ch;
    out += ch !== lo && t ? t[0].toUpperCase() + t.slice(1) : t;
    prev = ch;
  }
  return out;
}

const REGION_WORD = /^(обл\.?|область|район|р-н|.+(ська|цька|зька|ський|цький|зький))$/i;
/**
 * "Рудки, Львівська область" / "Рудки Львівська обл" -> { name: 'Рудки', region: 'Львівська область' }.
 * The region only narrows the results; the geocoder itself is asked for the name.
 */
export function parsePlaceQuery(q) {
  const text = String(q || '').trim().replace(/\s+/g, ' ');
  const comma = text.indexOf(',');
  if (comma > 0) return { name: text.slice(0, comma).trim(), region: text.slice(comma + 1).trim() };
  const words = text.split(' ');
  let i = words.length;
  while (i > 1 && REGION_WORD.test(words[i - 1])) i--;
  return { name: words.slice(0, i).join(' '), region: words.slice(i).join(' ') };
}

const stem = (w) => String(w || '').toLowerCase().replace(/[ʼ'’]/g, '').slice(0, 5);
/** Does a place (from parseGeocode) lie in the region the user typed ("Львівська" matches "Львівська Область" or "Lviv Oblast")? */
export function inRegion(place, region) {
  const first = String(region || '').trim().split(/[\s,]+/).find((w) => !/^(обл\.?|область|район|р-н)$/i.test(w));
  if (!first) return true;
  const admin = String(place.admin || place.label || '').toLowerCase();
  return admin.includes(stem(first)) || admin.includes(stem(translitUk(first)).slice(0, 4));
}

/** Names to ask the geocoder for: as typed, then transliterated (when the name is in Ukrainian). */
export function geocodeNames(name) {
  const n = String(name || '').trim();
  if (!n) return [];
  const lat = translitUk(n);
  return lat !== n ? [n, lat] : [n];
}

/**
 * Merges geocoder answers for geocodeNames(): no duplicates, places in the typed region first (only those when
 * there are any). A place found only by its Latin name gets the Ukrainian name the user typed ("Rudky" -> "Рудки").
 * lists: [{ query, places }].
 */
export function mergePlaces({ name, region }, lists) {
  const seen = new Set();
  const all = [];
  for (const { places } of lists) {
    for (const p of places) {
      const k = `${p.lat},${p.lon}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const typed = String(name || '').trim();
      const fix = CYR.test(typed) && !CYR.test(p.name);
      const nice = typed.charAt(0).toUpperCase() + typed.slice(1);
      all.push(fix ? { ...p, name: nice, label: p.label.replace(p.name, nice) } : p);
    }
  }
  const here = region ? all.filter((p) => inRegion(p, region)) : all;
  return here.length ? here : all;
}

/** WMO weather code -> { icon, text } in Ukrainian. */
export function describeCode(code) {
  const c = Number(code);
  if (c === 0) return { icon: '☀️', text: 'ясно' };
  if (c === 1) return { icon: '🌤️', text: 'переважно ясно' };
  if (c === 2) return { icon: '⛅', text: 'мінлива хмарність' };
  if (c === 3) return { icon: '☁️', text: 'хмарно' };
  if (c === 45 || c === 48) return { icon: '🌫️', text: 'туман' };
  if (c >= 51 && c <= 57) return { icon: '🌦️', text: 'мряка' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { icon: '🌧️', text: c === 65 || c === 82 ? 'сильний дощ' : 'дощ' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { icon: '🌨️', text: 'сніг' };
  if (c >= 95) return { icon: '⛈️', text: 'гроза' };
  return { icon: '🌡️', text: '' };
}

/** 5.4 -> "+5°", -0.4 -> "0°", -3 -> "−3°". */
export function formatTemp(t) {
  const n = Math.round(Number(t));
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0°';
  return n > 0 ? `+${n}°` : `−${-n}°`;
}

/** Forecast json -> { now, days } or null when the data is unusable. */
export function summarize(json) {
  const cur = json && json.current;
  const d = json && json.daily;
  if (!cur || !Number.isFinite(cur.temperature_2m) || !d || !Array.isArray(d.time)) return null;
  const days = d.time.map((date, i) => {
    const [y, m, dd] = String(date).split('-').map(Number);
    return {
      date,
      dayName: DAYS[new Date(y, m - 1, dd).getDay()],
      min: d.temperature_2m_min[i],
      max: d.temperature_2m_max[i],
      rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
      ...describeCode(d.weather_code[i]),
    };
  });
  return {
    now: { temp: cur.temperature_2m, feels: cur.apparent_temperature, wind: cur.wind_speed_10m, ...describeCode(cur.weather_code) },
    days,
  };
}

/** Short line for the home page: "☁️ +5°, хмарно · вдень до +8°". */
export function shortLine(sum) {
  if (!sum) return '';
  const today = sum.days[0];
  const tail = today ? ` · вдень до ${formatTemp(today.max)}` : '';
  return `${sum.now.icon} ${formatTemp(sum.now.temp)}${sum.now.text ? `, ${sum.now.text}` : ''}${tail}`;
}
