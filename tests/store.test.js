import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketStore, normalizeTitle, downsample } from '../src/store.js';

test('normalizeTitle ignores punctuation and case', () => {
  assert.equal(normalizeTitle('Bitcoin  Jumps 5%!'), normalizeTitle('bitcoin jumps 5'));
});

test('applyTick updates price, change, and series', () => {
  const store = new MarketStore();
  const now = Date.now();
  const tick = store.applyTick('BTCUSDT', 100, now, { changePct: 2.5, high: 101, low: 99 });
  assert.equal(tick.price, 100);
  const asset = store.getAsset('BTCUSDT');
  assert.equal(asset.price, 100);
  assert.equal(asset.changePct, 2.5);
  assert.equal(asset.series.length, 1);
  assert.equal(asset.dayHigh, 101);
  assert.equal(asset.dayLow, 99);
});

test('addNews deduplicates titles and caps the feed', () => {
  const store = new MarketStore();
  const first = store.addNews([
    { title: 'Bitcoin jumps', source: 'A', ts: 2 },
    { title: 'Bitcoin jumps!', source: 'B', ts: 3 },
    { title: 'Gold falls', source: 'C', ts: 1 },
  ]);
  assert.equal(first.length, 2);
  assert.equal(store.news.length, 2);
  const second = store.addNews([{ title: 'BITCOIN JUMPS', source: 'D' }]);
  assert.equal(second.length, 0);
  assert.equal(store.news[0].title, 'Bitcoin jumps');
});

test('seedSeries merges points and sorts by time', () => {
  const store = new MarketStore();
  const now = Date.now();
  store.seedSeries('ETHUSDT', [
    { t: now - 1000, p: 3 },
    { t: now - 3000, p: 1 },
    { t: now - 2000, p: 2 },
  ]);
  const asset = store.getAsset('ETHUSDT');
  assert.deepEqual(asset.series.map((p) => p.p), [1, 2, 3]);
});

test('downsample preserves first and last and respects limit', () => {
  const points = Array.from({ length: 1000 }, (_, i) => ({ t: i, p: i }));
  const out = downsample(points, 100);
  assert.equal(out.length, 100);
  assert.equal(out[0].t, 0);
  assert.equal(out[out.length - 1].t, 999);
});
