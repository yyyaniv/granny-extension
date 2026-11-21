// Where the outage schedule comes from: one entry per oblenergo (or an aggregator API covering several).
//
// A provider is a plain object:
//   id       stable key kept in config (never rename it: stored settings point at it)
//   name     shown to people: «Дані Львівобленерго»
//   region   shown in the settings list next to the name
//   site     the official page, linked from the settings
//   groups   every queue/group name the provider uses, in display order ("2.2", or "3" for single-number queues)
//   load     async (fetch) => { "YYYY-MM-DD": { updated: "07:20" | "", groups: { [group]: [[fromMin, toMin], ...] }, image: url | "" } }
//            Only today and later matter; a day missing from the result means "not announced yet".
//            A group with [] means "power stays on that day"; a group left out means "unknown".
//            `image` is the full official picture of the schedule (all groups); "" hides the «Увесь графік» button.
//            `fetch` is passed in so tests can stub it.
//
// To add one: write its parser next to parseLoe (pure, with a fixture test), add the entry below,
// and add its API host to manifest.json host_permissions when the store build narrows them.

import { LOE_URL, GROUPS as LOE_GROUPS, parseLoe } from './power.js';

async function getJson(fetchFn, url) {
  const res = await fetchFn(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const PROVIDERS = [
  {
    id: 'loe',
    name: 'Львівобленерго',
    region: 'Львівська область',
    site: 'https://poweron.loe.lviv.ua/',
    groups: LOE_GROUPS,
    load: async (fetchFn) => parseLoe(await getJson(fetchFn, LOE_URL)),
  },
  // Next providers go here once their API is known, e.g.
  // { id: 'example', name: '…обленерго', region: '… область', site: 'https://…', groups: [...], load: async (f) => parseExample(await getJson(f, URL)) },
];

export const DEFAULT_PROVIDER = 'loe';

/** Provider by id; unknown ids fall back to the default one. */
export function providerFor(id) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER);
}
