// مزوّد Mastodon: خطوط زمنية عامة للوسوم عبر API العام (بدون مصادقة وبدون كشط).
// ملاحظة: بعض الخوادم قد تحدّ المعدل أو تمنع الطلبات المجهولة؛ نتعامل مع ذلك بتراجع تدريجي.
import { MASTODON } from '../config.js';
import { fetchJson } from '../http.js';
import { envInt } from '../env.js';
import { decodeEntities, stripHtml } from '../news-parse.js';
import { sleep, jitter } from '../util.js';

function statusToItem(status, tag) {
  const content = stripHtml(status?.content || '');
  const text = decodeEntities(content).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const account = status?.account?.acct || status?.account?.username || 'mastodon';
  const media = Array.isArray(status?.media_attachments) ? status.media_attachments : [];
  const image = media.find((m) => m?.type === 'image' && (m.preview_url || m.url));
  const title = text.length > 150 ? `${text.slice(0, 147).trim()}…` : text;
  const created = Date.parse(status?.created_at);
  return {
    id: `m-${status?.id || encodeURIComponent(status?.url || title)}`,
    title,
    url: status?.url || status?.uri || '',
    source: `Mastodon · @${account}`,
    feedId: `mastodon:${tag.tag}`,
    cls: tag.cls,
    lang: status?.language || 'en',
    summary: text.slice(0, 400),
    image: image ? (image.preview_url || image.url) : '',
    ts: Number.isFinite(created) ? created : Date.now(),
    via: 'mastodon',
  };
}

export class MastodonProvider {
  constructor(store, alertEngine, logger, { onItems = null, tags = MASTODON.tags } = {}) {
    this.store = store;
    this.engine = alertEngine;
    this.logger = logger;
    this.onItems = onItems;
    this.tags = tags;
    this.interval = envInt('MASTODON_POLL_MS', MASTODON.interval, { min: 60000, max: 1800000 });
    this.stopped = false;
    this.sourceId = 'mastodon';
  }

  status() {
    return {
      enabled: true,
      instance: MASTODON.instance,
      intervalMs: this.interval,
      tags: this.tags.length,
      note: 'خطوط زمنية عامة للوسوم فقط؛ ليست تغطية كاملة لكل المنشورات.',
    };
  }

  start() {
    this.store.setSource(this.sourceId, {
      name: 'Mastodon · وسوم عامة',
      kind: 'social',
      status: 'idle',
      meta: { intervalMs: this.interval, tags: this.tags.map((t) => t.tag) },
    });
    this.loop().catch((err) => this.logger.error(`توقف مزوّد Mastodon: ${err.message}`));
  }

  stop() {
    this.stopped = true;
  }

  async loop() {
    await sleep(2500);
    let failures = 0;
    while (!this.stopped) {
      let count = 0;
      let okTags = 0;
      for (const tag of this.tags) {
        if (this.stopped) return;
        try {
          count += await this.pollTag(tag);
          okTags += 1;
          failures = 0;
        } catch (err) {
          failures += 1;
          if (failures === 1 || failures % 5 === 0) {
            this.logger.warn(`Mastodon #${tag.tag}: ${err.message}`);
          }
        }
        await sleep(700);
      }

      if (okTags) {
        this.store.markSourceOk(this.sourceId, {
          count,
          meta: { intervalMs: this.interval, tags: this.tags.length, okTags, failures },
        });
      } else {
        this.store.markSourceError(this.sourceId, 'فشلت كل وسوم Mastodon', {
          meta: { intervalMs: this.interval, failures },
        });
      }

      const wait = failures
        ? Math.min(30 * 60 * 1000, this.interval * 2 ** Math.min(failures, 4))
        : jitter(this.interval);
      await sleep(wait);
    }
  }

  async pollTag(tag) {
    const url = `${MASTODON.instance}/api/v1/timelines/tag/${encodeURIComponent(tag.tag)}?limit=${MASTODON.limit}`;
    const { data } = await fetchJson(url, {
      timeoutMs: 15000,
      retries: 0,
      headers: { Accept: 'application/json' },
    });
    if (!Array.isArray(data)) return 0;
    const items = data.map((status) => statusToItem(status, tag)).filter(Boolean);
    if (!items.length) return 0;
    const added = this.store.addNews(items);
    for (const item of added) this.engine?.onNews(item);
    if (added.length && this.onItems) this.onItems(added);
    return added.length;
  }
}
