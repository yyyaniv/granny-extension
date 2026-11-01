import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStart, nextOccurrences, currentWindows, nextStartToday, todaysEntries, parseTime } from '../../src/lib/schedule.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
const e = (o) => ({ id: 'e', name: 'Вервиця', time: '18:00', days: ALL, warnMinutes: 3, enabled: true, ...o });
const at = (d, h = 0, m = 0) => new Date(2026, 10, d, h, m, 0, 0).getTime(); // November 2026; 1 Nov = Sunday

test('parseTime', () => {
  assert.deepEqual(parseTime('8:05'), { h: 8, min: 5 });
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('abc'), null);
});

test('warn and start for later today', () => {
  const ev = nextOccurrences([e()], at(1, 12, 0));
  assert.deepEqual(ev.map((x) => [x.kind, x.time]), [['warn', at(1, 17, 57)], ['start', at(1, 18, 0)]]);
  assert.equal(ev[0].startTime, at(1, 18, 0));
});

test('time passed today -> tomorrow', () => {
  const ev = nextOccurrences([e()], at(1, 19, 0));
  assert.equal(ev[1].time, at(2, 18, 0));
  assert.equal(ev[0].time, at(2, 17, 57));
});

test('days of week respected (Sun=0, Mon=1)', () => {
  // 1 Nov 2026 is Sunday; only Wednesday(3) -> 4 Nov
  assert.equal(nextStart(e({ days: [3] }), at(1, 10, 0)), at(4, 18, 0));
  // only Sunday, already passed -> next Sunday 8 Nov
  assert.equal(nextStart(e({ days: [0] }), at(1, 19, 0)), at(8, 18, 0));
});

test('disabled, empty days and bad time yield nothing', () => {
  assert.deepEqual(nextOccurrences([e({ enabled: false })], at(1, 10)), []);
  assert.deepEqual(nextOccurrences([e({ days: [] })], at(1, 10)), []);
  assert.deepEqual(nextOccurrences([e({ time: 'xx' })], at(1, 10)), []);
});

test('warn crossing midnight', () => {
  const ev = nextOccurrences([e({ time: '00:05', warnMinutes: 10, days: [1] })], at(1, 22, 0));
  // Monday 2 Nov 00:05, warn Sunday 1 Nov 23:55
  assert.deepEqual(ev.map((x) => [x.kind, x.time]), [['warn', at(1, 23, 55)], ['start', at(2, 0, 5)]]);
});

test('start exactly now is not "next"', () => {
  assert.equal(nextStart(e(), at(1, 18, 0)), at(2, 18, 0));
});

test('warnMinutes 0 gives only start; sorted across entries', () => {
  const ev = nextOccurrences([e({ id: 'a', time: '19:00', warnMinutes: 0 }), e({ id: 'b', time: '18:00' })], at(1, 10));
  assert.deepEqual(ev.map((x) => x.entryId + x.kind), ['bwarn', 'bstart', 'astart']);
});

test('warn already passed but start in future is omitted, window reported', () => {
  const now = at(1, 17, 58);
  const entries = [e()];
  assert.deepEqual(nextOccurrences(entries, now).map((x) => x.kind), ['start']);
  const w = currentWindows(entries, now);
  assert.equal(w.length, 1);
  assert.equal(w[0].startTime, at(1, 18, 0));
  assert.deepEqual(currentWindows(entries, at(1, 12)), []);
});

test('nextStartToday and todaysEntries', () => {
  const entries = [e({ id: 'a', time: '20:00' }), e({ id: 'b', time: '18:00' }), e({ id: 'c', time: '09:00' }), e({ id: 'd', time: '19:00', enabled: false })];
  const n = nextStartToday(entries, at(1, 10));
  assert.equal(n.entry.id, 'b');
  assert.equal(nextStartToday(entries, at(1, 21)), null);
  assert.deepEqual(todaysEntries(entries, at(1, 21)).map((x) => x.id), ['c', 'b', 'a']);
  assert.deepEqual(todaysEntries([e({ days: [3] })], at(1, 10)), []);
});
