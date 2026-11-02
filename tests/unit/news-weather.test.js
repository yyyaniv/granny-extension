import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRss, htmlToParagraphs, decodeEntities, isReadable, mergeNews, formatWhen } from '../../src/lib/feeds.js';
import { describeCode, formatTemp, summarize, shortLine, parseGeocode, forecastUrl, geocodeUrl } from '../../src/lib/weather.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

test('fixture: Українська правда — full text from content:encoded, image, no «Читайте також»', () => {
  const items = parseRss(fx('rss-up.xml'), 'pravda');
  assert.equal(items.length, 2);
  const a = items[1];
  assert.match(a.title, /Лубінець/);
  assert.match(a.link, /^https:\/\/www\.pravda\.com\.ua\/news\//);
  assert.equal(a.source, 'pravda');
  assert.ok(a.date > 0);
  assert.match(a.image, /^https:\/\/uimg\.pravda\.com\.ua\//);
  assert.ok(a.paras.length >= 5);
  assert.ok(a.paras.every((p) => !/[<>]/.test(p) && !/^Читайте також/.test(p)));
  assert.ok(isReadable(a));
});

test('fixture: Еспресо — glued plain text is split into sentences-paragraphs', () => {
  const items = parseRss(fx('rss-espreso.xml'), 'espreso');
  assert.equal(items.length, 2);
  for (const a of items) {
    assert.match(a.link, /^https:\/\/espreso\.tv\//);
    assert.ok(a.paras.length >= 3, `${a.paras.length} paragraphs`);
    assert.ok(isReadable(a));
  }
  assert.ok(items[1].paras.some((p) => p.startsWith('Не думаю')));
});

test('fixture: Суспільне — only a lead (opens on the site), placeholder image dropped', () => {
  const items = parseRss(fx('rss-suspilne.xml'), 'suspilne');
  assert.equal(items.length, 2);
  for (const a of items) {
    assert.equal(a.image, '');
    assert.equal(isReadable(a), false);
    assert.match(a.link, /^https:\/\/suspilne\.media\//);
  }
});

test('htmlToParagraphs / decodeEntities edge cases', () => {
  assert.deepEqual(htmlToParagraphs('<p>Один &amp; два</p><script>alert(1)</script><p> </p><p>Три<br>Чотири</p>'), ['Один & два', 'Три', 'Чотири']);
  assert.deepEqual(htmlToParagraphs('<figure><img src="x"><figcaption>Фото</figcaption></figure><p>Текст</p>'), ['Текст']);
  assert.deepEqual(htmlToParagraphs('Перше речення.Друге речення!«Третє» тут. 3.5 млн'), ['Перше речення.', 'Друге речення!', '«Третє» тут. 3.5 млн']);
  assert.equal(decodeEntities('&#8220;x&#x201D; &laquo;y&raquo; &bogus;'), '“x” «y» &bogus;');
  assert.deepEqual(parseRss('<rss><item><title>Без посилання</title></item><item><title>X</title><link>javascript:alert(1)</link></item></rss>'), []);
  assert.deepEqual(parseRss(null), []);
});

test('mergeNews: newest first, duplicates removed, limit', () => {
  const a = [{ link: 'https://a/1', date: 10 }, { link: 'https://a/2', date: 30 }];
  const b = [{ link: 'https://a/1', date: 10 }, { link: 'https://b/1', date: 20 }];
  assert.deepEqual(mergeNews([a, b]).map((x) => x.link), ['https://a/2', 'https://b/1', 'https://a/1']);
  assert.equal(mergeNews([a, b], 1).length, 1);
});

test('formatWhen: today / yesterday / date', () => {
  const now = new Date(2026, 10, 2, 10, 0).getTime();
  assert.equal(formatWhen(new Date(2026, 10, 2, 9, 5).getTime(), now), 'сьогодні о 09:05');
  assert.equal(formatWhen(new Date(2026, 10, 1, 23, 59).getTime(), now), 'вчора о 23:59');
  assert.equal(formatWhen(new Date(2026, 9, 30, 18, 0).getTime(), now), '30 жовтня о 18:00');
  assert.equal(formatWhen(0, now), '');
});

test('weather: codes, temperatures, summary line', () => {
  assert.deepEqual(describeCode(0), { icon: '☀️', text: 'ясно' });
  assert.equal(describeCode(3).text, 'хмарно');
  assert.equal(describeCode(61).text, 'дощ');
  assert.equal(describeCode(73).text, 'сніг');
  assert.equal(describeCode(95).text, 'гроза');
  assert.equal(formatTemp(5.4), '+5°');
  assert.equal(formatTemp(-0.4), '0°');
  assert.equal(formatTemp(-3), '−3°');
  assert.equal(formatTemp(undefined), '');
  const json = {
    current: { temperature_2m: 5.1, apparent_temperature: 2, weather_code: 3, wind_speed_10m: 3.2 },
    daily: { time: ['2026-11-02', '2026-11-03'], weather_code: [3, 51], temperature_2m_max: [7.8, 6.7], temperature_2m_min: [4.9, 4.6], precipitation_probability_max: [10, 60] },
  };
  const s = summarize(json);
  assert.equal(s.days.length, 2);
  assert.equal(s.days[0].dayName, 'понеділок');
  assert.equal(s.days[1].rain, 60);
  assert.equal(shortLine(s), '☁️ +5°, хмарно · вдень до +8°');
  assert.equal(summarize({}), null);
  assert.equal(shortLine(null), '');
});

test('weather: urls and geocoding', () => {
  assert.match(forecastUrl(49.8, 24), /latitude=49\.8&longitude=24&/);
  assert.match(geocodeUrl(' Львів '), /name=%D0%9B%D1%8C%D0%B2%D1%96%D0%B2&.*language=uk/);
  const r = parseGeocode({ results: [{ name: 'Львів', admin1: 'Львівська Область', country: 'Україна', latitude: 49.83826, longitude: 24.02324 }, { name: 'X' }] });
  assert.deepEqual(r, [{ name: 'Львів', label: 'Львів, Львівська Область, Україна', lat: 49.838, lon: 24.023 }]);
  assert.deepEqual(parseGeocode(null), []);
});
