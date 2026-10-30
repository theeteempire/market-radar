// خط معالجة الأخبار بعد الإضافة إلى المخزن:
// 1) ترجمة آلية للعناوين غير العربية (والملخصات عند الأهمية أو حسب الإعداد).
// 2) إثراء الصورة عبر og:image عند غياب صورة في الخلاصة.
// كل تحديث يُبثّ فورًا عبر store.updateNews، ويعمل بحدود تزامن وحدود معدل.
import { envBool } from './env.js';

export class NewsPipeline {
  constructor(store, {
    translator = null,
    enricher = null,
    logger = null,
    concurrency = 3,
    // سقف كبير حتى لا تُسقط عناصر عند بدء بارد مع مئات الأخبار.
    // MAX_NEWS = 800، فالسقف 2000 يضمن عدم فقدان أي ترجمة أو صورة.
    maxQueue = 2000,
    summaryMode = process.env.TRANSLATE_SUMMARIES || 'auto',
    enrichLimit = 240,
  } = {}) {
    this.store = store;
    this.translator = translator;
    this.enricher = enricher;
    this.logger = logger;
    this.concurrency = Math.max(1, concurrency);
    this.maxQueue = Math.max(1, maxQueue);
    this.summaryMode = summaryMode === 'all' || summaryMode === 'off' ? summaryMode : 'auto';
    this.enrichLimit = Math.max(0, enrichLimit);
    this.enrichQueued = 0;
    this.seen = new Set();
    this.queue = [];
    this.active = 0;
    this.stopped = false;
    this.stats = { received: 0, processed: 0, translated: 0, enriched: 0, skipped: 0, dropped: 0 };
  }

  status() {
    return {
      queue: this.queue.length,
      active: this.active,
      summaryMode: this.summaryMode,
      ...this.stats,
      translation: this.translator?.status?.() || { enabled: false },
      images: this.enricher?.status?.() || { enabled: false },
    };
  }

  stop() {
    this.stopped = true;
    this.queue.length = 0;
  }

  // يُستدعى من مزوّدي الأخبار بعد store.addNews.
  handle(items) {
    if (this.stopped || !Array.isArray(items) || !items.length) return;
    const now = Date.now();
    for (const item of items) {
      if (!item?.id || this.seen.has(item.id)) continue;
      this.seen.add(item.id);
      this.stats.received += 1;

      const priority = this.#priority(item, now);
      this.queue.push({ id: item.id, priority, enqueuedAt: now });
    }

    if (this.seen.size > 4000) {
      // تقليم ذاكرة المعرّفات القديمة دون التأثير على العناصر الحالية.
      const keep = [...this.seen].slice(-2000);
      this.seen = new Set(keep);
    }

    if (this.queue.length > this.maxQueue) {
      this.queue.sort((a, b) => b.priority - a.priority);
      const dropped = this.queue.splice(this.maxQueue);
      this.stats.dropped += dropped.length;
      this.queue.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    }

    this.#drain();
  }

  #priority(item, now) {
    let score = Number(item.importance) || 0;
    if (item.breaking) score += 40;
    if (!item.image && item.url) score += 8;
    if (item.lang === 'ar') score -= 60; // لا ترجمة مطلوبة، تبقى الصورة فقط
    const ageMin = Math.max(0, (now - (Number(item.ts) || now)) / 60000);
    return score - Math.min(30, ageMin / 6);
  }

  #drain() {
    while (!this.stopped && this.active < this.concurrency && this.queue.length) {
      // اختيار أعلى أولوية (قائمة صغيرة، فحص خطي كافٍ).
      let best = 0;
      for (let i = 1; i < this.queue.length; i += 1) {
        if (this.queue[i].priority > this.queue[best].priority) best = i;
      }
      const task = this.queue.splice(best, 1)[0];
      this.active += 1;
      this.#process(task)
        .catch((err) => {
          this.logger?.warn(`خط الأخبار (${task.id}): ${err.message}`);
        })
        .finally(() => {
          this.active -= 1;
          this.#drain();
        });
    }
  }

  async #process({ id }) {
    const item = this.store.getNews(id);
    if (!item) {
      this.stats.skipped += 1;
      return;
    }
    const patch = {};
    let didWork = false;

    // ===== الترجمة =====
    const needsTitle = item.lang !== 'ar' && !item.titleAr && this.translator?.enabled;
    const wantsSummary = item.lang !== 'ar'
      && !item.summaryAr
      && Boolean(item.summary)
      && this.summaryMode !== 'off'
      && (this.summaryMode === 'all' || item.breaking || (Number(item.importance) || 0) >= 62);

    if (needsTitle || wantsSummary) {
      let titleOk = Boolean(item.titleAr);
      let summaryOk = Boolean(item.summaryAr);

      if (needsTitle) {
        const res = await this.translator.translate(item.title);
        if (res.ok && res.text) {
          patch.titleAr = res.text;
          titleOk = true;
          this.stats.translated += 1;
        }
      }

      if (wantsSummary && titleOk) {
        const res = await this.translator.translate(item.summary);
        if (res.ok && res.text) {
          patch.summaryAr = res.text;
          summaryOk = true;
        }
      }

      if (item.lang !== 'ar') {
        patch.translation = {
          status: titleOk ? (summaryOk || !wantsSummary ? 'done' : 'partial') : 'failed',
          at: Date.now(),
        };
      }
      didWork = true;
    } else if (item.lang !== 'ar' && item.translation?.status === 'pending') {
      patch.translation = {
        status: this.translator?.enabled ? 'queued' : 'disabled',
        at: Date.now(),
      };
      didWork = true;
    }

    if (!didWork) {
      this.stats.skipped += 1;
    } else {
      this.store.updateNews(id, patch);
      this.stats.processed += 1;
    }

    // الصور تُعالَج بشكل منفصل تمامًا عن الترجمة.
    // السبب: جلب og:image محدود بـ30 طلبًا/دقيقة، وإبقاؤه داخل نفس المهمة
    // كان يجمّد طابور الترجمة لعدة دقائق عند بدء بارد.
    if (!item.image && item.url && this.enricher?.enabled && this.enrichQueued < this.enrichLimit) {
      this.#enrich(id, item.url);
    }
  }

  #enrich(id, url) {
    this.enrichQueued += 1;
    this.enricher.enrich(url)
      .then((image) => {
        if (!image) return;
        this.store.updateNews(id, { image, imageSource: 'og', enriched: true });
        this.stats.enriched += 1;
      })
      .catch((err) => this.logger?.warn(`إثراء الصورة (${id}): ${err.message}`))
      .finally(() => {
        this.enrichQueued = Math.max(0, this.enrichQueued - 1);
      });
  }
}

export function pipelineEnabled() {
  return envBool('NEWS_PIPELINE_ENABLED', true);
}
