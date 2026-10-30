// تطبيق رادار السوق: خادم HTTP + SSE + واجهات API + خدمة الملفات الثابتة.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarketStore } from './store.js';
import { SettingsStore } from './settings.js';
import { AlertEngine } from './alerts.js';
import { CryptoProvider } from './providers/crypto.js';
import { YahooProvider } from './providers/yahoo.js';
import { NewsProvider } from './providers/news.js';
import { XProvider } from './providers/x.js';
import { MastodonProvider } from './providers/mastodon.js';
import { TelegramNotifier } from './providers/telegram.js';
import { Translator } from './translate.js';
import { ImageEnricher } from './enrich.js';
import { NewsPipeline, pipelineEnabled } from './pipeline.js';
import { APP_NAME, APP_VERSION, ASSET_CLASSES, NEWS_CLASS_LABELS, X_SEARCH_LINKS } from './config.js';
import { Logger } from './logger.js';
import { envInt } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('حجم الطلب كبير جدًا'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON غير صالح'));
      }
    });
    req.on('error', reject);
  });
}

export function createApp(options = {}) {
  const {
    dataDir = path.resolve(process.cwd(), 'data'),
    startProviders = true,
    feeds,
  } = options;

  const logger = new Logger('app');
  const store = new MarketStore();
  const settings = new SettingsStore(path.join(dataDir, 'settings.json'));
  const notifier = new TelegramNotifier(logger);
  const engine = new AlertEngine(store, settings, { notifier, logger });
  const translator = new Translator({ logger });
  const enricher = new ImageEnricher({ logger });
  const pipeline = new NewsPipeline(store, {
    translator,
    enricher,
    logger,
    concurrency: 6,
  });
  const onItems = pipelineEnabled() ? (items) => pipeline.handle(items) : null;

  const providers = {
    crypto: new CryptoProvider(store, logger),
    yahoo: new YahooProvider(store, logger),
    news: new NewsProvider(store, engine, logger, feeds ? { feeds, onItems } : { onItems }),
    x: new XProvider(store, engine, logger, { onItems }),
    mastodon: new MastodonProvider(store, engine, logger, { onItems }),
  };

  const sseClients = new Set();

  function sseSend(res, event, payload) {
    if (res.writableEnded || res.destroyed) return;
    if (res.writableLength > 512 * 1024) return;
    const data = JSON.stringify(payload);
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  function broadcast(event, payload) {
    for (const client of sseClients) sseSend(client, event, payload);
  }

  store.on('tick', (payload) => {
    try {
      const asset = store.getAsset(payload.id);
      if (asset) engine.onTick(asset);
    } catch (err) {
      logger.warn(`محرك التنبيهات: ${err.message}`);
    }
    broadcast('tick', payload);
  });
  store.on('news', (items) => broadcast('news', items));
  store.on('news_update', (item) => broadcast('news_update', item));
  store.on('alert', (alert) => broadcast('alert', alert));
  store.on('source', (source) => broadcast('source', source));

  function snapshot() {
    return {
      ...store.snapshot(),
      app: { name: APP_NAME, version: APP_VERSION },
      settings: settings.get(),
      classes: ASSET_CLASSES,
      newsClasses: NEWS_CLASS_LABELS,
      x: providers.x.status(),
      mastodon: providers.mastodon.status(),
      telegram: notifier.status(),
      translation: translator.status(),
      images: enricher.status(),
      pipeline: pipeline.status(),
      xLinks: X_SEARCH_LINKS,
    };
  }

  function health() {
    return {
      ok: true,
      app: { name: APP_NAME, version: APP_VERSION },
      serverTime: Date.now(),
      uptimeSec: Math.round((Date.now() - store.startedAt) / 1000),
      stats: { ...store.stats },
      sources: store.sourceSummary(),
      counts: {
        assets: store.assets.size,
        news: store.news.length,
        alerts: store.alerts.length,
        sseClients: sseClients.size,
      },
      providers: {
        x: providers.x.status(),
        mastodon: providers.mastodon.status(),
        telegram: notifier.status(),
        translation: translator.status(),
        images: enricher.status(),
        pipeline: pipeline.status(),
      },
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const resolved = path.resolve(PUBLIC_DIR, `.${rel}`);
    if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
      return sendText(res, 403, 'ممنوع');
    }
    let stat;
    try {
      stat = fs.statSync(resolved);
      if (stat.isDirectory()) throw new Error('dir');
    } catch {
      return sendText(res, 404, 'الصفحة غير موجودة');
    }
    const ext = path.extname(resolved).toLowerCase();
    const isVendor = rel.startsWith('/vendor/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isVendor ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(resolved).pipe(res);
  }

  function handleSse(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    sseSend(res, 'snapshot', snapshot());

    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`: ping ${Date.now()}\n\n`);
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const { pathname, searchParams } = url;

    // رؤوس أمان أساسية. لا يوجد مصادقة: الخادم محلي افتراضيًا.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );

    try {
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, health());
      }

      if (pathname === '/api/snapshot' && req.method === 'GET') {
        return sendJson(res, 200, snapshot());
      }

      if (pathname === '/api/stream' && req.method === 'GET') {
        return handleSse(req, res);
      }

      if (pathname === '/api/series' && req.method === 'GET') {
        const id = searchParams.get('id') || '';
        if (!store.getAsset(id)) return sendJson(res, 404, { error: 'أصل غير معروف' });
        const rangeSec = Math.min(14400, Math.max(60, Number(searchParams.get('range')) || 3600));
        const points = Math.min(2000, Math.max(30, Number(searchParams.get('points')) || 600));
        const series = store.seriesFor(id, Date.now() - rangeSec * 1000, points);
        return sendJson(res, 200, { id, rangeSec, points: series.length, series });
      }

      if (pathname === '/api/news' && req.method === 'GET') {
        const limit = Math.min(300, Math.max(1, Number(searchParams.get('limit')) || 100));
        const cls = searchParams.get('cls');
        const via = searchParams.get('via');
        const lang = searchParams.get('lang');
        const breaking = searchParams.get('breaking') === '1';
        const q = (searchParams.get('q') || '').trim().toLowerCase();
        const since = Number(searchParams.get('since')) || 0;
        let items = store.news;
        if (cls && cls !== 'all') items = items.filter((n) => n.cls === cls);
        if (via && via !== 'all') items = items.filter((n) => n.via === via);
        if (lang && lang !== 'all') items = items.filter((n) => n.lang === lang);
        if (breaking) items = items.filter((n) => n.breaking);
        if (since > 0) items = items.filter((n) => n.ts >= since);
        if (q) {
          items = items.filter((n) =>
            `${n.title} ${n.titleAr} ${n.summary} ${n.summaryAr} ${n.source}`.toLowerCase().includes(q),
          );
        }
        return sendJson(res, 200, { total: items.length, items: items.slice(0, limit) });
      }

      if (pathname === '/api/alerts' && req.method === 'GET') {
        const limit = Math.min(300, Math.max(1, Number(searchParams.get('limit')) || 100));
        const severity = searchParams.get('severity');
        const kind = searchParams.get('kind');
        const unack = searchParams.get('unack') === '1';
        let items = store.alerts;
        if (severity && severity !== 'all') items = items.filter((a) => a.severity === severity);
        if (kind && kind !== 'all') items = items.filter((a) => a.kind === kind);
        if (unack) items = items.filter((a) => !a.acknowledged);
        return sendJson(res, 200, { total: items.length, items: items.slice(0, limit) });
      }

      if (pathname === '/api/alerts/ack' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (body?.all === true) {
          const n = store.acknowledgeAll();
          broadcast('alerts_ack', { all: true, count: n });
          return sendJson(res, 200, { ok: true, count: n });
        }
        if (typeof body?.id !== 'string') return sendJson(res, 400, { error: 'معرّف التنبيه مطلوب' });
        const ok = store.acknowledgeAlert(body.id);
        if (ok) broadcast('alerts_ack', { id: body.id });
        return sendJson(res, ok ? 200 : 404, { ok });
      }

      if (pathname === '/api/alerts/test' && req.method === 'POST') {
        const alert = engine.testAlert();
        return sendJson(res, 200, { ok: Boolean(alert), alert });
      }

      if (pathname === '/api/settings' && req.method === 'GET') {
        return sendJson(res, 200, settings.get());
      }

      if (pathname === '/api/settings' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (!body || typeof body !== 'object') return sendJson(res, 400, { error: 'بيانات غير صالحة' });
        const updated = settings.update(body);
        broadcast('settings', updated);
        return sendJson(res, 200, updated);
      }

      if (pathname === '/api/export' && req.method === 'GET') {
        const payload = JSON.stringify(snapshot(), null, 2);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="market-radar-${Date.now()}.json"`,
          'Cache-Control': 'no-store',
        });
        return res.end(payload);
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'مسار API غير معروف' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendText(res, 405, 'طريقة غير مدعومة');
      }

      return serveStatic(req, res, pathname);
    } catch (err) {
      logger.warn(`طلب ${pathname} فشل: ${err.message}`);
      if (!res.headersSent) return sendJson(res, 400, { error: err.message });
      return res.end();
    } finally {
      if (process.env.DEBUG) {
        logger.debug(`${req.method} ${pathname} ${Date.now() - started}ms`);
      }
    }
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;

  async function listen(port = envInt('PORT', 8787, { min: 0, max: 65535 }), host = process.env.HOST || '127.0.0.1') {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    logger.info(`الخادم يعمل على http://${host}:${actualPort}`);
    if (startProviders && process.env.DISABLE_PROVIDERS !== '1') {
      providers.crypto.start();
      providers.yahoo.start();
      providers.news.start();
      providers.x.start();
      providers.mastodon.start();
      logger.info('بدأ مزوّدو البيانات والأخبار');
    } else {
      logger.info('المزوّدات معطّلة (وضع الاختبار)');
    }
    return { port: actualPort, host, url: `http://${host}:${actualPort}` };
  }

  async function close() {
    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        /* ignore */
      }
    }
    sseClients.clear();
    providers.crypto.stop();
    providers.yahoo.stop();
    providers.news.stop();
    providers.x.stop();
    providers.mastodon.stop();
    pipeline.stop();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    server,
    store,
    settings,
    engine,
    providers,
    notifier,
    translator,
    enricher,
    pipeline,
    logger,
    listen,
    close,
    snapshot,
    health,
  };
}
