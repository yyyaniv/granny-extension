import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLoe, parseLoeHtml, homeLine, mergeDays, fmtMin, dayKey, GROUPS } from '../../src/lib/power.js';
import { normalizeConfig, defaultConfig } from '../../src/lib/config.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/loe-menus.json', import.meta.url), 'utf8'));
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
  assert.deepEqual(defaultConfig().power, { enabled: true, group: '2.2' });
  assert.deepEqual(normalizeConfig({}).power, { enabled: true, group: '2.2' });
  assert.deepEqual(normalizeConfig({ power: { enabled: false, group: '4.1' } }).power, { enabled: false, group: '4.1' });
  assert.deepEqual(normalizeConfig({ power: { group: '9.9' } }).power, { enabled: true, group: '2.2' });
});
