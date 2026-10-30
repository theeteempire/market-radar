// مجمّع الأخبار: Google News + RSS/Atom مباشر، مع طلبات شرطية (ETag) وتراجع تدريجي.
import { NEWS_FEEDS } from '../config.js';
import { fetchText } from '../http.js';
import { envInt } from '../env.js';
import { parseFeed } from '../news-parse.js';
import { sleep, jitter } from '../util.js';

export class NewsProvider {
  constructor(store, alertEngine, logger, { feeds = NEWS_FEEDS, onItems = null } = {}) {
    this.store = store;
    this.engine = alertEngine;
    this.logger = logger;
    this.feeds = feeds;
    this.onItems = onItems;
    this.stopped = false;
    this.conditions = new Map();
    this.failures = new Map();
    this.pollScale = envInt('NEWS_POLL_SCALE', 100, { min: 25, max: 400 }) / 100;
  }

  start() {
    this.feeds.forEach((feed, index) => {
      const id = `news:${feed.id}`;
      this.store.setSource(id, {
        name: feed.name,
        kind: 'news',
        status: 'idle',
        meta: { cls: feed.cls, lang: feed.lang, intervalMs: Math.round(feed.interval * this.pollScale) },
      });
      const initial = 1200 + index * 1600 + Math.random() * 800;
      this.loop(feed, initial).catch((err) =>
        this.logger.error(`توقف خلاصة ${feed.name}: ${err.message}`),
      );
    });
    this.logger.info(`بدأ تجميع الأخبار من ${this.feeds.length} مصدرًا`);
  }

  stop() {
    this.stopped = true;
  }

  async loop(feed, initialDelay = 0) {
    await sleep(initialDelay);
    while (!this.stopped) {
      const started = Date.now();
      try {
        const count = await this.fetchFeed(feed);
        this.failures.set(feed.id, 0);
        this.store.markSourceOk(`news:${feed.id}`, {
          latencyMs: Date.now() - started,
          count,
          meta: {
            cls: feed.cls,
            lang: feed.lang,
            intervalMs: Math.round(feed.interval * this.pollScale),
          },
        });
      } catch (err) {
        const failures = (this.failures.get(feed.id) || 0) + 1;
        this.failures.set(feed.id, failures);
        this.store.markSourceError(`news:${feed.id}`, err.message, {
          latencyMs: Date.now() - started,
          meta: { cls: feed.cls, lang: feed.lang, failures },
        });
        if (failures === 1 || failures % 5 === 0) {
          this.logger.warn(`خلاصة ${feed.name}: ${err.message} (محاولة ${failures})`);
        }
      }
      const failures = this.failures.get(feed.id) || 0;
      const base = Math.round(feed.interval * this.pollScale);
      const wait = failures
        ? Math.min(30 * 60 * 1000, base * 2 ** Math.min(failures, 5))
        : jitter(base);
      await sleep(wait);
    }
  }

  async fetchFeed(feed) {
    const condition = this.conditions.get(feed.id) || {};
    const res = await fetchText(feed.url, {
      timeoutMs: 15000,
      retries: 0,
      etag: condition.etag,
      lastModified: condition.lastModified,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (res.notModified) return 0;
    this.conditions.set(feed.id, { etag: res.etag, lastModified: res.lastModified });
    const items = parseFeed(res.text, feed);
    const added = this.store.addNews(items);
    for (const item of added) this.engine?.onNews(item);
    if (added.length && this.onItems) this.onItems(added);
    return added.length;
  }
}
