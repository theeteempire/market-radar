import test from 'node:test';
import assert from 'node:assert/strict';
import { Translator, isMostlyArabic } from '../src/translate.js';

function fakeFetch(payload, { status = 200 } = {}) {
  let calls = 0;
  const urls = [];
  const impl = async (url) => {
    calls += 1;
    urls.push(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() { return payload; },
    };
  };
  impl.calls = () => calls;
  impl.urls = () => urls;
  return impl;
}

test('isMostlyArabic detects Arabic text and rejects English', () => {
  assert.equal(isMostlyArabic('ارتفاع الذهب مع تراجع الدولار'), true);
  assert.equal(isMostlyArabic('Gold rises as the dollar falls'), false);
  assert.equal(isMostlyArabic('BTC/USDT 100'), false);
});

test('Translator caches results and skips Arabic input', async () => {
  // شكل استجابة clients5: [["الترجمة","en"]]
  const fetchImpl = fakeFetch([['مرحبا بالعالم', 'en']]);
  const translator = new Translator({ fetchImpl, minIntervalMs: 0, retryBaseMs: 0 });
  const first = await translator.translate('hello world');
  assert.equal(first.ok, true);
  assert.equal(first.text, 'مرحبا بالعالم');
  assert.equal(first.cached, false);
  const second = await translator.translate('hello world');
  assert.equal(second.cached, true);
  assert.equal(fetchImpl.calls(), 1);

  const arabic = await translator.translate('نص عربي');
  assert.equal(arabic.skipped, true);
  assert.equal(fetchImpl.calls(), 1);
});

test('Translator batches multiple texts into one request', async () => {
  const fetchImpl = fakeFetch([['الأول', 'en'], ['الثاني', 'en'], ['الثالث', 'en']]);
  const translator = new Translator({ fetchImpl, minIntervalMs: 0, retryBaseMs: 0, batchSize: 10 });
  const [a, b, c] = await Promise.all([
    translator.translate('first'),
    translator.translate('second'),
    translator.translate('third'),
  ]);
  assert.equal(fetchImpl.calls(), 1);
  assert.deepEqual([a.text, b.text, c.text], ['الأول', 'الثاني', 'الثالث']);
  const url = fetchImpl.urls()[0];
  assert.equal(new URL(url).searchParams.getAll('q').length, 3);
});

test('Translator reports failure without throwing', async () => {
  const fetchImpl = fakeFetch({}, { status: 429 });
  const translator = new Translator({ fetchImpl, minIntervalMs: 0, retries: 1, retryBaseMs: 0 });
  const result = await translator.translate('hello');
  assert.equal(result.ok, false);
  assert.match(result.error, /429/);
  assert.equal(translator.status().failed, 1);
});

test('Translator can be disabled', async () => {
  const fetchImpl = fakeFetch([]);
  const translator = new Translator({ fetchImpl, enabled: false });
  const result = await translator.translate('hello');
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(fetchImpl.calls(), 0);
});
