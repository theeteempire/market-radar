import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketStore } from '../src/store.js';
import { NewsPipeline } from '../src/pipeline.js';

const waitFor = async (fn, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
};

function setup({ translatorEnabled = true, enricherEnabled = true } = {}) {
  const store = new MarketStore();
  const updates = [];
  store.on('news_update', (item) => updates.push(item));
  const translator = {
    enabled: translatorEnabled,
    async translate(text) {
      return { ok: true, text: `AR:${text}`, skipped: false, cached: false };
    },
  };
  const enricher = {
    enabled: enricherEnabled,
    async enrich() { return 'https://cdn.example.com/og.jpg'; },
  };
  const pipeline = new NewsPipeline(store, { translator, enricher, concurrency: 1 });
  return { store, updates, pipeline };
}

test('pipeline translates non-Arabic titles and stores the Arabic title', async () => {
  const { store, updates, pipeline } = setup();
  const [entry] = store.addNews([{
    title: 'Bitcoin jumps 5%',
    summary: 'BTC moved higher today.',
    cls: 'crypto',
    lang: 'en',
    url: 'https://example.com/a',
  }]);
  pipeline.handle([entry]);
  assert.ok(await waitFor(() => store.getNews(entry.id).titleAr === 'AR:Bitcoin jumps 5%'));
  assert.equal(store.getNews(entry.id).translation.status, 'done');
  assert.ok(updates.length >= 1);
  pipeline.stop();
});

test('pipeline does not translate Arabic items but still enriches images', async () => {
  const { store, pipeline } = setup();
  const [entry] = store.addNews([{
    title: 'ارتفاع الذهب اليوم',
    summary: 'ملخص عربي',
    cls: 'gold',
    lang: 'ar',
    url: 'https://example.com/b',
  }]);
  pipeline.handle([entry]);
  assert.ok(await waitFor(() => store.getNews(entry.id).image === 'https://cdn.example.com/og.jpg'));
  assert.equal(store.getNews(entry.id).titleAr, 'ارتفاع الذهب اليوم');
  assert.equal(store.getNews(entry.id).imageSource, 'og');
  pipeline.stop();
});

test('pipeline marks translation disabled when translator is off', async () => {
  const { store, pipeline } = setup({ translatorEnabled: false, enricherEnabled: false });
  const [entry] = store.addNews([{
    title: 'Nvidia beats estimates',
    cls: 'tech',
    lang: 'en',
    url: 'https://example.com/c',
  }]);
  pipeline.handle([entry]);
  assert.ok(await waitFor(() => store.getNews(entry.id).translation.status === 'disabled'));
  pipeline.stop();
});
