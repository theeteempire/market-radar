// مزوّد Yahoo Finance (واجهة chart العامة) للذهب والفضة والطاقة ومؤشر الدولار.
// ملاحظة: هذه واجهة غير رسمية وقد تتغير أو تحدّ من المعدل دون إشعار.
import { ASSETS } from '../config.js';
import { fetchJson } from '../http.js';
import { envInt } from '../env.js';
import { sleep } from '../util.js';

const YAHOO = ASSETS.filter((a) => a.source === 'yahoo');

export class YahooProvider {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
    this.pollMs = envInt('YAHOO_POLL_MS', 20000, { min: 5000, max: 300000 });
    this.stopped = false;
    this.failures = 0;
    this.lastTs = new Map();
    this.sourceId = 'yahoo';
  }

  async start() {
    this.store.setSource(this.sourceId, {
      name: 'Yahoo Finance · عقود آجلة',
      kind: 'prices',
      status: 'idle',
      meta: { intervalMs: this.pollMs, assets: YAHOO.length },
    });
    this.loop().catch((err) => this.logger.error(`توقف مزوّد Yahoo: ${err.message}`));
  }

  stop() {
    this.stopped = true;
  }

  async loop() {
    while (!this.stopped) {
      const started = Date.now();
      let ok = 0;
      const errors = [];
      for (const asset of YAHOO) {
        if (this.stopped) return;
        try {
          const applied = await this.pollAsset(asset);
          if (applied) ok += 1;
        } catch (err) {
          errors.push(`${asset.symbol}: ${err.message}`);
        }
        await sleep(250);
      }
      if (ok > 0 || errors.length < YAHOO.length) {
        this.failures = 0;
        this.store.markSourceOk(this.sourceId, {
          latencyMs: Date.now() - started,
          count: ok,
          meta: {
            intervalMs: this.pollMs,
            assets: YAHOO.length,
            ...(errors.length ? { partialErrors: errors.slice(0, 3) } : {}),
          },
        });
      } else {
        this.failures += 1;
        this.store.markSourceError(this.sourceId, errors[0] || 'فشل Yahoo', {
          latencyMs: Date.now() - started,
          meta: { intervalMs: this.pollMs, failures: this.failures },
        });
        if (this.failures === 1 || this.failures % 5 === 0) {
          this.logger.warn(`Yahoo: ${errors[0] || 'فشل'} (محاولة ${this.failures})`);
        }
      }
      const wait = this.failures
        ? Math.min(300000, this.pollMs * 2 ** Math.min(this.failures, 4))
        : this.pollMs;
      await sleep(wait);
    }
  }

  async pollAsset(asset) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.src)}` +
      '?interval=1m&range=1d&includePrePost=false';
    const { data } = await fetchJson(url, { timeoutMs: 12000, retries: 0 });
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(data?.chart?.error?.description || 'لا توجد بيانات');
    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const now = Date.now();
    const points = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const t = Number(timestamps[i]) * 1000;
      const p = Number(closes[i]);
      if (Number.isFinite(t) && Number.isFinite(p) && p > 0 && t <= now + 60_000) {
        points.push({ t, p });
      }
    }
    if (!points.length && !Number.isFinite(meta.regularMarketPrice)) {
      throw new Error('استجابة بلا سعر');
    }

    this.store.seedSeries(asset.id, points);

    const price = Number(meta.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error('سعر غير صالح');

    const marketTs = Number(meta.regularMarketTime) > 0 ? Number(meta.regularMarketTime) * 1000 : now;
    const previousTs = this.lastTs.get(asset.id);
    if (previousTs === marketTs && this.store.getAsset(asset.id)?.price === price) {
      return false;
    }
    this.lastTs.set(asset.id, marketTs);

    const regularStart = Number(meta.currentTradingPeriod?.regular?.start) * 1000;
    const sessionPoints = Number.isFinite(regularStart)
      ? points.filter((p) => p.t >= regularStart)
      : points;
    const open = sessionPoints[0]?.p ?? points[0]?.p ?? null;
    const values = sessionPoints.map((p) => p.p);
    const high = Number.isFinite(Number(meta.regularMarketDayHigh))
      ? Number(meta.regularMarketDayHigh)
      : values.length ? Math.max(...values) : null;
    const low = Number.isFinite(Number(meta.regularMarketDayLow))
      ? Number(meta.regularMarketDayLow)
      : values.length ? Math.min(...values) : null;
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose);
    let changePct = Number(meta.regularMarketChangePercent);
    if (!Number.isFinite(changePct) && Number.isFinite(prevClose) && prevClose > 0) {
      changePct = ((price - prevClose) / prevClose) * 100;
    }

    this.store.applyTick(asset.id, price, marketTs, {
      open,
      high,
      low,
      prevClose: Number.isFinite(prevClose) ? prevClose : undefined,
      volume: Number(meta.regularMarketVolume),
      changePct: Number.isFinite(changePct) ? changePct : undefined,
    });
    return true;
  }
}
