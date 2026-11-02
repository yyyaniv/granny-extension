import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easter, julianShift, feastsOfYear, feastNotice, feastLine, fastOn } from '../../src/lib/church.js';
import { positions, moonDay, elongation, monthCalendar, formatDays, rateDay } from '../../src/lib/moon.js';

const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('Orthodox Easter (civil dates)', () => {
  assert.equal(julianShift(2026), 13);
  for (const [y, d] of [[2023, '2023-04-16'], [2024, '2024-05-05'], [2025, '2025-04-20'], [2026, '2026-04-12'], [2027, '2027-05-02']]) {
    assert.equal(day(easter(y)), d, String(y));
  }
});

test('feasts: new style vs old style, movable ones from Easter', () => {
  const find = (list, name) => list.filter((f) => f.name.startsWith(name)).map((f) => day(f.date));
  const n = feastsOfYear(2026, 'new');
  const o = feastsOfYear(2026, 'old');
  assert.deepEqual(find(n, 'Покрова'), ['2026-10-01']);
  assert.deepEqual(find(o, 'Покрова'), ['2026-10-14']);
  assert.deepEqual(find(n, 'Різдво Христове'), ['2026-12-25']);
  assert.deepEqual(find(o, 'Різдво Христове'), ['2026-01-07']); // Julian 25 Dec 2025
  assert.deepEqual(find(o, 'Святого Миколая'), ['2026-12-19']);
  assert.deepEqual(find(n, 'Зіслання Святого Духа'), ['2026-05-31']);
  assert.deepEqual(find(n, 'Вхід Господній'), ['2026-04-05']);
  assert.deepEqual(find(n, 'Святого священномученика Йосафата'), ['2026-11-12']); // UGCC
  assert.deepEqual(find(n, 'Свято Пресвятої Євхаристії'), ['2026-06-11']); // UGCC, Thursday after All Saints
  assert.deepEqual(find(o, 'Воскресіння'), find(n, 'Воскресіння'));
});

test('feastNotice: today, upcoming within 3 days, off, year boundary', () => {
  assert.deepEqual(feastNotice(new Date(2026, 9, 1, 9), 'new'), { names: ['Покрова Пресвятої Богородиці'], days: 0 });
  assert.deepEqual(feastNotice(new Date(2026, 11, 4, 20), 'new'), { names: ['Святого Миколая Чудотворця'], days: 2 });
  assert.equal(feastNotice(new Date(2026, 9, 20), 'new'), null);
  assert.equal(feastNotice(new Date(2026, 9, 1), 'off'), null);
  assert.equal(feastNotice(new Date(2026, 11, 30), 'new').days, 2); // 1 Jan next year
  assert.deepEqual(feastNotice(new Date(2027, 0, 6), 'old'), { names: ['Святвечір'], days: 0 });
  assert.equal(feastLine({ names: ['Святого Миколая'], days: 2 }), '🕯 Через 2 дні: Святого Миколая');
  assert.equal(feastLine({ names: ['Великдень'], days: 0 }), '🕯 Сьогодні: Великдень');
  assert.equal(feastLine(null), '');
});

test('UGCC fasts (new style; old style +13 days)', () => {
  const f = (y, m, d, s = 'new') => fastOn(new Date(y, m - 1, d, 9), s);
  assert.equal(f(2026, 2, 22), null);
  assert.equal(f(2026, 2, 23), 'Великий піст'); // Easter 12 Apr - 48
  assert.equal(f(2026, 4, 11), 'Великий піст');
  assert.equal(f(2026, 4, 12), null);
  assert.equal(f(2026, 6, 7), null);
  assert.equal(f(2026, 6, 8), 'Петрів піст'); // Monday after All Saints
  assert.equal(f(2026, 6, 28), 'Петрів піст');
  assert.equal(f(2026, 6, 29), null);
  assert.equal(f(2026, 8, 14), 'Успенський піст');
  assert.equal(f(2026, 8, 15), null);
  assert.equal(f(2026, 11, 14), null);
  assert.equal(f(2026, 11, 15), 'Різдвяний піст (Пилипівка)');
  assert.equal(f(2026, 12, 24), 'Різдвяний піст (Пилипівка)');
  assert.equal(f(2026, 12, 25), null);
  assert.match(f(2027, 1, 5), /^Строгий піст/);
  assert.equal(f(2027, 1, 6, 'old'), 'Різдвяний піст (Пилипівка)'); // old style: 28 Nov – 6 Jan
  assert.equal(f(2027, 1, 7, 'old'), null);
  assert.equal(f(2026, 11, 20, 'off'), null);
  assert.equal(f(2027, 6, 1), null); // Easter 2 May 2027: Петрів піст starts 28 June
  assert.equal(f(2027, 6, 28), 'Петрів піст');
});

test('moon: phases match known new/full moons, sign of a known full moon', () => {
  // full moon 13 Jan 2025 22:27 UTC at ~24° Cancer; new moon 29 Jan 2025 12:36 UTC; full 12 Feb 2025 13:53 UTC
  const full = positions(new Date(Date.UTC(2025, 0, 13, 22, 27)));
  assert.ok(Math.abs(elongation(new Date(Date.UTC(2025, 0, 13, 22, 27))) - 180) < 1.5);
  assert.equal(Math.floor(full.moon / 30), 3); // Рак
  assert.ok(elongation(new Date(Date.UTC(2025, 0, 29, 12, 36))) < 1.5 || elongation(new Date(Date.UTC(2025, 0, 29, 12, 36))) > 358.5);
  assert.equal(moonDay(new Date(2025, 0, 29, 12)).phase, 'new');
  assert.equal(moonDay(new Date(2025, 1, 12, 12)).phase, 'full');
  assert.equal(moonDay(new Date(2025, 1, 5, 12)).phase, 'waxing');
  assert.equal(moonDay(new Date(2025, 1, 20, 12)).phase, 'waning');
  // exactly one new and one full moon day per ~29.5 days
  const phases = Array.from({ length: 59 }, (_, i) => moonDay(new Date(2025, 2, 1 + i, 12)).phase);
  assert.equal(phases.filter((p) => p === 'new').length, 2);
  assert.equal(phases.filter((p) => p === 'full').length, 2);
});

test('sowing calendar: November 2026 like the printed calendars (vikna.tv)', () => {
  const c = monthCalendar(2026, 10);
  // published: favourable 6, 7, 11–14, 18, 19, 22, 23, 27, 28; unfavourable 8–10, 15–17, 24.
  // 22 Nov: the Moon enters Taurus around midday, so that one day may differ.
  assert.equal(formatDays(c.bad), '8–10, 15–17, 24');
  assert.equal(formatDays(c.good), '6, 7, 11–14, 18, 19, 23, 27, 28');
  assert.deepEqual(c.phases.new, [9]);
  assert.deepEqual(c.phases.full, [24]);
  assert.equal(formatDays(c.crops.find((x) => x.id === 'greens').days), '6, 7, 11–14, 18–23, 27, 28'); // = published «кріп, петрушка»
  assert.equal(formatDays(c.crops.find((x) => x.id === 'roots').days), '6, 7, 27, 28');
  assert.equal(rateDay(new Date(2026, 10, 9, 8)).rating, 'bad');
});

test('formatDays: runs of 3+ as ranges', () => {
  assert.equal(formatDays([1, 2, 4, 5, 6, 9]), '1, 2, 4–6, 9');
  assert.equal(formatDays([]), '');
});
