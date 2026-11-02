import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRandom } from '../../src/lib/pick.js';
import { defaultTopics, migrateConfig, CONFIG_VERSION } from '../../src/lib/config.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('pickRandom: n distinct items from the pool', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let k = 0; k < 20; k++) {
    const r = pickRandom(pool, 5);
    assert.equal(r.length, 5);
    assert.equal(new Set(r).size, 5);
    assert.ok(r.every((x) => pool.includes(x)));
  }
});

test('pickRandom: deterministic with injected rng, input untouched', () => {
  const pool = ['a', 'b', 'c', 'd'];
  const r1 = pickRandom(pool, 3, seq(0, 0, 0));
  const r2 = pickRandom(pool, 3, seq(0, 0, 0));
  assert.deepEqual(r1, r2);
  assert.deepEqual(pool, ['a', 'b', 'c', 'd']);
});

test('pickRandom: avoids excluded items while the pool allows', () => {
  const pool = Array.from({ length: 12 }, (_, i) => `x${i}`);
  const first = pickRandom(pool, 5);
  for (let k = 0; k < 20; k++) {
    const next = pickRandom(pool, 5, Math.random, first);
    assert.ok(next.every((x) => !first.includes(x)));
  }
});

test('pickRandom: falls back to excluded items when pool is small; dedupes; handles junk', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
  const r = pickRandom(pool, 5, Math.random, ['a', 'b', 'c', 'd']);
  assert.equal(r.length, 5);
  assert.ok(r.includes('e') && r.includes('f'));
  assert.equal(new Set(r).size, 5);
  assert.deepEqual(pickRandom(['a', 'a', 'b'], 5).sort(), ['a', 'b']);
  assert.deepEqual(pickRandom(null, 5), []);
  assert.deepEqual(pickRandom(['a'], 0), []);
});

const OLD = [
  { id: 'recipes', icon: '🍲', title: 'Рецепти', prefix: 'рецепт', items: ['борщ', 'вареники', 'голубці', 'соління', 'випічка'] },
  { id: 'garden', icon: '🍅', title: 'Город', prefix: 'город', items: ['помідори', 'огірки', 'картопля', 'розсада', 'шкідники'] },
  { id: 'health', icon: '💊', title: "Здоров'я", prefix: "здоров'я", items: ['тиск', 'суглоби', 'народні засоби'] },
];

test('default topics: 5 topics, big pools, stories and news have empty prefix', () => {
  const t = defaultTopics();
  assert.deepEqual(t.map((x) => x.id), ['recipes', 'garden', 'news', 'health', 'stories']);
  for (const x of t) {
    assert.ok(x.items.length >= 15 && x.items.length <= 25, `${x.id}: ${x.items.length}`);
    assert.equal(new Set(x.items).size, x.items.length);
  }
  assert.equal(t[4].prefix, '');
  assert.equal(t[4].icon, '📖');
  assert.equal(t[4].title, 'Історії');
  assert.equal(t[2].prefix, '');
  assert.equal(t[2].title, 'Новини');
  assert.ok(['Еспресо', 'Суспільне', 'Українська правда'].every((n) => t[2].items.some((i) => i.includes(n))));
});

test('default topics fit the 8192-byte chrome.storage.sync item quota', () => {
  const bytes = Buffer.byteLength(JSON.stringify(defaultTopics()), 'utf8');
  assert.ok(bytes < 7000, `cfg_topics is ${bytes} bytes`);
  assert.ok(Buffer.byteLength('cfg_topics' + JSON.stringify(defaultTopics()), 'utf8') < 7000);
});

test('migrate: old defaults upgraded, news after garden, stories appended', () => {
  const { config, version, changed } = migrateConfig({ topics: OLD }, 1);
  const fresh = defaultTopics();
  assert.equal(version, CONFIG_VERSION);
  assert.equal(changed, true);
  assert.deepEqual(config.topics.map((t) => t.id), ['recipes', 'garden', 'news', 'health', 'stories']);
  for (const id of ['recipes', 'garden', 'health']) {
    assert.deepEqual(config.topics.find((t) => t.id === id).items, fresh.find((t) => t.id === id).items);
  }
  assert.equal(config.topics[0].title, 'Рецепти');
});

test('migrate: customised topics untouched, stories still appended', () => {
  const custom = [
    { ...OLD[0], items: ['борщ', 'вареники', 'голубці', 'соління', 'випічка', 'мій рецепт'] },
    { ...OLD[1], items: ['помідори'] },
    OLD[2],
    { id: 'own', icon: '🎵', title: 'Музика', prefix: '', items: ['пісні'] },
  ];
  const { config } = migrateConfig({ topics: custom }, 1);
  assert.deepEqual(config.topics[0], custom[0]);
  assert.deepEqual(config.topics[1], custom[1]);
  assert.equal(config.topics[2].id, 'news');
  assert.deepEqual(config.topics[4], custom[3]);
  assert.deepEqual(config.topics[3].items, defaultTopics().find((t) => t.id === 'health').items);
  assert.equal(config.topics.filter((t) => t.id === 'stories').length, 1);
  assert.equal(config.topics.length, 6);
});

test('migrate from 2: news added once, a deleted stories topic stays deleted', () => {
  const v2 = defaultTopics().filter((t) => t.id !== 'news' && t.id !== 'stories');
  const { config, changed } = migrateConfig({ topics: v2 }, 2);
  assert.equal(changed, true);
  assert.deepEqual(config.topics.map((t) => t.id), ['recipes', 'garden', 'news', 'health']);
  const noGarden = migrateConfig({ topics: [v2[0]] }, 2).config.topics;
  assert.deepEqual(noGarden.map((t) => t.id), ['recipes', 'news']);
  const mine = { id: 'news', icon: '📰', title: 'Мої новини', prefix: '', items: ['x'] };
  const kept = migrateConfig({ topics: [...v2, mine] }, 2);
  assert.equal(kept.changed, false);
  assert.deepEqual(kept.config.topics.filter((t) => t.id === 'news'), [mine]);
});

test('migrate: existing stories topic is kept as is', () => {
  const mine = { id: 'stories', icon: '📚', title: 'Мої історії', prefix: 'x', items: ['a'] };
  const { config } = migrateConfig({ topics: [...OLD, mine] }, 1);
  assert.deepEqual(config.topics.filter((t) => t.id === 'stories'), [mine]);
});

test('migrate: idempotent, no-op on new version, input not mutated, fresh install untouched', () => {
  const input = { topics: OLD };
  const snapshot = JSON.stringify(input);
  const once = migrateConfig(input, 1);
  assert.equal(JSON.stringify(input), snapshot);
  const twice = migrateConfig(once.config, 1);
  assert.deepEqual(twice.config, once.config);
  assert.equal(twice.changed, false);
  const again = migrateConfig(once.config, CONFIG_VERSION);
  assert.equal(again.changed, false);
  assert.deepEqual(again.config, once.config);
  const fresh = migrateConfig({}, undefined);
  assert.equal(fresh.changed, false);
  assert.equal(fresh.config.topics, undefined);
  assert.equal(fresh.version, CONFIG_VERSION);
});
