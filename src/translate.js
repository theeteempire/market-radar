// ترجمة آلية سريعة (عربي) عبر نقطة Google العامة غير الرسمية.
// - إرسال عدة نصوص في طلب واحد (q متكرر) لتقليل الطلبات وتفادي 429.
// - تخزين مؤقت لتقليل الطلبات والتكرار.
// - حد تزامن وحد معدل لتفادي الحجب، مع إعادة محاولة عند 429/5xx.
// - يمكن تعطيلها بالكامل عبر TRANSLATE_ENABLED=0.
// تنبيه خصوصية: النص المُرسل يخرج من الجهاز إلى خدمة Google.
import { TRANSLATION } from './config.js';
import { envBool } from './env.js';
import { sleep } from './util.js';

const ARABIC_RE = /[\u0600-\u06FF]/g;
const LETTER_RE = /[\p{L}]/gu;

export function isMostlyArabic(text) {
  const value = String(text || '');
  const letters = value.match(LETTER_RE)?.length || 0;
  if (!letters) return false;
  const arabic = value.match(ARABIC_RE)?.length || 0;
  return arabic / letters >= 0.35;
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, TRANSLATION.maxChars);
}

function pickTranslation(row) {
  if (Array.isArray(row)) return String(row[0] || '').trim();
  if (typeof row === 'string') return row.trim();
  return '';
}

export class Translator {
  constructor({
    logger = null,
    fetchImpl = globalThis.fetch,
    enabled = envBool('TRANSLATE_ENABLED', true),
    endpoint = TRANSLATION.endpoint,
    concurrency = TRANSLATION.concurrency,
    minIntervalMs = TRANSLATION.minIntervalMs,
    maxPerMinute = TRANSLATION.maxPerMinute,
    maxChars = TRANSLATION.maxChars,
    batchSize = TRANSLATION.batchSize,
    maxCharsPerRequest = TRANSLATION.maxCharsPerRequest,
    timeoutMs = TRANSLATION.timeoutMs,
    maxCache = TRANSLATION.maxCache,
    retries = TRANSLATION.retries,
    retryBaseMs = TRANSLATION.retryBaseMs,
    batchWindowMs = TRANSLATION.batchWindowMs,
  } = {}) {
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.enabled = enabled && typeof fetchImpl === 'function';
    this.endpoint = endpoint;
    this.concurrency = Math.max(1, concurrency);
    this.minIntervalMs = Math.max(0, minIntervalMs);
    this.maxPerMinute = Math.max(1, maxPerMinute);
    this.maxChars = maxChars;
    this.batchSize = Math.max(1, batchSize);
    this.maxCharsPerRequest = Math.max(200, maxCharsPerRequest);
    this.timeoutMs = timeoutMs;
    this.maxCache = maxCache;
    this.retries = Math.max(1, retries);
    this.retryBaseMs = Math.max(0, retryBaseMs);
    this.batchWindowMs = Math.max(0, batchWindowMs);
    this.cache = new Map();
    this.queue = [];
    this.active = 0;
    this.lastRequestAt = 0;
    this.requestTimes = [];
    this.drainTimer = null;
    this.stats = { ok: 0, failed: 0, cached: 0, skipped: 0, pending: 0, lastError: null, lastOkAt: 0 };
  }

  status() {
    return {
      enabled: this.enabled,
      provider: 'Google Translate (غير رسمي)',
      cached: this.cache.size,
      queue: this.queue.length,
      active: this.active,
      ok: this.stats.ok,
      failed: this.stats.failed,
      cachedHits: this.stats.cached,
      skipped: this.stats.skipped,
      batchSize: this.batchSize,
      maxPerMinute: this.maxPerMinute,
      lastError: this.stats.lastError,
      lastOkAt: this.stats.lastOkAt,
      privacy: 'نصوص الأخبار غير العربية تُرسل إلى خدمة Google للترجمة عند تفعيل الترجمة.',
    };
  }

  translate(raw) {
    const text = cleanText(raw);
    if (!text) {
      this.stats.skipped += 1;
      return Promise.resolve({ ok: true, text: '', skipped: true, cached: false });
    }
    if (isMostlyArabic(text)) {
      this.stats.skipped += 1;
      return Promise.resolve({ ok: true, text, skipped: true, cached: false });
    }
    if (!this.enabled) {
      this.stats.skipped += 1;
      return Promise.resolve({ ok: false, text: '', skipped: true, cached: false, error: 'الترجمة معطّلة' });
    }
    const hit = this.cache.get(text);
    if (hit !== undefined) {
      this.stats.cached += 1;
      return Promise.resolve({ ok: true, text: hit, skipped: false, cached: true });
    }
    return new Promise((resolve) => {
      this.queue.push({ text, resolve });
      this.stats.pending = this.queue.length;
      this.#scheduleDrain();
    });
  }

  // ننتظر نافذة قصيرة قبل السحب حتى تتجمّع عدة نصوص في طلب واحد.
  // بدون هذه النافذة يبدأ كل استدعاء دفعة منفردة فلا تستفيد المنصة من الدمج.
  #scheduleDrain() {
    if (this.drainTimer !== null) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.#drain();
    }, this.batchWindowMs);
    // لا نُبقي العملية حيّة بسبب مؤقّت التجميع.
    this.drainTimer.unref?.();
  }

  #drain() {
    while (this.active < this.concurrency && this.queue.length) {
      // تجميع أكبر عدد من النصوص ضمن حد الطول لكل طلب.
      const batch = [];
      let chars = 0;
      while (this.queue.length && batch.length < this.batchSize) {
        const next = this.queue[0];
        if (batch.length && chars + next.text.length > this.maxCharsPerRequest) break;
        batch.push(this.queue.shift());
        chars += next.text.length;
      }
      this.stats.pending = this.queue.length;
      this.active += 1;
      this.#runBatch(batch)
        .finally(() => {
          this.active -= 1;
          this.stats.pending = this.queue.length;
          this.#drain();
        });
    }
  }

  // حد معدل بنافذة منزلقة + فاصل بين الطلبات. يقلل 429 من Google.
  async #waitForSlot() {
    while (true) {
      const now = Date.now();
      this.requestTimes = this.requestTimes.filter((t) => now - t < 60_000);
      const intervalWait = this.minIntervalMs - (now - this.lastRequestAt);
      const windowFull = this.requestTimes.length >= this.maxPerMinute;
      if (!windowFull && intervalWait <= 0) {
        this.requestTimes.push(now);
        this.lastRequestAt = now;
        return;
      }
      const windowWait = windowFull ? 60_000 - (now - this.requestTimes[0]) + 25 : 0;
      await sleep(Math.max(250, intervalWait, windowWait));
    }
  }

  async #runBatch(batch) {
    const params = new URLSearchParams({ client: 'dict-chrome-ex', sl: 'auto', tl: 'ar' });
    for (const task of batch) params.append('q', task.text);
    const url = `${this.endpoint}?${params.toString()}`;
    let lastError = null;

    for (let attempt = 1; attempt <= this.retries; attempt += 1) {
      try {
        await this.#waitForSlot();
        const res = await this.fetchImpl(url, {
          headers: {
            'User-Agent': 'MarketRadar/1.1 (+local research dashboard)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        if (!rows.length) throw new Error('استجابة ترجمة فارغة');

        batch.forEach((task, index) => {
          const translated = pickTranslation(rows[index]);
          if (!translated) {
            this.stats.failed += 1;
            task.resolve({ ok: false, text: '', skipped: false, cached: false, error: 'ترجمة فارغة' });
            return;
          }
          this.#remember(task.text, translated);
          this.stats.ok += 1;
          task.resolve({ ok: true, text: translated, skipped: false, cached: false });
        });
        this.stats.lastOkAt = Date.now();
        return;
      } catch (err) {
        lastError = err;
        const retryable = !err?.status || err.status === 429 || err.status >= 500;
        if (attempt < this.retries && retryable) {
          const base = this.retryBaseMs * attempt;
          await sleep(base + Math.floor(Math.random() * Math.min(600, base || 1)));
          continue;
        }
        break;
      }
    }

    this.stats.failed += batch.length;
    this.stats.lastError = String(lastError?.message || lastError).slice(0, 160);
    if (this.stats.failed <= batch.length || this.stats.failed % 20 === 0) {
      this.logger?.warn(`الترجمة: ${this.stats.lastError}`);
    }
    for (const task of batch) {
      task.resolve({ ok: false, text: '', skipped: false, cached: false, error: this.stats.lastError });
    }
  }

  #remember(text, translated) {
    this.cache.set(text, translated);
    if (this.cache.size > this.maxCache) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }
}
