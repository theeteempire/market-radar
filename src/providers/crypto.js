// مزوّد Binance العام: أسعار لحظية كل ثانية + شموع دقيقة لتهيئة السلسلة الزمنية.
import { ASSETS } from '../config.js';
import { fetchJson } from '../http.js';
import { envInt } from '../env.js';
import { sleep } from '../util.js';

const CRYPTO = ASSETS.filter((a) => a.source === 'binance');

export class CryptoProvider {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
    this.pollMs = envInt('CRYPTO_POLL_MS', 1000, { min: 500, max: 60000 });
    this.stopped = false;
    this.failures = 0;
    this.controller = null;
    this.sourceId = 'binance';
  }

  async start() {
    this.store.setSource(this.sourceId, {
      name: 'Binance · أسعار فورية',
      kind: 'prices',
      status: 'idle',
      meta: { intervalMs: this.pollMs, assets: CRYPTO.length },
    });
    this.seed().catch((err) => this.logger.warn(`تهيئة شموع Binance فشلت: ${err.message}`));
    this.loop().catch((err) => this.logger.error(`توقف مزوّد Binance: ${err.message}`));
  }

  stop() {
    this.stopped = true;
    this.controller?.abort();
  }

  async seed() {
    for (const asset of CRYPTO) {
      if (this.stopped) return;
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(asset.src)}&interval=1m&limit=240`;
        const { data } = await fetchJson(url, { timeoutMs: 10000, retries: 0 });
        if (!Array.isArray(data)) continue;
        const now = Date.now();
        const points = data
          .map((k) => ({ t: Math.min(Number(k[6]), now), p: Number(k[4]) }))
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0);
        this.store.seedSeries(asset.id, points);
      } catch (err) {
        this.logger.warn(`شموع ${asset.symbol}: ${err.message}`);
      }
      await sleep(120);
    }
    this.logger.info('اكتملت تهيئة سلاسل Binance');
  }

  async loop() {
    while (!this.stopped) {
      const started = Date.now();
      try {
        const count = await this.pollTicker();
        this.failures = 0;
        this.store.markSourceOk(this.sourceId, {
          latencyMs: Date.now() - started,
          count,
          meta: { intervalMs: this.pollMs, assets: CRYPTO.length },
        });
      } catch (err) {
        this.failures += 1;
        this.store.markSourceError(this.sourceId, err.message, {
          latencyMs: Date.now() - started,
          meta: { intervalMs: this.pollMs, failures: this.failures },
        });
        if (this.failures === 1 || this.failures % 10 === 0) {
          this.logger.warn(`Binance: ${err.message} (محاولة ${this.failures})`);
        }
      }
      const backoff = this.failures ? Math.min(30000, 1000 * 2 ** Math.min(this.failures, 5)) : this.pollMs;
      await sleep(backoff);
    }
  }

  async pollTicker() {
    const symbols = CRYPTO.map((a) => a.src);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
    const { data } = await fetchJson(url, { timeoutMs: 8000, retries: 0 });
    if (!Array.isArray(data)) throw new Error('استجابة Binance غير متوقعة');
    let count = 0;
    for (const row of data) {
      const asset = CRYPTO.find((a) => a.src === row.symbol);
      if (!asset) continue;
      const ok = this.store.applyTick(asset.id, Number(row.lastPrice), Date.now(), {
        open: Number(row.openPrice),
        high: Number(row.highPrice),
        low: Number(row.lowPrice),
        volume: Number(row.quoteVolume),
        changePct: Number(row.priceChangePercent),
      });
      if (ok) count += 1;
    }
    if (!count) throw new Error('لم تُستقبل أسعار من Binance');
    return count;
  }
}
