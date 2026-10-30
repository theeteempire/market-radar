// فحص حي لكل مصادر البيانات والأخبار. لا يعدّل أي شيء، ويطبع تقريرًا.
import { ASSETS, NEWS_FEEDS, MASTODON, TRANSLATION } from '../src/config.js';
import { httpGet } from '../src/http.js';
import { parseFeed } from '../src/news-parse.js';

const results = [];

async function timed(name, kind, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, kind, ok: true, ms: Date.now() - started, detail });
  } catch (err) {
    results.push({ name, kind, ok: false, ms: Date.now() - started, detail: err.message });
  }
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

const cryptoAssets = ASSETS.filter((a) => a.source === 'binance');
const yahooAssets = ASSETS.filter((a) => a.source === 'yahoo');

await timed('Binance · 24h ticker', 'prices', async () => {
  const symbols = cryptoAssets.map((a) => a.src);
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const res = await httpGet(url, { timeoutMs: 15000, retries: 1 });
  const data = JSON.parse(res.text);
  if (!Array.isArray(data) || data.length !== symbols.length) throw new Error('عدد الرموز غير مطابق');
  return `${data.length} رمز · ${data[0].symbol}=${data[0].lastPrice}`;
});

await mapLimit(yahooAssets, 3, async (asset) => {
  await timed(`Yahoo · ${asset.src}`, 'prices', async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.src)}?interval=1m&range=1d`;
    const res = await httpGet(url, { timeoutMs: 15000, retries: 1 });
    const data = JSON.parse(res.text);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !Number.isFinite(meta.regularMarketPrice)) throw new Error('لا يوجد سعر');
    return `${asset.symbol}=${meta.regularMarketPrice} ${meta.currency || ''}`.trim();
  });
});

await mapLimit(NEWS_FEEDS, 4, async (feed) => {
  await timed(`أخبار · ${feed.name}`, 'news', async () => {
    const res = await httpGet(feed.url, { timeoutMs: 20000, retries: 1 });
    const items = parseFeed(res.text, feed);
    if (!items.length) throw new Error('لا توجد عناصر');
    return `${items.length} عنصر · ${Math.round(res.text.length / 1024)}KB`;
  });
});

await mapLimit(MASTODON.tags.slice(0, 3), 2, async (entry) => {
  await timed(`Mastodon · #${entry.tag}`, 'social', async () => {
    const url = `${MASTODON.instance}/api/v1/timelines/tag/${encodeURIComponent(entry.tag)}?limit=5`;
    const res = await httpGet(url, { timeoutMs: 15000, retries: 1 });
    const data = JSON.parse(res.text);
    if (!Array.isArray(data)) throw new Error('استجابة غير متوقعة');
    return `${data.length} منشورًا`;
  });
});

await timed('الترجمة · Google Translate (غير رسمي)', 'translation', async () => {
  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: 'auto',
    tl: 'ar',
    q: 'gold rises as the dollar falls',
  });
  const res = await httpGet(`${TRANSLATION.endpoint}?${params}`, { timeoutMs: 10000, retries: 0 });
  const data = JSON.parse(res.text);
  const text = Array.isArray(data?.[0]) ? String(data[0][0] || '') : String(data || '');
  if (!/[\u0600-\u06FF]/.test(text)) throw new Error('لم تُرجع ترجمة عربية');
  return text.slice(0, 70);
});

if (process.env.X_BEARER_TOKEN) {
  await timed('X API v2 · recent search', 'social', async () => {
    const params = new URLSearchParams({
      query: '(bitcoin OR $BTC) -is:retweet lang:en',
      max_results: '10',
      'tweet.fields': 'created_at',
    });
    const res = await httpGet(`https://api.x.com/2/tweets/search/recent?${params}`, {
      timeoutMs: 15000,
      retries: 0,
      headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    });
    const data = JSON.parse(res.text);
    return `${data?.meta?.result_count ?? 0} تغريدة`;
  });
} else {
  results.push({
    name: 'X API v2',
    kind: 'social',
    ok: true,
    skipped: true,
    ms: 0,
    detail: 'متخطى: X_BEARER_TOKEN غير مضبوط',
  });
}

const pad = (value, width) => String(value).padEnd(width);
console.log('');
console.log(`${pad('المصدر', 42)} ${pad('النوع', 8)} ${pad('الحالة', 10)} ${pad('الزمن', 8)} التفاصيل`);
console.log('-'.repeat(110));
for (const r of results) {
  const status = r.skipped ? 'متخطى' : r.ok ? 'OK' : 'FAIL';
  console.log(`${pad(r.name, 42)} ${pad(r.kind, 8)} ${pad(status, 10)} ${pad(`${r.ms}ms`, 8)} ${r.detail}`);
}
const failed = results.filter((r) => !r.ok);
const critical = failed.filter((r) => r.kind === 'prices');
const newsFailed = failed.filter((r) => r.kind === 'news');
console.log('-'.repeat(110));
console.log(`الإجمالي: ${results.length} · نجح: ${results.length - failed.length} · فشل: ${failed.length}`);
if (newsFailed.length) console.log(`تنبيه: ${newsFailed.length} مصدر أخبار فشل (قد يكون 429 أو حجب مؤقت).`);
if (critical.length) {
  console.error(`فشل حرج في ${critical.length} مصدر أسعار.`);
  process.exit(1);
}
if (failed.length === results.length) process.exit(1);
