import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { linearPos, allowStep, pickIndex, scrollTargetFor, STEP_MS } from '../../src/lib/scroll.js';

test('linearPos is constant speed and clamped', () => {
  assert.equal(linearPos(0, 300, 0, 300), 0);
  assert.equal(linearPos(0, 300, 100, 300), 100);
  assert.equal(linearPos(0, 300, 200, 300), 200);
  assert.equal(linearPos(0, 300, 999, 300), 300);
  assert.equal(linearPos(500, 100, 150, 300), 300);
  assert.equal(linearPos(10, 50, 5, 0), 50);
});

test('allowStep throttles only auto-repeat to one step per interval', () => {
  assert.equal(allowStep(false, 10, 5), true);
  assert.equal(allowStep(true, 100, null), true);
  assert.equal(allowStep(true, 100, 0), false);
  assert.equal(allowStep(true, 299, 0), false);
  assert.equal(allowStep(true, 300, 0), true);
  // holding a key for 3s with ~30ms repeats yields about 10 steps, not 100
  let last = null; let steps = 0;
  for (let t = 0; t < 3000; t += 30) if (allowStep(true, t, last)) { last = t; steps++; }
  assert.ok(steps <= 3000 / STEP_MS + 1);
});

test('pickIndex chooses the next / previous target', () => {
  const tops = [0, 500, 1000, 1500];
  assert.equal(pickIndex(tops, 0, 1), 1);
  assert.equal(pickIndex(tops, 500, 1), 2);
  assert.equal(pickIndex(tops, 520, 1), 2);
  assert.equal(pickIndex(tops, 1500, 1), -1);
  assert.equal(pickIndex(tops, 1500, -1), 2);
  assert.equal(pickIndex(tops, 1200, -1), 2);
  assert.equal(pickIndex(tops, 0, -1), -1);
  assert.equal(pickIndex([], 0, 1), -1);
});

test('pickIndex honours the offset and works on unsorted tops', () => {
  const tops = [1056, 56, 556]; // posts under a 56px bar
  assert.equal(pickIndex(tops, 0, 1, 56), 2); // post at 56 sits at scroll 0 already: next is 556
  assert.equal(pickIndex(tops, 500, 1, 56), 0);
  assert.equal(pickIndex(tops, 1000, -1, 56), 2);
});

test('scrollTargetFor', () => {
  const base = { viewport: 800, scrollY: 1000, marginTop: 20, marginBottom: 20 };
  assert.equal(scrollTargetFor({ ...base, top: 100, bottom: 300 }), null);
  assert.equal(scrollTargetFor({ ...base, top: -50, bottom: 150 }), 930);
  assert.equal(scrollTargetFor({ ...base, top: 700, bottom: 900 }), 1120);
  assert.equal(scrollTargetFor({ ...base, top: 500, bottom: 700, block: 'center' }), 1200);
  assert.equal(scrollTargetFor({ ...base, scrollY: 10, top: -50, bottom: 150 }), 0);
});

test('classic content/scroll.js matches the module', () => {
  const ctx = { window: {}, cancelAnimationFrame() {}, requestAnimationFrame() {}, performance: { now: () => 0 }, document: {} };
  vm.runInNewContext(readFileSync(new URL('../../src/content/scroll.js', import.meta.url), 'utf8'), ctx);
  const g = ctx.window.GrannyScroll;
  assert.equal(g.STEP_MS, STEP_MS);
  for (const [f, t, e, d] of [[0, 300, 100, 300], [500, 100, 150, 300], [0, 10, 400, 300], [3, 9, -5, 300]]) assert.equal(g.linearPos(f, t, e, d), linearPos(f, t, e, d));
  for (const [r, n, l] of [[true, 100, null], [true, 100, 0], [true, 400, 0], [false, 1, 0]]) assert.equal(g.allowStep(r, n, l), allowStep(r, n, l));
  const tops = [1056, 56, 556, 2000];
  for (const y of [0, 56, 500, 1100, 3000]) for (const dir of [1, -1]) assert.equal(g.pickIndex(tops, y, dir, 56), pickIndex(tops, y, dir, 56));
  const a = { viewport: 800, scrollY: 1000, marginTop: 20, marginBottom: 20 };
  for (const rc of [{ top: 100, bottom: 300 }, { top: -50, bottom: 150 }, { top: 700, bottom: 900 }]) for (const block of ['nearest', 'center']) assert.equal(g.scrollTargetFor({ ...a, ...rc, block }), scrollTargetFor({ ...a, ...rc, block }));
});
