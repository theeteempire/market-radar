// تكامل X API v2 الاختياري. بدون X_BEARER_TOKEN يبقى معطّلًا بوضوح ولا يتم كشط X.
import { X_QUERIES } from '../config.js';
import { fetchJson } from '../http.js';
import { envInt } from '../env.js';
import { sleep } from '../util.js';

export class XProvider {
  constructor(store, alertEngine, logger, { onItems = null } = {}) {
    this.store = store;
    this.engine = alertEngine;
    this.logger = logger;
    this.onItems = onItems;
    this.token = (process.env.X_BEARER_TOKEN || '').trim();
    this.enabled = Boolean(this.token);
    this.pollMs = envInt('X_POLL_MS', 300000, { min: 60000, max: 3600000 });
    this.stopped = false;
    this.sourceId = 'x';
  }

  status() {
    return {
      enabled: this.enabled,
      reason: this.enabled
        ? 'مفعّل عبر X API v2 (بحث حديث)'
        : 'غير مفعّل: يتطلب X_BEARER_TOKEN في ملف .env — لا يتم كشط X بدون API رسمي.',
      pollMs: this.pollMs,
      queries: X_QUERIES.length,
    };
  }

  start() {
    if (!this.enabled) {
      this.store.setSource(this.sourceId, {
        name: 'X / Twitter',
        kind: 'social',
        status: 'disabled',
        error: 'يتطلب X_BEARER_TOKEN',
        meta: { pollMs: this.pollMs },
      });
      return;
    }
    this.store.setSource(this.sourceId, {
      name: 'X / Twitter · API v2',
      kind: 'social',
      status: 'idle',
      meta: { pollMs: this.pollMs, queries: X_QUERIES.length },
    });
    this.loop().catch((err) => this.logger.error(`توقف مزوّد X: ${err.message}`));
  }

  stop() {
    this.stopped = true;
  }

  async loop() {
    await sleep(4000);
    let failures = 0;
    while (!this.stopped) {
      let count = 0;
      let rateLimited = false;
      for (const query of X_QUERIES) {
        if (this.stopped) return;
        try {
          const n = await this.pollQuery(query);
          count += n;
          failures = 0;
        } catch (err) {
          failures += 1;
          if (err.rateLimitReset) {
            rateLimited = true;
            const waitMs = Math.max(30000, Math.min(15 * 60 * 1000, err.rateLimitReset * 1000 - Date.now()));
            this.logger.warn(`X: تجاوز حد المعدل، انتظار ${Math.round(waitMs / 1000)} ثانية`);
            await sleep(waitMs);
          } else {
            this.logger.warn(`X (${query.id}): ${err.message}`);
          }
        }
        await sleep(1500);
      }

      if (count > 0 || !rateLimited) {
        this.store.markSourceOk(this.sourceId, {
          count,
          meta: { pollMs: this.pollMs, queries: X_QUERIES.length, failures },
        });
      } else {
        this.store.markSourceError(this.sourceId, 'تجاوز حد معدل X', {
          meta: { pollMs: this.pollMs, failures },
        });
      }
      const wait = failures ? Math.min(30 * 60 * 1000, this.pollMs * 2 ** Math.min(failures, 3)) : this.pollMs;
      await sleep(wait);
    }
  }

  async pollQuery(query) {
    const params = new URLSearchParams({
      query: query.query,
      max_results: '20',
      'tweet.fields': 'created_at,public_metrics,lang',
      expansions: 'author_id',
      'user.fields': 'username,name,verified',
    });
    const url = `https://api.x.com/2/tweets/search/recent?${params.toString()}`;
    let data;
    try {
      const res = await fetchJson(url, {
        timeoutMs: 15000,
        retries: 0,
        headers: { Authorization: `Bearer ${this.token}` },
      });
      data = res.data;
    } catch (err) {
      if (err.status === 429) {
        const resetHeader = err.headers?.get?.('x-rate-limit-reset');
        const reset = Number(resetHeader);
        err.rateLimitReset = Number.isFinite(reset) ? reset : 0;
      }
      throw err;
    }
    if (!data) return 0;
    if (data.errors?.length && !data.data?.length) {
      throw new Error(data.errors[0]?.message || 'خطأ من X API');
    }
    const users = new Map((data.includes?.users || []).map((u) => [u.id, u]));
    const items = (data.data || []).map((tweet) => {
      const user = users.get(tweet.author_id);
      const username = user?.username || 'i';
      const text = String(tweet.text || '').replace(/\s+/g, ' ').trim();
      const metrics = tweet.public_metrics || {};
      return {
        id: `x-${tweet.id}`,
        title: text.slice(0, 280),
        url: `https://x.com/${username}/status/${tweet.id}`,
        source: `X · @${username}`,
        feedId: `x:${query.id}`,
        cls: query.cls,
        lang: tweet.lang || 'en',
        summary: `❤ ${metrics.like_count ?? 0} · 🔁 ${metrics.retweet_count ?? 0} · 💬 ${metrics.reply_count ?? 0}`,
        ts: Date.parse(tweet.created_at) || Date.now(),
        via: 'x',
      };
    });
    const added = this.store.addNews(items);
    for (const item of added) this.engine?.onNews(item);
    if (added.length && this.onItems) this.onItems(added);
    return added.length;
  }
}
