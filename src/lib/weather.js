// Weather from Open-Meteo (free, no key). Pure helpers: URLs, WMO codes, summary.

const DAYS = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];

export function forecastUrl(lat, lon, days = 4) {
  const p = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto', forecast_days: String(days), wind_speed_unit: 'ms',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function geocodeUrl(name) {
  const p = new URLSearchParams({ name: String(name || '').trim(), count: '5', language: 'uk', format: 'json' });
  return `https://geocoding-api.open-meteo.com/v1/search?${p}`;
}

/** Geocoding json -> [{ name, label, lat, lon }]. */
export function parseGeocode(json) {
  const list = (json && Array.isArray(json.results)) ? json.results : [];
  return list.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: Math.round(r.latitude * 1000) / 1000,
    lon: Math.round(r.longitude * 1000) / 1000,
  }));
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
