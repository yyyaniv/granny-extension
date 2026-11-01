import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractInitialData, parseStreamItems, parseStreamsHtml } from '../../src/lib/youtube-parse.js';

const html = readFileSync(new URL('../fixtures/ugcctv-streams.html', import.meta.url), 'utf8');

test('extractInitialData finds the JSON in the fixture', () => {
  const data = extractInitialData(html);
  assert.ok(data && typeof data === 'object');
});

test('extractInitialData handles braces and ;</script> inside strings', () => {
  const page = '<script>var ytInitialData = {"a":"x;</script>{","b":[1,{"c":"}"}]};</script><script>var z=1;</script>';
  assert.deepEqual(extractInitialData(page), { a: 'x;</script>{', b: [1, { c: '}' }] });
});

test('extractInitialData returns null for garbage', () => {
  assert.equal(extractInitialData('<html></html>'), null);
  assert.equal(extractInitialData(null), null);
  assert.equal(extractInitialData('var ytInitialData = {broken'), null);
});

test('fixture: live and non-live items', () => {
  const items = parseStreamsHtml(html);
  const by = (id) => items.find((i) => i.videoId === id);
  assert.equal(by('IfAn8GBv5gc').isLive, true);
  assert.equal(by('MTgtJGwgKEI').isLive, true);
  assert.equal(by('Bcp9VNIW4ss').isLive, true);
  const d = by('d7Wz-buLWGM');
  assert.equal(d.isLive, false);
  assert.equal(d.title, 'ВЕРВИЦЯ ЄДНАЄ | Молитва на вервиці у прямому ефірі, 03.11.2026');
  assert.equal(by('e6j7UjsQLy4').isLive, false);
  assert.ok(items.length >= 20);
  assert.equal(new Set(items.map((i) => i.videoId)).size, items.length);
});

test('older renderer shapes are supported', () => {
  const data = {
    contents: [
      { gridVideoRenderer: { videoId: 'AAA', title: { runs: [{ text: 'Hello ' }, { text: 'world' }] },
        thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] } },
      { videoRenderer: { videoId: 'BBB', title: { simpleText: 'Soon' }, upcomingEventData: { startTime: '1' } } },
      { videoRenderer: { videoId: 'CCC', title: { simpleText: 'Old' },
        badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW' } }] } },
    ],
  };
  const items = parseStreamItems(data);
  assert.deepEqual(items.map((i) => [i.videoId, i.title, i.isLive, i.isUpcoming]), [
    ['AAA', 'Hello world', true, false],
    ['BBB', 'Soon', false, true],
    ['CCC', 'Old', true, false],
  ]);
});
