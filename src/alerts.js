// محرك التنبيهات: حركة سعرية، اختراق حدود، تقلّب غير طبيعي، وأخبار مؤثرة.
import { MOVE_RULES, SENSITIVITY, VOLATILITY_RULE } from './config.js';
import { formatDuration, formatPct, formatPrice } from './format.js';

const MOVE_COOLDOWN_MS = 8 * 60 * 1000;
const THRESHOLD_COOLDOWN_MS = 30 * 60 * 1000;
const VOL_COOLDOWN_MS = VOLATILITY_RULE.cooldownMs;
const NEWS_KEYWORD_COOLDOWN_MS = 10 * 60 * 1000;
const NEWS_RATE = { max: 10, hardMax: 20, windowMs: 5 * 60 * 1000 };

const HIGH_RULES = [
  {
    label: 'اختراق/سرقة',
    re: /\b(hack(ed|ing)?|exploit(ed)?|breach(ed)?|stolen|theft|heist|robbery|cyber ?attack|under attack|attack on)\b|اختراق|سرقة|استغلال ثغرة|هجوم سيبراني/i,
  },
  {
    label: 'موافقة تنظيمية',
    re: /\bsec\b.{0,50}\b(approv|etf|greenlight)\w*|\betf\b.{0,30}\b(approv|launch|greenlight)\w*|موافقة تنظيمية|الموافقة على/i,
  },
  {
    label: 'إفلاس/تصفية',
    re: /\b(bankrupt(cy)?|insolven(cy|t)|liquidation)\b|إفلاس|تصفية/i,
  },
  {
    label: 'توتر جيوسياسي',
    re: /\b(war|invasion|airstrike|missile attack|military strike|geopolitical)\b|حرب|غزو|ضربة عسكرية|صاروخ/i,
  },
  {
    label: 'عقوبات',
    re: /\b(sanctions?|embargo)\b|عقوبات|حظر نفطي/i,
  },
  {
    label: 'قرار أوبك',
    re: /\bopec\+?\b.{0,60}\b(cut|reduce|increase|raise|output)\b|\b(cut|reduce|increase|raise)\b.{0,40}\bproduction\b|خفض الإنتاج|تخفيض الإنتاج|زيادة الإنتاج/i,
  },
  {
    label: 'قرار فائدة',
    re: /\b(rate cut|rate hike|cut rates?|raise rates?|hike rates?)\b|تخفيض الفائدة|رفع الفائدة/i,
  },
  {
    label: 'إيقاف/طارئ',
    re: /\b(trading halt(ed)?|halted trading|emergency meeting|suspends? trading)\b|إيقاف التداول|تعليق التداول|اجتماع طارئ/i,
  },
  {
    label: 'حظر',
    re: /\b(bans?|banned|banning)\b.{0,30}\b(crypto|bitcoin|oil|export|import)\b|حظر (التعدين|التداول|العملات|تصدير|استيراد)/i,
  },
  {
    label: 'تخلف عن السداد',
    re: /\b(default(ed|s)? on debt|debt default|sovereign default)\b|تخلف عن السداد/i,
  },
  {
    label: 'انهيار حاد',
    re: /\b(flash crash|market crash|plunge[sd]?|collapse[sd]?|sell-?off)\b|انهيار|هبوط حاد|بيع كثيف/i,
  },
];

const MEDIUM_RULES = [
  { label: 'الفيدرالي', re: /\b(fed|federal reserve|fomc)\b|الفيدرالي|الاحتياطي الفيدرالي/i },
  { label: 'التضخم', re: /\b(inflation|cpi|ppi)\b|التضخم|الأسعار الاستهلاكية/i },
  { label: 'أوبك', re: /\bopec\+?\b|أوبك/i },
  { label: 'الوظائف', re: /\b(nonfarm|jobs report|unemployment|payrolls)\b|الوظائف|البطالة/i },
  { label: 'الأرباح', re: /\b(earnings|quarterly results|guidance)\b|الأرباح|نتائج الأعمال/i },
  { label: 'تنظيم', re: /\b(regulation|regulatory|lawsuit|sec sues?|court ruling)\b|تنظيم|دعوى|حكم قضائي/i },
  { label: 'ETF', re: /\betf\b|صندوق مؤشر|صناديق مؤشرة/i },
  { label: 'مستوى قياسي', re: /\b(all-time high|record high|record low|multi-year high)\b|أعلى مستوى|أدنى مستوى|قياسي/i },
  { label: 'الدولار', re: /\b(dollar index|dxy|greenback)\b|مؤشر الدولار|الدولار الأمريكي/i },
  { label: 'الطاقة', re: /\b(crude|brent|wti|natural gas|inventories|rig count)\b|النفط|الغاز|المخزونات/i },
];

export function scoreNews(item) {
  const text = `${item?.title || ''} ${item?.summary || ''}`;
  const high = HIGH_RULES.filter((r) => r.re.test(text)).map((r) => r.label);
  if (high.length) return { severity: 'high', labels: high };
  const medium = MEDIUM_RULES.filter((r) => r.re.test(text)).map((r) => r.label);
  if (medium.length >= 2) return { severity: 'medium', labels: medium };
  if (medium.length === 1) return { severity: 'low', labels: medium };
  return { severity: null, labels: [] };
}

export class AlertEngine {
  constructor(store, settingsStore, { notifier = null, logger = null } = {}) {
    this.store = store;
    this.settings = settingsStore;
    this.notifier = notifier;
    this.logger = logger;
    this.lastMoveEval = new Map();
    this.lastVolEval = new Map();
    this.cooldowns = new Map();
    this.newsAlertIds = new Set();
    this.newsAlertTimes = [];
    this.newsKeywordCooldowns = new Map();
  }

  #cooldown(key, ms, now = Date.now()) {
    const until = this.cooldowns.get(key) || 0;
    if (until > now) return false;
    this.cooldowns.set(key, now + ms);
    return true;
  }

  #emit(alert) {
    const saved = this.store.addAlert(alert);
    if (saved && this.notifier) {
      Promise.resolve()
        .then(() => this.notifier.notify(saved))
        .catch((err) => this.logger?.warn(`فشل إرسال إشعار خارجي: ${err.message}`));
    }
    return saved;
  }

  #multiplier() {
    const sensitivity = this.settings.get().sensitivity;
    return SENSITIVITY[sensitivity]?.multiplier ?? 1;
  }

  onTick(asset) {
    if (!asset || !Number.isFinite(asset.price)) return;
    const now = Date.now();
    const lastMove = this.lastMoveEval.get(asset.id) || 0;
    if (now - lastMove >= 5000) {
      this.lastMoveEval.set(asset.id, now);
      this.#checkMoves(asset, now);
    }
    const lastVol = this.lastVolEval.get(asset.id) || 0;
    if (now - lastVol >= 15000) {
      this.lastVolEval.set(asset.id, now);
      this.#checkVolatility(asset, now);
    }
    this.#checkThresholds(asset, now);
  }

  #checkMoves(asset, now) {
    const series = asset.series;
    if (series.length < 2) return;
    const current = series[series.length - 1];
    const multiplier = this.#multiplier();
    const rules = MOVE_RULES[asset.cls] || MOVE_RULES.crypto;

    for (const rule of rules) {
      const target = current.t - rule.seconds * 1000;
      if (series[0].t > target + 1500) continue;
      let ref = null;
      for (let i = series.length - 1; i >= 0; i -= 1) {
        if (series[i].t <= target) {
          ref = series[i];
          break;
        }
      }
      if (!ref || ref.p <= 0) continue;
      const pct = ((current.p - ref.p) / ref.p) * 100;
      const threshold = rule.pct * multiplier;
      if (Math.abs(pct) < threshold) continue;
      if (!this.#cooldown(`${asset.id}:move:${rule.seconds}`, MOVE_COOLDOWN_MS, now)) continue;

      const abs = Math.abs(pct);
      const severity = abs >= threshold * 2 || (rule.seconds >= 900 && abs >= threshold * 1.5)
        ? 'high'
        : 'medium';
      const direction = pct > 0 ? 'قفزة' : 'هبوط';
      this.#emit({
        ts: now,
        severity,
        kind: 'price_move',
        assetId: asset.id,
        title: `${asset.name}: ${direction} ${formatPct(pct)} خلال ${formatDuration(rule.seconds)}`,
        body: `السعر الآن ${formatPrice(current.p, asset.decimals)} ${asset.unit} — كان ${formatPrice(ref.p, asset.decimals)} قبل ${formatDuration(rule.seconds)}.`,
        source: 'رادار السوق · محرك الأسعار',
        data: {
          assetId: asset.id,
          symbol: asset.symbol,
          windowSeconds: rule.seconds,
          pct: Number(pct.toFixed(4)),
          price: current.p,
          refPrice: ref.p,
          thresholdPct: Number(threshold.toFixed(4)),
        },
      });
    }
  }

  #checkVolatility(asset, now) {
    const series = asset.series;
    if (series.length < 10) return;
    const shortStart = now - VOLATILITY_RULE.shortWindowMs;
    const baselineStart = now - VOLATILITY_RULE.baselineWindowMs;
    const short = series.filter((p) => p.t >= shortStart);
    const baseline = series.filter((p) => p.t >= baselineStart && p.t < shortStart);
    if (short.length < 3 || baseline.length < 6) return;

    const rangePct = (points) => {
      const values = points.map((p) => p.p).filter((v) => Number.isFinite(v) && v > 0);
      if (values.length < 2) return null;
      const min = Math.min(...values);
      const max = Math.max(...values);
      return min > 0 ? ((max - min) / min) * 100 : null;
    };

    const currentRange = rangePct(short);
    if (currentRange === null) return;

    const buckets = [];
    const bucketMs = 5 * 60 * 1000;
    for (let start = baselineStart; start < shortStart; start += bucketMs) {
      const end = Math.min(start + bucketMs, shortStart);
      const points = baseline.filter((p) => p.t >= start && p.t < end);
      const range = rangePct(points);
      if (range !== null) buckets.push(range);
    }
    if (buckets.length < 3) return;
    const avgRange = buckets.reduce((a, b) => a + b, 0) / buckets.length;
    if (avgRange <= 0) return;

    const multiplier = this.#multiplier();
    const minRange = (VOLATILITY_RULE.minRangePct[asset.cls] ?? 0.1) * multiplier;
    const ratio = currentRange / avgRange;
    if (currentRange < minRange || ratio < VOLATILITY_RULE.ratio) return;
    if (!this.#cooldown(`${asset.id}:volatility`, VOL_COOLDOWN_MS, now)) return;

    const severity = ratio >= 5 || currentRange >= minRange * 2 ? 'high' : 'medium';
    this.#emit({
      ts: now,
      severity,
      kind: 'volatility',
      assetId: asset.id,
      title: `تقلّب غير طبيعي في ${asset.name}`,
      body: `نطاق الحركة خلال 5 دقائق ${currentRange.toFixed(2)}% مقابل متوسط ${avgRange.toFixed(2)}% (×${ratio.toFixed(1)}). السعر ${formatPrice(asset.price, asset.decimals)} ${asset.unit}.`,
      source: 'رادار السوق · كاشف التقلّب',
      data: {
        assetId: asset.id,
        symbol: asset.symbol,
        currentRangePct: Number(currentRange.toFixed(4)),
        averageRangePct: Number(avgRange.toFixed(4)),
        ratio: Number(ratio.toFixed(2)),
      },
    });
  }

  #checkThresholds(asset, now) {
    const rules = this.settings.get().priceAlerts?.[asset.id];
    if (!rules) return;
    const price = asset.price;
    const prev = asset.prevPrice;
    if (!Number.isFinite(price) || !Number.isFinite(prev)) return;

    if (Number.isFinite(rules.above) && prev < rules.above && price >= rules.above) {
      if (!this.#cooldown(`${asset.id}:threshold:above`, THRESHOLD_COOLDOWN_MS, now)) return;
      this.#emit({
        ts: now,
        severity: 'high',
        kind: 'threshold',
        assetId: asset.id,
        title: `اختراق حد السعر: ${asset.name} فوق ${formatPrice(rules.above, asset.decimals)}`,
        body: `تجاوز السعر الحد المحدد. السعر الحالي ${formatPrice(price, asset.decimals)} ${asset.unit}.`,
        source: 'رادار السوق · حد سعري',
        data: { assetId: asset.id, threshold: rules.above, direction: 'above', price },
      });
    }

    if (Number.isFinite(rules.below) && prev > rules.below && price <= rules.below) {
      if (!this.#cooldown(`${asset.id}:threshold:below`, THRESHOLD_COOLDOWN_MS, now)) return;
      this.#emit({
        ts: now,
        severity: 'high',
        kind: 'threshold',
        assetId: asset.id,
        title: `اختراق حد السعر: ${asset.name} تحت ${formatPrice(rules.below, asset.decimals)}`,
        body: `كسر السعر الحد المحدد. السعر الحالي ${formatPrice(price, asset.decimals)} ${asset.unit}.`,
        source: 'رادار السوق · حد سعري',
        data: { assetId: asset.id, threshold: rules.below, direction: 'below', price },
      });
    }
  }

  onNews(item) {
    if (!item || !this.settings.get().newsAlerts) return;
    if (this.newsAlertIds.has(item.id)) return;
    const score = scoreNews(item);
    if (!score.severity) return;

    const now = Date.now();
    this.newsAlertTimes = this.newsAlertTimes.filter((t) => now - t < NEWS_RATE.windowMs);
    if (this.newsAlertTimes.length >= NEWS_RATE.hardMax) return;
    if (score.severity !== 'high' && this.newsAlertTimes.length >= NEWS_RATE.max) return;

    const available = score.labels.filter((label) => {
      const until = this.newsKeywordCooldowns.get(label) || 0;
      return until <= now;
    });
    if (!available.length) return;

    this.newsAlertIds.add(item.id);
    if (this.newsAlertIds.size > 2000) {
      const first = this.newsAlertIds.values().next().value;
      this.newsAlertIds.delete(first);
    }
    for (const label of available) {
      this.newsKeywordCooldowns.set(label, now + NEWS_KEYWORD_COOLDOWN_MS);
    }
    this.newsAlertTimes.push(now);

    this.#emit({
      ts: now,
      severity: score.severity,
      kind: 'news',
      title: item.title,
      body: `مصدر: ${item.source}${score.labels.length ? ` · مؤشرات: ${score.labels.join('، ')}` : ''}`,
      url: item.url,
      source: item.source,
      data: { newsId: item.id, cls: item.cls, labels: score.labels, via: item.via },
    });
  }

  testAlert() {
    return this.#emit({
      ts: Date.now(),
      severity: 'high',
      kind: 'test',
      title: 'تنبيه تجريبي — رادار السوق يعمل',
      body: 'هذا تنبيه اختباري للتأكد من وصول التنبيهات إلى مركز التنبيهات وقنوات الإشعار.',
      source: 'رادار السوق',
      data: { test: true },
    });
  }
}
