import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOgImage, isSafeRemoteUrl, ImageEnricher } from '../src/enrich.js';

test('isSafeRemoteUrl blocks local and private hosts', () => {
  assert.equal(isSafeRemoteUrl('https://example.com/a.jpg'), true);
  assert.equal(isSafeRemoteUrl('http://127.0.0.1/x'), false);
  assert.equal(isSafeRemoteUrl('http://localhost/x'), false);
  assert.equal(isSafeRemoteUrl('http://192.168.1.5/x'), false);
  assert.equal(isSafeRemoteUrl('file:///etc/passwd'), false);
  assert.equal(isSafeRemoteUrl('javascript:alert(1)'), false);
});

test('extractOgImage reads og:image, twitter:image, and resolves relative URLs', () => {
  const html = '<html><head><meta property="og:image" content="/img/a.jpg"></head></html>';
  assert.equal(extractOgImage(html, 'https://news.example.com/story'), 'https://news.example.com/img/a.jpg');

  const reversed = '<meta content="https://cdn.example.com/b.png" property="og:image">';
  assert.equal(extractOgImage(reversed, 'https://news.example.com'), 'https://cdn.example.com/b.png');

  const twitter = '<meta name="twitter:image" content="https://cdn.example.com/c.jpg">';
  assert.equal(extractOgImage(twitter, 'https://news.example.com'), 'https://cdn.example.com/c.jpg');

  assert.equal(extractOgImage('<html></html>', 'https://news.example.com'), '');
});

test('ImageEnricher caches results and never fetches private URLs', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      url: 'https://news.example.com/story',
      headers: { get: () => 'text/html; charset=utf-8' },
      body: null,
      async text() { return '<meta property="og:image" content="https://cdn.example.com/x.jpg">'; },
    };
  };
  const enricher = new ImageEnricher({ fetchImpl, maxPerMinute: 100 });
  const first = await enricher.enrich('https://news.example.com/story');
  assert.equal(first, 'https://cdn.example.com/x.jpg');
  const second = await enricher.enrich('https://news.example.com/story');
  assert.equal(second, 'https://cdn.example.com/x.jpg');
  assert.equal(calls, 1);

  const blocked = await enricher.enrich('http://127.0.0.1/secret');
  assert.equal(blocked, null);
  assert.equal(calls, 1);
});
