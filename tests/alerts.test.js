import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketStore } from '../src/store.js';
import { AlertEngine, scoreNews } from '../src/alerts.js';

function makeSettings(overrides = {}) {
  return {
    data: {
      sensitivity: 'balanced',
      newsAlerts: true,
      priceAlerts: {},
      ...overrides,
    },
    get() { return this.data; },
  };
}

test('scoreNews classifies high, medium, low, and none', () => {
  assert.equal(scoreNews({ title: 'Exchange hacked, funds stolen' }).severity, 'high');
  assert.equal(scoreNews({ title: 'Fed inflation data due tomorrow' }).severity, 'medium');
  assert.equal(scoreNews({ title: 'Oil inventories rise' }).severity, 'low');
  assert.equal(scoreNews({ title: 'Local football results' }).severity, null);
});

test('price move alert fires and then respects cooldown', () => {
  const store = new MarketStore();
  const engine = new AlertEngine(store, makeSettings());
  const asset = store.getAsset('BTCUSDT');
  const now = Date.now();
  asset.series = [
    { t: now - 61_000, p: 100 },
    { t: now, p: 101 },
  ];
  asset.price = 101;
  asset.prevPrice = 100;
  engine.onTick(asset);

  const alerts = store.alerts.filter((a) => a.kind === 'price_move');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].assetId, 'BTCUSDT');
  assert.match(alerts[0].title, /قفزة/);
  assert.ok(alerts[0].data.pct > 0.5);

  engine.lastMoveEval.set('BTCUSDT', 0);
  asset.series.push({ t: now + 1000, p: 102 });
  engine.onTick(asset);
  assert.equal(store.alerts.filter((a) => a.kind === 'price_move').length, 1);
});

test('price threshold crossing creates a high alert', () => {
  const store = new MarketStore();
  const settings = makeSettings({ priceAlerts: { BTCUSDT: { above: 100 } } });
  const engine = new AlertEngine(store, settings);
  const asset = store.getAsset('BTCUSDT');
  const now = Date.now();
  asset.series = [{ t: now - 1000, p: 99.9 }, { t: now, p: 101 }];
  asset.prevPrice = 99.9;
  asset.price = 101;
  engine.onTick(asset);

  const alert = store.alerts.find((a) => a.kind === 'threshold');
  assert.ok(alert);
  assert.equal(alert.severity, 'high');
  assert.match(alert.title, /فوق/);
  assert.equal(alert.data.threshold, 100);
});

test('news alerts fire once per keyword window', () => {
  const store = new MarketStore();
  const engine = new AlertEngine(store, makeSettings());
  engine.onNews({
    id: 'n-1',
    title: 'SEC approves spot Bitcoin ETF',
    source: 'Test Wire',
    url: 'https://example.com/n1',
    cls: 'crypto',
  });
  const newsAlerts = store.alerts.filter((a) => a.kind === 'news');
  assert.equal(newsAlerts.length, 1);
  assert.equal(newsAlerts[0].severity, 'high');

  engine.onNews({
    id: 'n-2',
    title: 'Another Bitcoin ETF approval reported',
    source: 'Test Wire',
    cls: 'crypto',
  });
  assert.equal(store.alerts.filter((a) => a.kind === 'news').length, 1);
});

test('news alerts can be disabled', () => {
  const store = new MarketStore();
  const engine = new AlertEngine(store, makeSettings({ newsAlerts: false }));
  engine.onNews({ id: 'n-3', title: 'Exchange hacked', source: 'Wire' });
  assert.equal(store.alerts.length, 0);
});
