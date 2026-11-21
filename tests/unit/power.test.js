import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLoe, parseLoeHtml, homeLine, mergeDays, fmtMin, dayKey, GROUPS } from '../../src/lib/power.js';
import { normalizeConfig, defaultConfig } from '../../src/lib/config.js';
import { PROVIDERS, DEFAULT_PROVIDER, providerFor } from '../../src/lib/power-providers.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/loe-menus.json', import.meta.url), 'utf8'));
// the live API (Nov 2026): a bare array, «Tomorrow» not announced yet, full picture in imageUrl
const live = JSON.parse(readFileSync(new URL('../fixtures/loe-menus-array.json', import.meta.url), 'utf8'));
const at = (h, m = 0) => new Date(2026, 10, 21, h, m);

test('fixture: Львівобленерго API -> today and tomorrow by date, archive skipped', () => {
  const days = parseLoe(fixture);
  assert.deepEqual(Object.keys(days).sort(), ['2026-11-21', '2026-11-22']);
  const today = days['2026-11-21'];
  assert.equal(today.updated, '07:20');
  assert.deepEqual(today.groups['2.2'], [[0, 30], [1080, 1290]]);
  assert.deepEqual(today.groups['1.1'], [[870, 1080], [1290, 1440]]);
  assert.deepEqual(Object.keys(today.groups).sort(), GROUPS);
  assert.deepEqual(days['2026-11-22'].groups['2.2'], []); // «Електроенергія є»
  assert.deepEqual(days['2026-11-22'].groups['2.1'], [[480, 720]]);
});

test('parseLoeHtml: no date or no groups -> null; bad ranges dropped', () => {
  assert.equal(parseLoeHtml(''), null);
  assert.equal(parseLoeHtml('<p>Група 2.2. Електроенергії немає з 10:00 до 12:00.</p>'), null);
  assert.equal(parseLoeHtml('<p>Графік погодинних відключень на 1.12.2026</p><p>Текст</p>'), null);
  const d = parseLoeHtml('<p>Графік погодинних відключень на 1.12.2026</p><p>Група 2.2. Електроенергії немає з 12:00 до 10:00, з 20:00 до 22:00.</p>');
  assert.equal(d.date, '2026-12-01');
  assert.deepEqual(d.groups['2.2'], [[1200, 1320]]);
});

test('homeLine: power on, later outages listed', () => {
  assert.deepEqual(homeLine([[0, 30], [1080, 1290]], null, at(14, 20)), { state: 'on', text: '💡 Світло є · сьогодні вимкнуть: 18:00–21:30' });
  assert.equal(homeLine([[870, 1080], [1290, 1440]], null, at(9)).text, '💡 Світло є · сьогодні вимкнуть: 14:30–18:00, 21:30–24:00');
});

test('homeLine: power off now, when it comes back and what is still ahead', () => {
  assert.deepEqual(homeLine([[870, 1080], [1290, 1440]], null, at(15)), { state: 'off', text: '🕯️ Світла немає до 18:00 · ще: 21:30–24:00' });
  // till midnight: tomorrow's first outage from 00:00 continues it
  assert.equal(homeLine([[1290, 1440]], [[0, 30]], at(22)).text, '🕯️ Світла немає до 00:30');
  assert.equal(homeLine([[1290, 1440]], [], at(22)).text, '🕯️ Світла немає до півночі');
  assert.equal(homeLine([[1080, 1290]], null, at(18, 0)).state, 'off'); // start minute counts as off
  assert.equal(homeLine([[1080, 1290]], null, at(21, 30)).state, 'on'); // end minute counts as on
});

test('homeLine: nothing more today, no outages, unknown', () => {
  assert.equal(homeLine([[0, 30]], null, at(22)).text, '💡 Світло є · сьогодні більше не вимикатимуть');
  assert.equal(homeLine([], null, at(10)).text, '💡 Сьогодні світло не вимикатимуть');
  assert.equal(homeLine(null, [], at(10)), null);
});

test('mergeDays keeps tomorrow fetched yesterday, drops past days, fresh wins', () => {
  const cached = { '2026-11-20': { a: 1 }, '2026-11-21': { a: 2 } };
  assert.deepEqual(mergeDays(cached, { '2026-11-21': { a: 3 } }, '2026-11-21'), { '2026-11-21': { a: 3 } });
  assert.deepEqual(mergeDays(cached, null, '2026-11-21'), { '2026-11-21': { a: 2 } });
  assert.deepEqual(mergeDays(undefined, undefined, '2026-11-21'), {});
});

test('helpers and config: group 2.2 on by default, bad group falls back', () => {
  assert.equal(fmtMin(0), '00:00');
  assert.equal(fmtMin(1440), '24:00');
  assert.equal(dayKey(at(1)), '2026-11-21');
  assert.deepEqual(defaultConfig().power, { enabled: true, provider: 'loe', group: '2.2' });
  assert.deepEqual(normalizeConfig({}).power, { enabled: true, provider: 'loe', group: '2.2' });
  // 1.7.0 configs have no provider -> Львівобленерго, group kept
  assert.deepEqual(normalizeConfig({ power: { enabled: false, group: '4.1' } }).power, { enabled: false, provider: 'loe', group: '4.1' });
  assert.deepEqual(normalizeConfig({ power: { group: '9.9' } }).power, { enabled: true, provider: 'loe', group: '2.2' });
  assert.deepEqual(normalizeConfig({ power: { provider: 'nope', group: '3.1' } }).power, { enabled: true, provider: 'loe', group: '3.1' });
});

test('live API shape: bare array parsed, picture URL made absolute, tomorrow missing', () => {
  const days = parseLoe(live);
  assert.deepEqual(Object.keys(days), ['2026-11-21']);
  const d = days['2026-11-21'];
  assert.equal(d.updated, '07:20');
  assert.deepEqual(d.groups['2.2'], [[0, 30], [1080, 1290]]);
  assert.deepEqual(Object.keys(d.groups).sort(), GROUPS);
  assert.equal(d.image, 'https://api.loe.lviv.ua/media/6b012a2ea3b1c_GPV.png');
  // the JSON-LD form has no imageUrl -> no picture
  assert.equal(parseLoe(fixture)['2026-11-21'].image, '');
});

test('parseLoe: odd input gives nothing; strange image paths are dropped', () => {
  assert.deepEqual(parseLoe(null), {});
  assert.deepEqual(parseLoe({}), {});
  assert.deepEqual(parseLoe([null, { menuItems: null }]), {});
  const one = (imageUrl) => parseLoe([{ menuItems: [{ name: 'Today', imageUrl, rawHtml: '<p>Графік погодинних відключень на 1.12.2026</p><p>Група 1.1. Електроенергія є.</p>' }] }])['2026-12-01'].image;
  assert.equal(one('/media/a_GPV.png'), 'https://api.loe.lviv.ua/media/a_GPV.png');
  assert.equal(one('javascript:alert(1)'), '');
  assert.equal(one('/media/../x.png'), '');
  assert.equal(one(''), '');
});

test('providers: every entry is complete, ids unique, default exists, load uses the given fetch', async () => {
  assert.equal(new Set(PROVIDERS.map((p) => p.id)).size, PROVIDERS.length);
  for (const p of PROVIDERS) {
    for (const k of ['id', 'name', 'region', 'site']) assert.ok(typeof p[k] === 'string' && p[k], `${p.id}.${k}`);
    assert.ok(Array.isArray(p.groups) && p.groups.length, `${p.id}.groups`);
    assert.equal(typeof p.load, 'function');
  }
  assert.equal(providerFor('???').id, DEFAULT_PROVIDER);
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, json: async () => live }; };
  const days = await providerFor('loe').load(fakeFetch);
  assert.match(calls[0], /^https:\/\/api\.loe\.lviv\.ua\/api\/menus/);
  assert.deepEqual(days['2026-11-21'].groups['2.2'], [[0, 30], [1080, 1290]]);
  await assert.rejects(providerFor('loe').load(async () => ({ ok: false, status: 503 })), /503/);
});
