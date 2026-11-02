import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateHistory, resumeSeconds, resumeUrl, formatPosition, HISTORY_MAX, updatePositions, positionFor } from '../../src/lib/history.js';
import { videoIdFromUrl, normalizeVideoUrl, cleanTabTitle, pickOtherBookmarksId, groupSaved, findVideoNodes } from '../../src/lib/saved.js';
import { compareVersions, shouldReloadNow } from '../../src/lib/update.js';
import { prevStart } from '../../src/lib/schedule.js';

const ID = 'dQw4w9WgXcQ';

test('updateHistory: dedupe moves to top, newest first', () => {
  let l = updateHistory([], { id: 'aaaaaaaaaaa', title: 'A', time: 100, duration: 1000 }, 1);
  l = updateHistory(l, { id: 'bbbbbbbbbbb', title: 'B', time: 50, duration: 500 }, 2);
  l = updateHistory(l, { id: 'aaaaaaaaaaa', title: 'A', time: 200, duration: 1000 }, 3);
  assert.deepEqual(l.map((x) => x.id), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  assert.equal(l[0].time, 200);
  assert.equal(l[0].updatedAt, 3);
});

test('updateHistory: caps at 30, floors time, keeps old title when new is empty', () => {
  let l = [];
  for (let i = 0; i < 40; i++) l = updateHistory(l, { id: String(i).padStart(11, 'x'), title: `T${i}`, time: 40.9 }, i);
  assert.equal(l.length, HISTORY_MAX);
  assert.equal(l[0].title, 'T39');
  assert.equal(l[0].time, 40);
  const l2 = updateHistory(l, { id: l[0].id, title: '', time: 70 }, 99);
  assert.equal(l2[0].title, 'T39');
  assert.equal(l2.length, HISTORY_MAX);
});

test('updateHistory: live has no time; fresh start does not wipe saved position; junk input', () => {
  const live = updateHistory([], { id: ID, title: 'L', live: true, time: 500 }, 1);
  assert.equal(live[0].time, undefined);
  let l = updateHistory([], { id: ID, title: 'V', time: 600, duration: 1200 }, 1);
  l = updateHistory(l, { id: ID, title: 'V', time: 1, duration: 1200 }, 2);
  assert.equal(l[0].time, 600);
  assert.deepEqual(updateHistory(null, null, 1), []);
});

test('resumeSeconds: short, finished and live handling', () => {
  assert.equal(resumeSeconds({ id: ID, time: 10, duration: 1000 }), 0);
  assert.equal(resumeSeconds({ id: ID, time: 29, duration: 1000 }), 0);
  assert.equal(resumeSeconds({ id: ID, time: 30, duration: 1000 }), 30);
  assert.equal(resumeSeconds({ id: ID, time: 754, duration: 1000 }), 754);
  assert.equal(resumeSeconds({ id: ID, time: 960, duration: 1000 }), 0); // >= 95%
  assert.equal(resumeSeconds({ id: ID, time: 975, duration: 1000 }), 0);
  assert.equal(resumeSeconds({ id: ID, time: 575, duration: 600 }), 0); // within last 30s
  assert.equal(resumeSeconds({ id: ID, time: 400 }), 400); // unknown duration
  assert.equal(resumeSeconds({ id: ID, time: 400, live: true }), 0);
  assert.equal(resumeSeconds(null), 0);
});

test('resumeUrl and formatPosition', () => {
  assert.equal(resumeUrl({ id: ID, time: 754, duration: 2000 }), `https://www.youtube.com/watch?v=${ID}&t=754s`);
  assert.equal(resumeUrl({ id: ID, time: 5 }), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(formatPosition(754), '12:34');
  assert.equal(formatPosition(3723), '1:02:03');
  assert.equal(formatPosition(5), '0:05');
});

test('videoIdFromUrl handles all YouTube URL shapes', () => {
  for (const u of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=30s&list=PL1`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
  ]) assert.equal(videoIdFromUrl(u), ID, u);
  for (const u of ['https://www.youtube.com/', 'https://www.youtube.com/watch?v=short', 'https://example.com/watch?v=' + ID,
    'https://www.youtube.com/@channel', 'not a url', '', null, undefined, 'https://evilyoutube.com/watch?v=' + ID]) {
    assert.equal(videoIdFromUrl(u), null, String(u));
  }
});

test('normalizeVideoUrl strips other params; cleanTabTitle', () => {
  assert.equal(normalizeVideoUrl(`https://youtu.be/${ID}?t=5`), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(normalizeVideoUrl(`https://www.youtube.com/watch?v=${ID}&list=x&t=9s`), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(normalizeVideoUrl('https://example.com'), null);
  assert.equal(cleanTabTitle('(3) Борщ - YouTube'), 'Борщ');
  assert.equal(cleanTabTitle(''), 'Відео');
});

test('pickOtherBookmarksId is robust', () => {
  assert.equal(pickOtherBookmarksId([{ id: '1' }, { id: '2' }, { id: '3' }]), '2');
  assert.equal(pickOtherBookmarksId([{ id: '1' }, { id: '7' }]), '7');
  assert.equal(pickOtherBookmarksId([{ id: '9' }, { id: '1' }]), '1');
  assert.equal(pickOtherBookmarksId([{ id: '1' }]), null);
  assert.equal(pickOtherBookmarksId([]), null);
});

const bm = (id, title, url, dateAdded, children) => ({ id, title, url, dateAdded, children });
const tree = bm('10', 'Бабусині відео', undefined, 0, [
  bm('11', 'Root old', `https://www.youtube.com/watch?v=${ID}`, 100),
  bm('12', 'Root new', 'https://www.youtube.com/watch?v=aaaaaaaaaaa', 300),
  bm('13', 'Молитви', undefined, 0, [
    bm('14', 'Prayer 1', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', 50),
    bm('15', 'Prayer 2', 'https://www.youtube.com/watch?v=ccccccccccc&t=3', 250),
    bm('16', 'Sub', undefined, 0, [bm('17', 'Deep', 'https://youtu.be/ddddddddddd', 10)]),
  ]),
  bm('18', 'Not a video', 'https://example.com/', 5),
]);

test('groupSaved: categories, uncategorized, newest first, ignores non-videos', () => {
  const g = groupSaved(tree);
  assert.deepEqual(g.uncategorized.map((x) => x.id), ['aaaaaaaaaaa', ID]);
  assert.equal(g.categories.length, 1);
  assert.equal(g.categories[0].title, 'Молитви');
  assert.deepEqual(g.categories[0].items.map((x) => x.id), ['ccccccccccc', 'bbbbbbbbbbb', 'ddddddddddd']);
  assert.deepEqual(groupSaved(null), { categories: [], uncategorized: [] });
});

test('findVideoNodes finds a video anywhere in the folder tree', () => {
  assert.deepEqual(findVideoNodes(tree, 'ddddddddddd').map((n) => n.id), ['17']);
  assert.equal(findVideoNodes(tree, ID).length, 1);
  assert.equal(findVideoNodes(tree, 'zzzzzzzzzzz').length, 0);
  assert.equal(findVideoNodes(null, ID).length, 0);
});

test('compareVersions', () => {
  assert.equal(compareVersions('1.1.0', '1.0.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.1.0'), -1);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.1', '1.1.0'), 0);
  assert.equal(compareVersions('2', '1.99.99'), 1);
  assert.equal(compareVersions('1.0.0.1', '1.0.0'), 1);
});

const at = (h, m) => new Date(2026, 5, 10, h, m, 0, 0).getTime(); // Wed 10 Jun 2026
const entry = (time, extra = {}) => ({ id: 'e', time, days: [0, 1, 2, 3, 4, 5, 6], warnMinutes: 3, enabled: true, ...extra });

test('prevStart finds the latest start before now', () => {
  assert.equal(prevStart(entry('18:00'), at(18, 2)), at(18, 0));
  assert.equal(prevStart(entry('18:00'), at(18, 0)), at(18, 0));
  assert.equal(prevStart(entry('18:00'), at(10, 0)), new Date(2026, 5, 9, 18, 0).getTime());
  assert.equal(prevStart(entry('18:00', { enabled: false }), at(10, 0)), null);
});

test('shouldReloadNow: only when disk is newer and schedule is quiet', () => {
  const base = { diskVersion: '1.1.0', runningVersion: '1.0.0', schedule: [entry('18:00')] };
  assert.equal(shouldReloadNow({ ...base, now: at(12, 0) }), true);
  assert.equal(shouldReloadNow({ ...base, now: at(12, 0), diskVersion: '1.0.0' }), false);
  assert.equal(shouldReloadNow({ ...base, now: at(12, 0), diskVersion: '0.9.0' }), false);
  assert.equal(shouldReloadNow({ ...base, now: at(12, 0), diskVersion: undefined }), false);
  assert.equal(shouldReloadNow({ ...base, now: at(17, 50) }), false); // start within 15 min
  assert.equal(shouldReloadNow({ ...base, now: at(17, 40) }), true); // warn at 17:57 is 17 min away
  assert.equal(shouldReloadNow({ ...base, now: at(17, 43) }), false); // warn at 17:57 is 14 min away
  assert.equal(shouldReloadNow({ ...base, now: at(18, 3) }), false); // just started
  assert.equal(shouldReloadNow({ ...base, now: at(18, 4) }), false); // < 5 minutes ago
  assert.equal(shouldReloadNow({ ...base, now: at(18, 6) }), true);
});

test('shouldReloadNow: warn window and disabled entries', () => {
  const longWarn = { diskVersion: '1.1.0', runningVersion: '1.0.0', schedule: [entry('18:00', { warnMinutes: 30 })] };
  assert.equal(shouldReloadNow({ ...longWarn, now: at(17, 40) }), false); // warn already fired
  assert.equal(shouldReloadNow({ ...longWarn, now: at(17, 20) }), false); // warn at 17:30 within 15 min
  assert.equal(shouldReloadNow({ ...longWarn, now: at(17, 10) }), true);
  assert.equal(shouldReloadNow({ ...longWarn, now: at(16, 0) }), true);
  const off = { diskVersion: '1.1.0', runningVersion: '1.0.0', schedule: [entry('18:00', { enabled: false })] };
  assert.equal(shouldReloadNow({ ...off, now: at(17, 55) }), true);
  assert.equal(shouldReloadNow({ diskVersion: '1.1.0', runningVersion: '1.0.0', schedule: [], now: at(12, 0) }), true);
});

test('updatePositions: survives the 30-item history cap; fresh start keeps the position; live ignored', () => {
  let h = [];
  let p = {};
  const add = (e, now) => { h = updateHistory(h, e, now); p = updatePositions(p, e, now); };
  add({ id: 'savedvideo1', title: 'S', time: 754, duration: 3600 }, 1);
  for (let i = 0; i < 40; i++) add({ id: String(i).padStart(11, 'z'), title: `T${i}`, time: 60, duration: 600 }, 10 + i);
  assert.equal(h.find((x) => x.id === 'savedvideo1'), undefined); // dropped out of history
  const pos = positionFor('savedvideo1', h, p);
  assert.equal(resumeSeconds(pos), 754);
  assert.equal(resumeUrl(pos), 'https://www.youtube.com/watch?v=savedvideo1&t=754s');
  add({ id: 'savedvideo1', title: 'S', time: 1, duration: 3600 }, 100); // reopened from the start
  assert.equal(p.savedvideo1.time, 754);
  assert.equal(updatePositions(p, { id: 'livevideo01', live: true, time: 5 }, 101), p);
  assert.equal(updatePositions(p, null, 101), p);
});

test('updatePositions: capped, newest kept; positionFor prefers the newer record', () => {
  let p = {};
  for (let i = 0; i < 6; i++) p = updatePositions(p, { id: `v${i}`, time: 100 + i }, i, 4);
  assert.deepEqual(Object.keys(p).sort(), ['v2', 'v3', 'v4', 'v5']);
  const h = [{ id: 'v5', time: 40, duration: 600, updatedAt: 1 }];
  assert.equal(positionFor('v5', h, { v5: { time: 300, duration: 600, updatedAt: 2 } }).time, 300);
  assert.equal(positionFor('v5', h, { v5: { time: 300, duration: 600, updatedAt: 0 } }).time, 40);
  assert.deepEqual(positionFor('nothing', null, null), { id: 'nothing' });
  assert.equal(resumeSeconds(positionFor('nothing', [], {})), 0);
});
