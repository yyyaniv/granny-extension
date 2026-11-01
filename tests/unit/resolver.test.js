import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStreamsHtml } from '../../src/lib/youtube-parse.js';
import { pickStream, parseDatesFromTitle, normalizeText, splitKeywords, localDateKey } from '../../src/lib/resolver.js';
import { resolveChannel, streamsUrl } from '../../src/lib/resolve-channel.js';

const html = readFileSync(new URL('../fixtures/ugcctv-streams.html', import.meta.url), 'utf8');
const items = parseStreamsHtml(html);
const id = (r) => (r ? r.videoId : null);

test('date parsing', () => {
  assert.deepEqual(parseDatesFromTitle('Молебень 2.11.2026'), ['2026-11-02']);
  assert.deepEqual(parseDatesFromTitle('ВЕРВИЦЯ, 03.11.2026'), ['2026-11-03']);
  assert.deepEqual(parseDatesFromTitle('a 31.10.2026 b 1.11.2026'), ['2026-10-31', '2026-11-01']);
  assert.deepEqual(parseDatesFromTitle('без дати 45.13.2026'), []);
  assert.deepEqual(parseDatesFromTitle(''), []);
});

test('normalizing and keyword splitting', () => {
  assert.equal(normalizeText('  Вервиця   ЄДНАЄ '), 'вервиця єднає');
  assert.deepEqual(splitKeywords(' a ; b;; '), ['a', 'b']);
  assert.equal(localDateKey(new Date(2026, 10, 3, 23, 59)), '2026-11-03');
});

test('fixture: dated stream for today', () => {
  assert.equal(id(pickStream(items, 'ВЕРВИЦЯ ЄДНАЄ', '2026-11-03')), 'd7Wz-buLWGM');
  assert.equal(id(pickStream(items, 'ВЕРВИЦЯ ЄДНАЄ', '2026-11-02')), 'vbiJwLbtjHo');
  assert.equal(id(pickStream(items, 'ВЕРВИЦЯ ЄДНАЄ', '2026-11-05')), null);
  assert.equal(id(pickStream(items, 'ісусова молитва', '2026-11-01')), 'e6j7UjsQLy4');
  assert.equal(id(pickStream(items, 'молебень', new Date(2026, 10, 2))), '0v6LRYzZtL0');
});

test('fixture: live wins and is case-insensitive', () => {
  assert.equal(id(pickStream(items, 'пояснення святого письма', '2026-11-05')), 'IfAn8GBv5gc');
  assert.equal(id(pickStream(items, 'ПОЯСНЕННЯ  СВЯТОГО ПИСЬМА', '2026-11-01')), 'IfAn8GBv5gc');
});

test('two live matches: prefer today date, else first', () => {
  const live = [
    { videoId: 'L1', title: 'Молитва наживо 01.11.2026', isLive: true },
    { videoId: 'L2', title: 'Молитва наживо 03.11.2026', isLive: true },
  ];
  assert.equal(id(pickStream(live, 'молитва', '2026-11-03')), 'L2');
  assert.equal(id(pickStream(live, 'молитва', '2026-11-09')), 'L1');
});

test('live beats dated non-live', () => {
  const list = [
    { videoId: 'N', title: 'Молитва 03.11.2026', isLive: false },
    { videoId: 'L', title: 'Молитва наживо', isLive: true },
  ];
  assert.equal(id(pickStream(list, 'молитва', '2026-11-03')), 'L');
});

test('alternatives separated by ;', () => {
  assert.equal(id(pickStream(items, 'щось неіснуюче; ВЕРВИЦЯ ЄДНАЄ', '2026-11-03')), 'd7Wz-buLWGM');
  assert.equal(id(pickStream(items, 'нема;теж нема', '2026-11-03')), null);
});

test('empty items / no keywords', () => {
  assert.equal(pickStream([], 'a', '2026-11-03'), null);
  assert.equal(pickStream(null, 'a', '2026-11-03'), null);
  const live = [{ videoId: 'L', title: 'X', isLive: true }];
  assert.equal(id(pickStream(live, '', '2026-11-03')), 'L');
});

test('streamsUrl normalisation', () => {
  assert.equal(streamsUrl('https://www.youtube.com/@ugcctv'), 'https://www.youtube.com/@ugcctv/streams?hl=uk');
  assert.equal(streamsUrl('https://www.youtube.com/@ugcctv/live/'), 'https://www.youtube.com/@ugcctv/streams?hl=uk');
  assert.equal(streamsUrl('https://www.youtube.com/@ugcctv/streams'), 'https://www.youtube.com/@ugcctv/streams?hl=uk');
});

test('resolveChannel with fake fetch', async () => {
  const calls = [];
  const fakeFetch = async (u) => { calls.push(u); return { ok: true, text: async () => html }; };
  const r = await resolveChannel('https://www.youtube.com/@ugcctv', 'ВЕРВИЦЯ ЄДНАЄ', '2026-11-03', fakeFetch);
  assert.equal(r.status, 'found');
  assert.equal(r.item.videoId, 'd7Wz-buLWGM');
  assert.match(calls[0], /\/streams/);
  const none = await resolveChannel('https://www.youtube.com/@ugcctv', 'ВЕРВИЦЯ ЄДНАЄ', '2026-11-05', fakeFetch);
  assert.equal(none.status, 'none');
  const bad = await resolveChannel('https://www.youtube.com/@ugcctv', 'x', '2026-11-05', async () => ({ ok: false, status: 500 }));
  assert.equal(bad.status, 'error');
});
