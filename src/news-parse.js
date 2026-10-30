// تحليل RSS/Atom بدون مكتبات: يستخرج العناصر وينظّف النصوص ويصنّفها.
import { createHash } from 'node:crypto';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®',
  trade: '™', euro: '€', pound: '£', yen: '¥', times: '×', middot: '·',
  bull: '•', deg: '°',
};

export function decodeEntities(input) {
  return String(input || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    const value = ENTITIES[body.toLowerCase()];
    return value === undefined ? match : value;
  });
}

export function stripHtml(input) {
  return decodeEntities(
    String(input || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
    const match = block.match(re);
    if (match) return match[1];
  }
  return '';
}

function extractLink(block) {
  const rss = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
  if (rss) {
    const value = stripHtml(rss[1]);
    if (value) return value;
  }
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return decodeEntities(atom[1]);
  return '';
}

function parseDate(raw) {
  const text = stripHtml(raw);
  if (!text) return Date.now();
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return Date.now();
  const now = Date.now();
  return Math.min(parsed, now + 60_000);
}

function safeId(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function resolveMediaUrl(raw, baseUrl = '') {
  const value = decodeEntities(raw).replace(/&amp;/g, '&').trim();
  if (!value || /^(data|javascript|file):/i.test(value)) return '';
  try {
    const url = new URL(value, baseUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href.slice(0, 2048);
  } catch {
    return '';
  }
}

function attr(tagText, name) {
  const match = String(tagText).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1] || '';
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

// يستخرج صورة من عنصر RSS: media:content / media:thumbnail / enclosure / <img>.
export function extractImage(block, baseUrl = '') {
  const text = String(block || '');

  const mediaTags = [...text.matchAll(/<media:content\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of mediaTags) {
    const type = attr(tag, 'type').toLowerCase();
    const medium = attr(tag, 'medium').toLowerCase();
    const url = attr(tag, 'url');
    if (!url) continue;
    if (type && !type.startsWith('image/') && medium !== 'image') continue;
    const resolved = resolveMediaUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  const thumbs = [...text.matchAll(/<media:thumbnail\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of thumbs) {
    const resolved = resolveMediaUrl(attr(tag, 'url'), baseUrl);
    if (resolved) return resolved;
  }

  const enclosures = [...text.matchAll(/<enclosure\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of enclosures) {
    const type = attr(tag, 'type').toLowerCase();
    const url = attr(tag, 'url');
    if (!url) continue;
    if (type && !type.startsWith('image/') && !IMAGE_EXT_RE.test(url)) continue;
    const resolved = resolveMediaUrl(url, baseUrl);
    if (resolved) return resolved;
  }

  const inline = text.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (inline) {
    const resolved = resolveMediaUrl(inline[1], baseUrl);
    if (resolved) return resolved;
  }

  const rssImage = text.match(/<image\b[\s\S]*?<url>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i);
  if (rssImage) {
    const resolved = resolveMediaUrl(stripHtml(rssImage[1]), baseUrl);
    if (resolved) return resolved;
  }

  return '';
}

const CLASS_PATTERNS = {
  crypto: [
    /\bbitcoin\b/i, /\bbtc\b/i, /\bethereum\b/i, /\beth\b/i, /\bcrypto\w*/i,
    /\bblockchain\b/i, /\bstablecoin\w*/i, /\bdefi\b/i, /\bbinance\b/i,
    /\bcoinbase\b/i, /\bsolana\b/i, /\bxrp\b/i, /\bdogecoin\b/i, /\bnft\b/i,
    /بيتكوين/, /إيثيريوم/, /ايثيريوم/, /عملات?\s+رقمي/, /عملة\s+مشفرة/,
    /كريبتو/, /بلوكشين/, /تشفير/, /عملات\s+مشفرة/,
  ],
  gold: [
    /\bgold\b/i, /\bxau\b/i, /\bsilver\b/i, /\bxag\b/i, /\bbullion\b/i,
    /\bprecious metals?\b/i, /ذهب/, /فضة/, /أونصة/, /اونصة/, /معادن\s+نفيسة/,
  ],
  energy: [
    /\boil\b/i, /\bcrude\b/i, /\bbrent\b/i, /\bwti\b/i, /\bopec\b/i,
    /\bnatural gas\b/i, /\bgasoline\b/i, /\benergy\b/i, /\brefiner\w*/i,
    /نفط/, /خام/, /برنت/, /أوبك/, /اوبك/, /غاز/, /طاقة/, /وقود/, /مشتقات/,
  ],
  tech: [
    /\bnvidia\b/i, /\bnvda\b/i, /\bmicrosoft\b/i, /\bmsft\b/i,
    /\bapple\b/i, /\baapl\b/i, /\biphone\b/i, /\bgoogle\b/i, /\balphabet\b/i,
    /\bgoogl\b/i, /\bamazon\b/i, /\bamzn\b/i, /\bmeta\b/i, /\btesla\b/i,
    /\btsla\b/i, /\bamd\b/i, /\bbroadcom\b/i, /\bavgo\b/i, /\btsmc\b/i,
    /\bpalantir\b/i, /\boracle\b/i, /\bopenai\b/i, /\bchatgpt\b/i,
    /\bartificial intelligence\b/i, /\bA\.I\.\b/, /\bAI\b/,
    /\bsemiconductor\w*/i, /\bchip(s|maker|set)?\b/i, /\bdata cent(er|re)\b/i,
    /\bcloud\b/i, /\brobot\w*/i, /\bmachine learning\b/i, /\bgenerative\b/i,
    /الذكاء\s+الاصطناعي/, /إنفيديا/, /انفيديا/, /مايكروسوفت/, /أبل/, /ابل/,
    /جوجل/, /أمازون/, /ميتا/, /تسلا/, /شرائح/, /رقائق/, /تقنية/, /تكنولوجيا/,
    /سحابة/, /روبوت/, /تعلم\s+الآلة/,
  ],
  macro: [
    /\bfed\b/i, /\bfederal reserve\b/i, /\binflation\b/i, /\bcpi\b/i,
    /\binterest rates?\b/i, /\bdollar\b/i, /\btreasury\b/i, /\beconomy\b/i,
    /\brecession\b/i, /الفيدرالي/, /التضخم/, /الفائدة/, /الدولار/,
    /الاقتصاد/, /الركود/, /الخزانة/, /أسواق\s+المال/,
  ],
};

export function classifyNews(text, fallback = 'general') {
  const value = String(text || '');
  const scores = {};
  for (const [cls, patterns] of Object.entries(CLASS_PATTERNS)) {
    let score = 0;
    for (const re of patterns) {
      const matches = value.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
      if (matches) score += matches.length;
    }
    scores[cls] = score;
  }
  const max = Math.max(0, ...Object.values(scores));
  if (max === 0) return fallback;
  const tied = Object.entries(scores).filter(([, score]) => score === max).map(([cls]) => cls);
  if (fallback && tied.includes(fallback)) return fallback;
  for (const cls of ['gold', 'energy', 'crypto', 'tech', 'macro']) {
    if (tied.includes(cls)) return cls;
  }
  return fallback;
}

export function parseFeed(xml, feed = {}) {
  const text = String(xml || '');
  let blocks = [...text.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  if (!blocks.length) {
    blocks = [...text.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  }
  const limit = Number(feed.limit) > 0 ? Number(feed.limit) : 30;
  const items = [];

  for (const block of blocks.slice(0, limit)) {
    let title = stripHtml(extractTag(block, ['title']));
    if (!title) continue;
    const link = extractLink(block);
    const sourceTag = stripHtml(extractTag(block, ['source']));
    const authorTag = stripHtml(extractTag(block, ['name', 'author']));
    const source = sourceTag || authorTag || feed.name || 'مصدر غير معروف';
    if (sourceTag && title.toLowerCase().endsWith(` - ${sourceTag.toLowerCase()}`)) {
      title = title.slice(0, -(sourceTag.length + 3)).trim();
    }
    const summaryRaw = extractTag(block, ['description', 'summary', 'content']);
    const summary = stripHtml(summaryRaw).slice(0, 500);
    const ts = parseDate(extractTag(block, ['pubDate', 'published', 'updated', 'dc:date', 'date']));
    const cls = classifyNews(`${title} ${summary}`, feed.cls || 'general');
    const url = link || '';
    const image = extractImage(block, url || feed.url || '');
    items.push({
      id: `n-${safeId(url || title)}`,
      title: title.slice(0, 300),
      url,
      source: source.slice(0, 120),
      feedId: feed.id || '',
      feedName: feed.name || '',
      cls,
      lang: feed.lang || 'en',
      summary,
      image,
      ts,
      via: feed.kind || (feed.id?.startsWith('reddit') ? 'reddit' : 'rss'),
    });
  }
  return items;
}
