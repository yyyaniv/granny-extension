import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicQuery, buildYoutubeSearchUrl } from '../../src/lib/query.js';
import { normalizeConfig, normalizeEntry, validateEntry, defaultConfig, migrateWeather } from '../../src/lib/config.js';
import { formatDateUk, formatTime } from '../../src/lib/datetime.js';

test('topic query', () => {
  assert.equal(buildTopicQuery('рецепт', '  з   капустою '), 'рецепт з капустою');
  assert.equal(buildTopicQuery('', 'борщ'), 'борщ');
  assert.equal(buildTopicQuery("здоров'я", ''), "здоров'я");
});

test('search url encoding', () => {
  assert.equal(buildYoutubeSearchUrl('рецепт борщ'),
    'https://www.youtube.com/results?search_query=' + encodeURIComponent('рецепт борщ'));
  assert.match(buildYoutubeSearchUrl("здоров'я & тиск"), /search_query=%D0%B7%D0%B4.*%26/);
  assert.ok(!buildYoutubeSearchUrl('а б').includes(' '));
});

test('defaults', () => {
  const c = normalizeConfig(undefined);
  assert.equal(c.tiles.length, 2);
  assert.equal(c.tiles[0].url, 'https://www.youtube.com/');
  assert.equal(c.topics.length, 5);
  assert.deepEqual(c.topics.map((t) => t.id), ['recipes', 'garden', 'news', 'health', 'stories']);
  assert.deepEqual(c.news.map((n) => n.id), ['espreso', 'pravda', 'suspilne']);
  assert.equal(c.weather.city, 'Рудки');
  assert.deepEqual([c.weather.lat, c.weather.lon], [49.653, 23.487]);
  assert.ok(c.topics[0].items.includes('борщ український'));
  assert.equal(c.topics[1].prefix, 'город');
  assert.equal(c.hideShortsComments, true);
  assert.deepEqual(normalizeConfig(null), defaultConfig());
});

test('migration of missing fields', () => {
  const c = normalizeConfig({
    schedule: [{ name: 'X', type: 'youtube-video', url: 'https://www.youtube.com/watch?v=abc', time: '9:5' }, 'junk', null],
    topics: [{ title: 'Т' }],
    hideShortsComments: false,
  });
  assert.equal(c.schedule.length, 1);
  const s = c.schedule[0];
  assert.ok(s.id);
  assert.equal(s.warnMinutes, 3);
  assert.equal(s.enabled, true);
  assert.deepEqual(s.days, [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(s.time, '09:05');
  assert.equal(c.topics[0].items.length, 0);
  assert.equal(c.hideShortsComments, false);
  assert.equal(c.fullscreenOnStream, true);
});

test('normalizeEntry cleans values', () => {
  const s = normalizeEntry({ id: 'q', name: ' A ', type: 'weird', days: [1, 1, 9, 'x', 2], warnMinutes: '5', enabled: false, time: '07:30' });
  assert.equal(s.type, 'youtube-channel');
  assert.deepEqual(s.days, [1, 2]);
  assert.equal(s.warnMinutes, 5);
  assert.equal(s.enabled, false);
});

test('validateEntry returns Ukrainian errors', () => {
  assert.deepEqual(validateEntry({ name: 'A', type: 'youtube-video', url: 'https://www.youtube.com/watch?v=x', time: '10:00', days: [1], warnMinutes: 3 }), []);
  const errs = validateEntry({ name: '', type: 'youtube-channel', url: 'abc', keywords: '', time: '99:00', days: [], warnMinutes: -1 });
  assert.ok(errs.length >= 5);
  for (const m of errs) assert.match(m, /[а-яіїєґ]/i);
});

test('date and time formatting', () => {
  const d = new Date(2026, 10, 1, 7, 5);
  assert.equal(formatTime(d), '07:05');
  assert.equal(formatDateUk(d), 'неділя, 1 листопада 2026');
});

test('weather: the old default Львів becomes Рудки once; a chosen town stays', () => {
  const old = { city: 'Львів', lat: 49.838, lon: 24.023, enabled: false };
  assert.deepEqual(migrateWeather(old, 3), { city: 'Рудки', lat: 49.653, lon: 23.487, enabled: false });
  assert.equal(old.city, 'Львів'); // input not mutated
  assert.equal(migrateWeather(old, 4), null); // already migrated: the grandson may have chosen Львів since
  assert.equal(migrateWeather({ city: 'Тернопіль', lat: 49.553, lon: 25.594 }, 3), null);
  assert.equal(migrateWeather(undefined, 1), null); // fresh install: the default is already Рудки
});
