// إعدادات المنصة الثابتة: الأصول، مصادر الأخبار، وحدود التنبيه.
// كل النصوص الظاهرة للمستخدم عربية، مع إبقاء الرموز والمصطلحات التقنية كما هي.

export const APP_NAME = 'رادار السوق';
export const APP_VERSION = '1.1.0';

export const ASSET_CLASSES = {
  crypto: { label: 'العملات الرقمية', short: 'كريبتو', color: '#f0b90b' },
  gold: { label: 'الذهب والمعادن', short: 'ذهب', color: '#e8c15a' },
  energy: { label: 'الطاقة', short: 'طاقة', color: '#4cc9f0' },
  tech: { label: 'أسهم التكنولوجيا والذكاء الاصطناعي', short: 'تقنية', color: '#7dd3fc' },
  macro: { label: 'المؤشرات الكلية', short: 'مؤشرات', color: '#a78bfa' },
};

// id يُستخدم في الواجهة والـAPI، src هو رمز المصدر لدى المزوّد.
export const ASSETS = [
  {
    id: 'BTCUSDT', symbol: 'BTC/USDT', name: 'بيتكوين', short: 'BTC',
    cls: 'crypto', source: 'binance', src: 'BTCUSDT', decimals: 2, unit: 'USDT',
  },
  {
    id: 'ETHUSDT', symbol: 'ETH/USDT', name: 'إيثيريوم', short: 'ETH',
    cls: 'crypto', source: 'binance', src: 'ETHUSDT', decimals: 2, unit: 'USDT',
  },
  {
    id: 'SOLUSDT', symbol: 'SOL/USDT', name: 'سولانا', short: 'SOL',
    cls: 'crypto', source: 'binance', src: 'SOLUSDT', decimals: 2, unit: 'USDT',
  },
  {
    id: 'BNBUSDT', symbol: 'BNB/USDT', name: 'BNB', short: 'BNB',
    cls: 'crypto', source: 'binance', src: 'BNBUSDT', decimals: 2, unit: 'USDT',
  },
  {
    id: 'XRPUSDT', symbol: 'XRP/USDT', name: 'ريبل', short: 'XRP',
    cls: 'crypto', source: 'binance', src: 'XRPUSDT', decimals: 4, unit: 'USDT',
  },
  {
    id: 'DOGEUSDT', symbol: 'DOGE/USDT', name: 'دوجكوين', short: 'DOGE',
    cls: 'crypto', source: 'binance', src: 'DOGEUSDT', decimals: 5, unit: 'USDT',
  },
  {
    id: 'XAUUSD', symbol: 'XAU/USD', name: 'الذهب', short: 'XAU',
    cls: 'gold', source: 'yahoo', src: 'GC=F', decimals: 2, unit: 'USD',
    note: 'عقود COMEX الآجلة (GC=F)',
  },
  {
    id: 'XAGUSD', symbol: 'XAG/USD', name: 'الفضة', short: 'XAG',
    cls: 'gold', source: 'yahoo', src: 'SI=F', decimals: 3, unit: 'USD',
    note: 'عقود COMEX الآجلة (SI=F)',
  },
  {
    id: 'WTI', symbol: 'WTI', name: 'خام غرب تكساس', short: 'WTI',
    cls: 'energy', source: 'yahoo', src: 'CL=F', decimals: 2, unit: 'USD',
    note: 'عقود NYMEX الآجلة (CL=F)',
  },
  {
    id: 'BRENT', symbol: 'BRENT', name: 'خام برنت', short: 'BRENT',
    cls: 'energy', source: 'yahoo', src: 'BZ=F', decimals: 2, unit: 'USD',
    note: 'عقود ICE الآجلة (BZ=F)',
  },
  {
    id: 'NG', symbol: 'NG', name: 'الغاز الطبيعي', short: 'NG',
    cls: 'energy', source: 'yahoo', src: 'NG=F', decimals: 3, unit: 'USD',
    note: 'عقود NYMEX الآجلة (NG=F)',
  },
  // ===== أسهم التكنولوجيا والذكاء الاصطناعي =====
  // المصدر: Yahoo Finance chart (v8). الأسعار بالدولار الأمريكي وقد تتأخر حسب الجلسة.
  {
    id: 'NVDA', symbol: 'NVDA', name: 'إنفيديا', short: 'NVDA',
    cls: 'tech', source: 'yahoo', src: 'NVDA', decimals: 2, unit: 'USD',
    note: 'NVIDIA · شرائح الذكاء الاصطناعي',
  },
  {
    id: 'MSFT', symbol: 'MSFT', name: 'مايكروسوفت', short: 'MSFT',
    cls: 'tech', source: 'yahoo', src: 'MSFT', decimals: 2, unit: 'USD',
    note: 'Microsoft · السحابة والذكاء الاصطناعي',
  },
  {
    id: 'AAPL', symbol: 'AAPL', name: 'أبل', short: 'AAPL',
    cls: 'tech', source: 'yahoo', src: 'AAPL', decimals: 2, unit: 'USD',
    note: 'Apple · الأجهزة والخدمات',
  },
  {
    id: 'GOOGL', symbol: 'GOOGL', name: 'ألفابت / جوجل', short: 'GOOGL',
    cls: 'tech', source: 'yahoo', src: 'GOOGL', decimals: 2, unit: 'USD',
    note: 'Alphabet · البحث وGemini',
  },
  {
    id: 'AMZN', symbol: 'AMZN', name: 'أمازون', short: 'AMZN',
    cls: 'tech', source: 'yahoo', src: 'AMZN', decimals: 2, unit: 'USD',
    note: 'Amazon · AWS والذكاء الاصطناعي',
  },
  {
    id: 'META', symbol: 'META', name: 'ميتا', short: 'META',
    cls: 'tech', source: 'yahoo', src: 'META', decimals: 2, unit: 'USD',
    note: 'Meta · المنصات ونماذج Llama',
  },
  {
    id: 'TSLA', symbol: 'TSLA', name: 'تسلا', short: 'TSLA',
    cls: 'tech', source: 'yahoo', src: 'TSLA', decimals: 2, unit: 'USD',
    note: 'Tesla · السيارات الكهربائية والقيادة الذاتية',
  },
  {
    id: 'AMD', symbol: 'AMD', name: 'إيه إم دي', short: 'AMD',
    cls: 'tech', source: 'yahoo', src: 'AMD', decimals: 2, unit: 'USD',
    note: 'AMD · المعالجات ومسرّعات AI',
  },
  {
    id: 'AVGO', symbol: 'AVGO', name: 'برودكوم', short: 'AVGO',
    cls: 'tech', source: 'yahoo', src: 'AVGO', decimals: 2, unit: 'USD',
    note: 'Broadcom · شرائح الشبكات والذكاء الاصطناعي',
  },
  {
    id: 'TSM', symbol: 'TSM', name: 'تي إس إم سي', short: 'TSM',
    cls: 'tech', source: 'yahoo', src: 'TSM', decimals: 2, unit: 'USD',
    note: 'TSMC · تصنيع الشرائح',
  },
  {
    id: 'PLTR', symbol: 'PLTR', name: 'بالانتير', short: 'PLTR',
    cls: 'tech', source: 'yahoo', src: 'PLTR', decimals: 2, unit: 'USD',
    note: 'Palantir · تحليلات الذكاء الاصطناعي',
  },
  {
    id: 'ORCL', symbol: 'ORCL', name: 'أوراكل', short: 'ORCL',
    cls: 'tech', source: 'yahoo', src: 'ORCL', decimals: 2, unit: 'USD',
    note: 'Oracle · قواعد البيانات والسحابة',
  },
  {
    id: 'DXY', symbol: 'DXY', name: 'مؤشر الدولار', short: 'DXY',
    cls: 'macro', source: 'yahoo', src: 'DX-Y.NYB', decimals: 3, unit: 'نقطة',
    note: 'مؤشر الدولار الأمريكي',
  },
];

export const ASSET_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

export const DEFAULT_SETTINGS = {
  sensitivity: 'balanced', // calm | balanced | sensitive
  newsAlerts: true,
  priceAlerts: {}, // { BTCUSDT: { above: 100000, below: 70000 } }
  updatedAt: 0,
};

// مضاعف العتبة: كلما زادت الحساسية انخفضت عتبة التنبيه.
export const SENSITIVITY = {
  calm: { label: 'هادئ', multiplier: 1.6 },
  balanced: { label: 'متوازن', multiplier: 1.0 },
  sensitive: { label: 'حساس', multiplier: 0.65 },
};

// عتبات الحركة الأساسية (نسبة مئوية) لكل فئة أصل ونافذة زمنية بالثواني.
export const MOVE_RULES = {
  crypto: [
    { seconds: 60, pct: 0.55 },
    { seconds: 300, pct: 1.4 },
    { seconds: 900, pct: 2.2 },
  ],
  gold: [
    { seconds: 60, pct: 0.12 },
    { seconds: 300, pct: 0.32 },
    { seconds: 900, pct: 0.6 },
  ],
  energy: [
    { seconds: 60, pct: 0.25 },
    { seconds: 300, pct: 0.65 },
    { seconds: 900, pct: 1.1 },
  ],
  tech: [
    { seconds: 60, pct: 0.35 },
    { seconds: 300, pct: 0.9 },
    { seconds: 900, pct: 1.5 },
  ],
  macro: [
    { seconds: 60, pct: 0.08 },
    { seconds: 300, pct: 0.2 },
    { seconds: 900, pct: 0.4 },
  ],
};

export const VOLATILITY_RULE = {
  shortWindowMs: 5 * 60 * 1000,
  baselineWindowMs: 35 * 60 * 1000,
  ratio: 3.0,
  minRangePct: { crypto: 0.35, gold: 0.1, energy: 0.2, tech: 0.18, macro: 0.06 },
  cooldownMs: 10 * 60 * 1000,
};

function googleNews(id, name, query, lang, cls, interval = 120000) {
  const hl = lang === 'ar' ? 'ar' : 'en-US';
  const gl = lang === 'ar' ? 'SA' : 'US';
  const ceid = `${gl}:${lang === 'ar' ? 'ar' : 'en'}`;
  return {
    id,
    name,
    cls,
    lang,
    interval,
    kind: 'google',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`,
  };
}

export const NEWS_FEEDS = [
  googleNews('g-ar-crypto', 'Google News · كريبتو', 'بيتكوين OR "عملات رقمية" OR كريبتو', 'ar', 'crypto'),
  googleNews('g-ar-gold', 'Google News · ذهب', 'الذهب OR "سعر الذهب" OR الفضة', 'ar', 'gold'),
  googleNews('g-ar-energy', 'Google News · طاقة', 'النفط OR أوبك OR "أسعار النفط" OR الغاز', 'ar', 'energy'),
  googleNews('g-ar-macro', 'Google News · اقتصاد', 'الفيدرالي OR التضخم OR "أسعار الفائدة" OR الدولار', 'ar', 'macro'),
  googleNews('g-ar-tech', 'Google News · تقنية', 'الذكاء الاصطناعي OR "أسهم التكنولوجيا" OR إنفيديا OR مايكروسوفت OR أبل', 'ar', 'tech'),
  googleNews('g-en-crypto', 'Google News · Crypto', 'bitcoin OR ethereum OR crypto', 'en', 'crypto'),
  googleNews('g-en-gold', 'Google News · Gold', '"gold price" OR gold OR silver', 'en', 'gold'),
  googleNews('g-en-energy', 'Google News · Energy', 'oil OR OPEC OR "natural gas" OR crude', 'en', 'energy'),
  googleNews('g-en-macro', 'Google News · Macro', '"Federal Reserve" OR inflation OR "interest rates"', 'en', 'macro'),
  googleNews('g-en-tech', 'Google News · Tech/AI', 'Nvidia OR Microsoft OR Apple OR "artificial intelligence" OR "AI stocks"', 'en', 'tech'),
  {
    id: 'coindesk', name: 'CoinDesk', cls: 'crypto', lang: 'en', interval: 120000,
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  },
  {
    id: 'cointelegraph', name: 'Cointelegraph', cls: 'crypto', lang: 'en', interval: 120000,
    url: 'https://cointelegraph.com/rss',
  },
  {
    id: 'techcrunch', name: 'TechCrunch', cls: 'tech', lang: 'en', interval: 150000,
    url: 'https://techcrunch.com/feed/',
  },
  {
    id: 'the-verge', name: 'The Verge', cls: 'tech', lang: 'en', interval: 150000,
    url: 'https://www.theverge.com/rss/index.xml',
  },
  {
    id: 'ars-technica', name: 'Ars Technica', cls: 'tech', lang: 'en', interval: 180000,
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
  },
  {
    id: 'hnrss-ai', name: 'Hacker News · AI', cls: 'tech', lang: 'en', interval: 180000,
    url: 'https://hnrss.org/newest?q=AI',
  },
  {
    id: 'bbc-business', name: 'BBC Business', cls: 'macro', lang: 'en', interval: 180000,
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  },
  {
    id: 'aljazeera-business', name: 'الجزيرة · اقتصاد', cls: 'macro', lang: 'ar', interval: 180000,
    url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9',
  },
  {
    id: 'oilprice', name: 'OilPrice', cls: 'energy', lang: 'en', interval: 180000,
    url: 'https://oilprice.com/rss/main',
  },
  {
    id: 'investing-markets', name: 'Investing.com', cls: 'macro', lang: 'en', interval: 180000,
    url: 'https://www.investing.com/rss/news_25.rss',
  },
  {
    id: 'reddit-crypto', name: 'Reddit · r/CryptoCurrency', cls: 'crypto', lang: 'en', interval: 240000,
    url: 'https://www.reddit.com/r/CryptoCurrency/.rss',
  },
  {
    id: 'reddit-bitcoin', name: 'Reddit · r/Bitcoin', cls: 'crypto', lang: 'en', interval: 240000,
    url: 'https://www.reddit.com/r/Bitcoin/.rss',
  },
  {
    id: 'reddit-technology', name: 'Reddit · r/technology', cls: 'tech', lang: 'en', interval: 240000,
    url: 'https://www.reddit.com/r/technology/.rss',
  },
];

// Mastodon: خطوط زمنية عامة للوسوم (بدون مصادقة). تُسحب بفاصل محترم لتفادي الحجب.
export const MASTODON = {
  instance: 'https://mastodon.social',
  interval: 180000,
  limit: 15,
  tags: [
    { tag: 'bitcoin', cls: 'crypto' },
    { tag: 'crypto', cls: 'crypto' },
    { tag: 'gold', cls: 'gold' },
    { tag: 'oil', cls: 'energy' },
    { tag: 'artificialintelligence', cls: 'tech' },
    { tag: 'nvidia', cls: 'tech' },
  ],
};

// الترجمة الآلية: نقطة عامة غير رسمية من Google. تُستخدم فقط عند تفعيلها.
// نستخدم clients5 (نفس محرّك إضافة Chrome) لأنه يقبل عدة نصوص في طلب واحد،
// وهذا يقلل عدد الطلبات كثيرًا ويمنع حجب 429 الذي أصاب نقطة gtx.
// تنبيه خصوصية: نص العنوان/الملخص يُرسل إلى خدمة خارجية.
export const TRANSLATION = {
  endpoint: 'https://clients5.google.com/translate_a/t',
  maxCache: 1500,
  concurrency: 3,
  minIntervalMs: 120,
  maxPerMinute: 90,
  maxChars: 480,
  batchSize: 20,
  maxCharsPerRequest: 1600,
  batchWindowMs: 25,
  timeoutMs: 8000,
  retries: 3,
  retryBaseMs: 1500,
};

// إثراء الصور: قراءة og:image من صفحة الخبر عند غياب صورة في الخلاصة.
export const IMAGE_ENRICH = {
  maxCache: 800,
  concurrency: 3,
  maxPerMinute: 30,
  timeoutMs: 9000,
  maxBytes: 600 * 1024,
  cacheTtlMs: 6 * 60 * 60 * 1000,
};

// روابط بحث يدوية على X — لا يتم كشط X؛ هذه روابط يفتحها المستخدم بنفسه.
export const X_SEARCH_LINKS = [
  { label: '$BTC', url: 'https://x.com/search?q=%24BTC&src=typed_query&f=live' },
  { label: '$ETH', url: 'https://x.com/search?q=%24ETH&src=typed_query&f=live' },
  { label: 'الذهب', url: 'https://x.com/search?q=%D8%A7%D9%84%D8%B0%D9%87%D8%A8&src=typed_query&f=live' },
  { label: 'OPEC', url: 'https://x.com/search?q=OPEC&src=typed_query&f=live' },
  { label: 'Fed', url: 'https://x.com/search?q=Fed+rates&src=typed_query&f=live' },
  { label: 'NVDA', url: 'https://x.com/search?q=%24NVDA&src=typed_query&f=live' },
  { label: 'AI', url: 'https://x.com/search?q=%22artificial+intelligence%22&src=typed_query&f=live' },
];

export const NEWS_CLASS_LABELS = {
  crypto: 'كريبتو',
  gold: 'ذهب',
  energy: 'طاقة',
  tech: 'تقنية',
  macro: 'اقتصاد',
  general: 'عام',
};

export const X_QUERIES = [
  { id: 'x-crypto', query: '(bitcoin OR $BTC OR ethereum OR crypto) -is:retweet lang:en', cls: 'crypto' },
  { id: 'x-gold', query: '(gold OR $XAUUSD OR "gold price") -is:retweet lang:en', cls: 'gold' },
  { id: 'x-energy', query: '(OPEC OR oil OR $WTI OR "natural gas") -is:retweet lang:en', cls: 'energy' },
  { id: 'x-tech', query: '($NVDA OR Nvidia OR "artificial intelligence" OR $MSFT OR OpenAI) -is:retweet lang:en', cls: 'tech' },
  { id: 'x-ar', query: '(بيتكوين OR الذهب OR النفط OR "الذكاء الاصطناعي") -is:retweet lang:ar', cls: 'general' },
];
