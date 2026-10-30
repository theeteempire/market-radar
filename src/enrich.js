// إثراء صور الأخبار: استخراج og:image من صفحة الخبر عند غياب صورة في الخلاصة.
// محافظ عمدًا: حد تزامن، حد معدل، حد حجم، ومنع العناوين المحلية/الخاصة.
import { IMAGE_ENRICH } from './config.js';
import { envBool } from './env.js';
import { sleep } from './util.js';

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[?::1\]?$)/i;

export function isSafeRemoteUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (!host) return false;
    if (PRIVATE_HOST_RE.test(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false;
    const m = host.match(/^172\.(\d+)\./);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
    if (/^\[?f[cd][0-9a-f]{2}:/i.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function decodeAttribute(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeAttribute(match[1]);
  }
  return '';
}

export function extractOgImage(html, baseUrl = '') {
  const text = String(html || '').slice(0, IMAGE_ENRICH.maxBytes);
  const candidates = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];
  const raw = firstMatch(text, candidates);
  if (!raw) return '';
  try {
    const resolved = new URL(raw, baseUrl || undefined);
    return isSafeRemoteUrl(resolved.href) ? resolved.href : '';
  } catch {
    return '';
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body) {
    const text = await res.text();
    return text.slice(0, maxBytes);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - size;
    if (remaining <= 0) {
      reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value.subarray(0, remaining));
    size += Math.min(value.length, remaining);
    if (size >= maxBytes) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class ImageEnricher {
  constructor({
    logger = null,
    fetchImpl = globalThis.fetch,
    enabled = envBool('IMAGE_ENRICH_ENABLED', true),
    concurrency = IMAGE_ENRICH.concurrency,
    maxPerMinute = IMAGE_ENRICH.maxPerMinute,
    timeoutMs = IMAGE_ENRICH.timeoutMs,
    maxBytes = IMAGE_ENRICH.maxBytes,
    maxCache = IMAGE_ENRICH.maxCache,
    cacheTtlMs = IMAGE_ENRICH.cacheTtlMs,
  } = {}) {
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.enabled = enabled && typeof fetchImpl === 'function';
    this.concurrency = Math.max(1, concurrency);
    this.maxPerMinute = Math.max(1, maxPerMinute);
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.maxCache = maxCache;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
    this.queue = [];
    this.active = 0;
    this.requestTimes = [];
    this.stats = { ok: 0, failed: 0, cached: 0, skipped: 0, lastError: null, lastOkAt: 0 };
  }

  status() {
    return {
      enabled: this.enabled,
      cached: this.cache.size,
      queue: this.queue.length,
      active: this.active,
      ok: this.stats.ok,
      failed: this.stats.failed,
      cachedHits: this.stats.cached,
      skipped: this.stats.skipped,
      maxPerMinute: this.maxPerMinute,
      lastError: this.stats.lastError,
      lastOkAt: this.stats.lastOkAt,
    };
  }

  enrich(url) {
    const value = String(url || '');
    if (!this.enabled || !isSafeRemoteUrl(value)) {
      this.stats.skipped += 1;
      return Promise.resolve(null);
    }
    const hit = this.cache.get(value);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) {
      this.stats.cached += 1;
      return Promise.resolve(hit.image || null);
    }
    return new Promise((resolve) => {
      this.queue.push({ url: value, resolve });
      this.#drain();
    });
  }

  #drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const task = this.queue.shift();
      this.active += 1;
      this.#run(task)
        .finally(() => {
          this.active -= 1;
          this.#drain();
        });
    }
  }

  async #waitForSlot() {
    while (true) {
      const now = Date.now();
      this.requestTimes = this.requestTimes.filter((t) => now - t < 60_000);
      if (this.requestTimes.length < this.maxPerMinute) {
        this.requestTimes.push(now);
        return;
      }
      const wait = 60_000 - (now - this.requestTimes[0]) + 20;
      await sleep(Math.max(250, wait));
    }
  }

  async #run({ url, resolve }) {
    try {
      await this.#waitForSlot();
      const res = await this.fetchImpl(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MarketRadar/1.1 (+local dashboard)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.8,ar;q=0.6',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/text\/html|application\/xhtml/i.test(type)) {
        throw new Error(`HTTP ${res.status} ${type.split(';')[0]}`);
      }
      const html = await readCapped(res, this.maxBytes);
      const image = extractOgImage(html, res.url || url);
      this.#remember(url, image);
      if (image) {
        this.stats.ok += 1;
        this.stats.lastOkAt = Date.now();
      } else {
        this.stats.skipped += 1;
      }
      resolve(image || null);
    } catch (err) {
      this.stats.failed += 1;
      this.stats.lastError = String(err?.message || err).slice(0, 160);
      this.#remember(url, '');
      if (this.stats.failed === 1 || this.stats.failed % 20 === 0) {
        this.logger?.warn(`إثراء الصور: ${this.stats.lastError}`);
      }
      resolve(null);
    }
  }

  #remember(url, image) {
    this.cache.set(url, { image, at: Date.now() });
    if (this.cache.size > this.maxCache) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}
