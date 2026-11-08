import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { commitmentPreimage, itemToken, parseItemToken, makeRng, rollBag, publicManifest, publicEstimate, terminalEV, openingBid, increment } from '../shared/rules.ts';
import { ITEMS, ITEM_BY_ID } from '../shared/catalog.ts';
import { simulateWeek } from '../shared/sim.ts';

test('preimage matches the contract format byte for byte', () => {
  // Same case as contract/src/tests.rs preimage_format_is_stable
  const items = [parseItemToken('vinyl@worn:p'), parseItemToken('rubber-duck@good:v')];
  assert.equal(
    commitmentPreimage('finalcall.testnet', 3, 1, items, 'abcd'),
    'final-call/v1|finalcall.testnet|lot=3|tier=1|items=vinyl@worn:p,rubber-duck@good:v|salt=abcd',
  );
});

test('item tokens round-trip', () => {
  for (const tok of ['gold-bar@mint:p', 'paperback@worn:v']) assert.equal(itemToken(parseItemToken(tok)), tok);
  assert.throws(() => parseItemToken('Gold Bar@mint:p'));
});

test('every catalog item has art-free metadata the contract accepts', () => {
  for (const it of ITEMS) assert.match(it.id, /^[a-z0-9-]{1,32}$/);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
});

test('bags have 6-10 items, 3-4 pouches, and the tutorial bag shows a rare', () => {
  const rng = makeRng(1);
  for (let i = 0; i < 300; i++) {
    const tier = i % 3;
    const bag = rollBag(rng, tier, { tutorial: i % 10 === 0 });
    assert.ok(bag.length >= 6 && bag.length <= 10);
    const pouches = bag.filter((b) => b.pouch).length;
    assert.ok(pouches >= 3 && pouches <= 4);
    if (i % 10 === 0) assert.ok(!bag[0].pouch && ITEM_BY_ID[bag[0].id].level === tier + 2);
  }
});

test('the X-ray manifest never names what is inside a pouch', () => {
  const rng = makeRng(2);
  const bag = rollBag(rng, 1);
  for (const m of publicManifest(bag, 1, rng)) if (m.pouch) assert.equal(m.id, undefined);
});

test('estimates and opening bids are sane per terminal', () => {
  for (const t of [0, 1, 2]) {
    assert.ok(openingBid(t) < terminalEV(t));
    assert.ok(openingBid(t) % increment(openingBid(t)) === 0);
  }
  const rng = makeRng(3);
  const bag = rollBag(rng, 0);
  assert.ok(publicEstimate(publicManifest(bag, 0, rng), 0) > 0);
});

test('a simulated week runs and moves the economy', () => {
  const r = simulateWeek(5);
  assert.ok(r.lots > 500);
  assert.ok(r.bidders.some((b) => b.history.at(-1)! !== b.history[0]));
  for (const v of Object.values(r.demand)) assert.ok(Math.min(...v) >= 4000);
});

test('sha256 of the preimage is a 64-char lowercase hex tag', () => {
  const h = createHash('sha256').update(commitmentPreimage('x.testnet', 1, 0, [parseItemToken('vinyl@good:v')], 'ff')).digest('hex');
  assert.match(h, /^[0-9a-f]{64}$/);
});
