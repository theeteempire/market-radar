import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

test('HTTP API, static files, settings, alerts, and SSE', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-radar-test-'));
  const app = createApp({ dataDir, startProviders: false });
  const info = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${info.port}`;
  t.after(async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.counts.assets, 24);
  assert.equal(health.app.version, '1.1.0');
  assert.equal(health.providers.translation.enabled, true);

  const snapshot = await fetch(`${base}/api/snapshot`).then((r) => r.json());
  assert.equal(snapshot.assets.length, 24);
  assert.ok(Array.isArray(snapshot.news));
  assert.ok(Array.isArray(snapshot.alerts));
  assert.equal(snapshot.settings.sensitivity, 'balanced');
  assert.equal(snapshot.x.enabled, false);
  assert.equal(snapshot.classes.tech.short, 'تقنية');
  assert.ok(snapshot.translation && snapshot.images && snapshot.pipeline);
  assert.equal(snapshot.assets.filter((a) => a.cls === 'tech').length, 12);

  const index = await fetch(`${base}/`).then((r) => r.text());
  assert.match(index, /رادار السوق/);
  assert.match(index, /chart\.umd\.min\.js/);
  assert.match(index, /breakingPanel/);

  const manifest = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /manifest\+json/);

  const newsApi = await fetch(`${base}/api/news?breaking=1&limit=5`).then((r) => r.json());
  assert.ok(Array.isArray(newsApi.items));
  assert.ok(newsApi.items.every((n) => n.breaking));

  const chart = await fetch(`${base}/vendor/chart.umd.min.js`);
  assert.equal(chart.status, 200);
  assert.ok((await chart.text()).length > 100000);

  const traversal = await fetch(`${base}/..%2Fserver.js`);
  assert.equal(traversal.status, 403);

  const series = await fetch(`${base}/api/series?id=BTCUSDT&range=300`).then((r) => r.json());
  assert.equal(series.id, 'BTCUSDT');
  assert.ok(Array.isArray(series.series));

  const updated = await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sensitivity: 'sensitive',
      newsAlerts: false,
      priceAlerts: { BTCUSDT: { above: 90000 } },
    }),
  }).then((r) => r.json());
  assert.equal(updated.sensitivity, 'sensitive');
  assert.equal(updated.newsAlerts, false);
  assert.equal(updated.priceAlerts.BTCUSDT.above, 90000);

  const testAlert = await fetch(`${base}/api/alerts/test`, { method: 'POST' }).then((r) => r.json());
  assert.equal(testAlert.ok, true);
  assert.equal(testAlert.alert.severity, 'high');

  const alerts = await fetch(`${base}/api/alerts?limit=5`).then((r) => r.json());
  assert.equal(alerts.total, 1);
  assert.match(alerts.items[0].title, /تنبيه تجريبي/);

  const controller = new AbortController();
  const sse = await fetch(`${base}/api/stream`, { signal: controller.signal });
  assert.equal(sse.status, 200);
  assert.match(sse.headers.get('content-type'), /text\/event-stream/);
  const reader = sse.body.getReader();
  let text = '';
  const deadline = Date.now() + 4000;
  while (!text.includes('event: snapshot') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += Buffer.from(value).toString('utf8');
  }
  controller.abort();
  assert.match(text, /event: snapshot/);
  assert.match(text, /"assets"/);
});
