// مخزن الحالة في الذاكرة: الأسعار، السلاسل الزمنية، الأخبار، التنبيهات، وحالة المصادر.
import { EventEmitter } from 'node:events';
import { ASSETS, ASSET_BY_ID } from './config.js';
import { assessNews } from './impact.js';

export const MAX_SERIES_MS = 4 * 60 * 60 * 1000; // 4 ساعات لكل أصل
export const MAX_SERIES_POINTS = 6000;
export const MAX_NEWS = 800;
export const MAX_ALERTS = 300;

export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim()
    .slice(0, 180);
}

function createAsset(def) {
  return {
    ...def,
    price: null,
    prevPrice: null,
    changePct: null,
    dayOpen: null,
    dayHigh: null,
    dayLow: null,
    prevClose: null,
    volume: null,
    ts: 0,
    series: [],
    lastTickAt: 0,
    flash: 0,
  };
}

export function downsample(points, maxPoints = 240) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  if (maxPoints < 2) return points.slice(-1);
  const out = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

export class MarketStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(80);
    this.startedAt = Date.now();
    this.assets = new Map();
    for (const def of ASSETS) this.assets.set(def.id, createAsset(def));
    this.news = [];
    this.newsKeys = new Set();
    this.urlKeys = new Set();
    this.newsById = new Map();
    this.alerts = [];
    this.sources = new Map();
    this.stats = { ticks: 0, newsSeen: 0, alerts: 0, startedAt: this.startedAt };
  }

  getAsset(id) {
    return this.assets.get(id) || null;
  }

  setSource(id, patch) {
    const prev = this.sources.get(id) || {
      id,
      name: id,
      kind: 'unknown',
      status: 'idle',
      lastAttemptAt: 0,
      lastOkAt: 0,
      latencyMs: null,
      error: null,
      count: 0,
      meta: {},
    };
    const next = { ...prev, ...patch, id };
    this.sources.set(id, next);
    this.emit('source', next);
    return next;
  }

  markSourceOk(id, { latencyMs = null, count = 0, meta = {} } = {}) {
    return this.setSource(id, {
      status: 'ok',
      lastAttemptAt: Date.now(),
      lastOkAt: Date.now(),
      latencyMs,
      error: null,
      count,
      meta: { ...meta },
    });
  }

  markSourceError(id, message, { latencyMs = null, meta = {} } = {}) {
    return this.setSource(id, {
      status: 'error',
      lastAttemptAt: Date.now(),
      latencyMs,
      error: String(message || 'خطأ غير معروف').slice(0, 300),
      meta: { ...meta },
    });
  }

  applyTick(id, price, ts = Date.now(), extra = {}) {
    const asset = this.assets.get(id);
    if (!asset) return null;
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) return null;

    const prev = asset.price;
    asset.prevPrice = prev;
    asset.price = value;
    asset.ts = Number(ts) || Date.now();
    asset.lastTickAt = Date.now();
    asset.flash = prev === null || prev === value ? 0 : value > prev ? 1 : -1;

    if (Number.isFinite(extra.open)) asset.dayOpen = extra.open;
    if (Number.isFinite(extra.prevClose)) asset.prevClose = extra.prevClose;
    if (Number.isFinite(extra.high)) asset.dayHigh = Math.max(asset.dayHigh ?? -Infinity, extra.high);
    if (Number.isFinite(extra.low)) asset.dayLow = Math.min(asset.dayLow ?? Infinity, extra.low);
    if (Number.isFinite(extra.volume)) asset.volume = extra.volume;

    if (asset.dayHigh === null || value > asset.dayHigh) asset.dayHigh = value;
    if (asset.dayLow === null || value < asset.dayLow) asset.dayLow = value;

    if (Number.isFinite(extra.changePct)) asset.changePct = extra.changePct;
    else if (Number.isFinite(asset.prevClose) && asset.prevClose > 0) {
      asset.changePct = ((value - asset.prevClose) / asset.prevClose) * 100;
    }

    asset.series.push({ t: asset.ts, p: value });
    this.#trimSeries(asset);

    this.stats.ticks += 1;
    const payload = {
      id,
      price: value,
      prevPrice: prev,
      ts: asset.ts,
      changePct: asset.changePct,
      dayOpen: asset.dayOpen,
      dayHigh: asset.dayHigh,
      dayLow: asset.dayLow,
      prevClose: asset.prevClose,
      volume: asset.volume,
      flash: asset.flash,
    };
    this.emit('tick', payload);
    return payload;
  }

  #trimSeries(asset) {
    const cutoff = Date.now() - MAX_SERIES_MS;
    let start = 0;
    while (start < asset.series.length - 1 && asset.series[start].t < cutoff) start += 1;
    if (start > 0) asset.series.splice(0, start);
    if (asset.series.length > MAX_SERIES_POINTS) {
      asset.series.splice(0, asset.series.length - MAX_SERIES_POINTS);
    }
  }

  seedSeries(id, points) {
    const asset = this.assets.get(id);
    if (!asset || !Array.isArray(points)) return;
    const clean = points
      .map((p) => ({ t: Number(p.t), p: Number(p.p) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0)
      .sort((a, b) => a.t - b.t);
    if (!clean.length) return;
    const merged = new Map();
    for (const point of asset.series) merged.set(Math.floor(point.t / 1000), point);
    for (const point of clean) merged.set(Math.floor(point.t / 1000), point);
    asset.series = [...merged.values()].sort((a, b) => a.t - b.t);
    this.#trimSeries(asset);
    if (asset.dayOpen === null) asset.dayOpen = clean[0].p;
    for (const point of clean) {
      if (asset.dayHigh === null || point.p > asset.dayHigh) asset.dayHigh = point.p;
      if (asset.dayLow === null || point.p < asset.dayLow) asset.dayLow = point.p;
    }
  }

  seriesFor(id, sinceMs = 0, maxPoints = 600) {
    const asset = this.assets.get(id);
    if (!asset) return [];
    const filtered = sinceMs > 0 ? asset.series.filter((p) => p.t >= sinceMs) : asset.series;
    return downsample(filtered, maxPoints);
  }

  addNews(items) {
    if (!Array.isArray(items) || !items.length) return [];
    const added = [];
    const now = Date.now();
    for (const item of items) {
      if (!item || !item.title) continue;
      const key = normalizeTitle(item.title);
      if (!key || this.newsKeys.has(key)) continue;
      const url = String(item.url || '').trim().slice(0, 2048);
      if (url && this.urlKeys.has(url)) continue;
      this.newsKeys.add(key);
      if (url) this.urlKeys.add(url);

      const cls = item.cls || 'general';
      const lang = item.lang || 'en';
      const ts = Number(item.ts) || now;
      const title = String(item.title).slice(0, 300);
      const summary = String(item.summary || '').slice(0, 600);
      const { impact, breaking, importance } = assessNews({ title, summary, cls, lang, ts }, { now });

      const entry = {
        id: item.id || `n-${now}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        titleAr: lang === 'ar' ? title : '',
        url,
        source: String(item.source || item.feedName || 'مصدر غير معروف').slice(0, 120),
        feedId: item.feedId || '',
        cls,
        lang,
        summary,
        summaryAr: lang === 'ar' ? summary : '',
        image: String(item.image || '').slice(0, 2048),
        imageSource: item.image ? 'feed' : '',
        enriched: Boolean(item.image),
        impact,
        breaking: Boolean(breaking),
        importance,
        translation: { status: lang === 'ar' ? 'source' : 'pending', at: 0 },
        ts,
        receivedAt: now,
        via: item.via || 'rss',
      };
      added.push(entry);
      this.news.push(entry);
      this.newsById.set(entry.id, entry);
      this.stats.newsSeen += 1;
    }
    if (!added.length) return [];
    this.news.sort((a, b) => b.ts - a.ts);
    if (this.news.length > MAX_NEWS) {
      const removed = this.news.splice(MAX_NEWS);
      for (const item of removed) {
        this.newsKeys.delete(normalizeTitle(item.title));
        if (item.url) this.urlKeys.delete(item.url);
        this.newsById.delete(item.id);
      }
    }
    this.emit('news', added);
    return added;
  }

  getNews(id) {
    return this.newsById.get(id) || null;
  }

  // تحديث جزئي لخبر (ترجمة/صورة) وبثّه فورًا للواجهة.
  updateNews(id, patch = {}) {
    const entry = this.newsById.get(id);
    if (!entry || !patch || typeof patch !== 'object') return null;
    const allowed = [
      'image', 'imageSource', 'titleAr', 'summaryAr',
      'impact', 'breaking', 'importance', 'translation', 'enriched',
    ];
    let changed = false;
    for (const key of allowed) {
      if (patch[key] === undefined) continue;
      entry[key] = patch[key];
      changed = true;
    }
    if (!changed) return entry;
    entry.updatedAt = Date.now();
    this.emit('news_update', entry);
    return entry;
  }

  addAlert(alert) {
    if (!alert || !alert.title) return null;
    const entry = {
      id: alert.id || `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ts: Number(alert.ts) || Date.now(),
      severity: ['high', 'medium', 'low'].includes(alert.severity) ? alert.severity : 'medium',
      kind: alert.kind || 'system',
      assetId: alert.assetId || null,
      title: String(alert.title).slice(0, 240),
      body: String(alert.body || '').slice(0, 600),
      url: alert.url || '',
      source: alert.source || 'رادار السوق',
      data: alert.data && typeof alert.data === 'object' ? alert.data : {},
      acknowledged: false,
    };
    this.alerts.unshift(entry);
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    this.stats.alerts += 1;
    this.emit('alert', entry);
    return entry;
  }

  acknowledgeAlert(id) {
    const alert = this.alerts.find((a) => a.id === id);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  acknowledgeAll() {
    let n = 0;
    for (const alert of this.alerts) {
      if (!alert.acknowledged) {
        alert.acknowledged = true;
        n += 1;
      }
    }
    return n;
  }

  publicAsset(asset, { series = true, maxPoints = 240 } = {}) {
    const base = {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      short: asset.short,
      cls: asset.cls,
      source: asset.source,
      src: asset.src,
      decimals: asset.decimals,
      unit: asset.unit,
      note: asset.note || '',
      price: asset.price,
      prevPrice: asset.prevPrice,
      changePct: asset.changePct,
      dayOpen: asset.dayOpen,
      dayHigh: asset.dayHigh,
      dayLow: asset.dayLow,
      prevClose: asset.prevClose,
      volume: asset.volume,
      ts: asset.ts,
      flash: asset.flash,
    };
    if (series) base.series = downsample(asset.series, maxPoints);
    return base;
  }

  snapshot() {
    return {
      serverTime: Date.now(),
      startedAt: this.startedAt,
      stats: { ...this.stats },
      assets: [...this.assets.values()].map((a) => this.publicAsset(a)),
      news: this.news.slice(0, 200),
      alerts: this.alerts.slice(0, 60),
      sources: [...this.sources.values()],
    };
  }

  sourceSummary() {
    const sources = [...this.sources.values()];
    return {
      total: sources.length,
      ok: sources.filter((s) => s.status === 'ok').length,
      error: sources.filter((s) => s.status === 'error').length,
      disabled: sources.filter((s) => s.status === 'disabled').length,
    };
  }
}

export { ASSET_BY_ID };
