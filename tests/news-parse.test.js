import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, stripHtml, decodeEntities, classifyNews, extractImage } from '../src/news-parse.js';

test('decodeEntities handles named, decimal, and hex entities', () => {
  assert.equal(decodeEntities('A &amp; B &lt; C &#39;x&#39; &#x1F680;'), 'A & B < C \'x\' 🚀');
});

test('stripHtml removes CDATA and tags', () => {
  const html = '<![CDATA[<p>Hello <b>world</b> &amp; friends</p>]]>';
  assert.equal(stripHtml(html), 'Hello world & friends');
});

test('parseFeed extracts RSS items and cleans Google News source suffix', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item>
      <title><![CDATA[Bitcoin jumps 5% - CoinDesk]]></title>
      <link>https://example.com/a</link>
      <source url="https://coindesk.com">CoinDesk</source>
      <description><![CDATA[<p>BTC &amp; ETH move.</p>]]></description>
      <pubDate>Wed, 29 Oct 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Gold steady</title>
      <link>https://example.com/b</link>
      <description>No change</description>
      <pubDate>Wed, 29 Oct 2026 09:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;
  const items = parseFeed(xml, { id: 'g', name: 'Google News', cls: 'crypto', lang: 'en' });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Bitcoin jumps 5%');
  assert.equal(items[0].source, 'CoinDesk');
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items[0].cls, 'crypto');
  assert.equal(items[1].cls, 'gold');
  assert.ok(items[0].ts > 0);
  assert.match(items[0].id, /^n-[a-f0-9]{16}$/);
});

test('parseFeed supports Atom entries and author names', () => {
  const xml = `<?xml version="1.0"?><feed>
    <entry>
      <title>Oil rises after OPEC cut</title>
      <link rel="alternate" href="https://example.com/oil"/>
      <author><name>Energy Desk</name></author>
      <summary>Brent and WTI climb.</summary>
      <updated>2026-10-29T11:30:00Z</updated>
    </entry>
  </feed>`;
  const items = parseFeed(xml, { id: 'atom', name: 'Atom', cls: 'general', lang: 'en' });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Oil rises after OPEC cut');
  assert.equal(items[0].url, 'https://example.com/oil');
  assert.equal(items[0].source, 'Energy Desk');
  assert.equal(items[0].cls, 'energy');
});

test('classifyNews prioritizes the strongest topic', () => {
  assert.equal(classifyNews('Bitcoin ETF approval sends BTC higher'), 'crypto');
  assert.equal(classifyNews('Gold price hits record high'), 'gold');
  assert.equal(classifyNews('OPEC cuts oil production'), 'energy');
  assert.equal(classifyNews('Federal Reserve inflation data'), 'macro');
  assert.equal(classifyNews('Local weather today', 'general'), 'general');
});

test('classifyNews recognizes technology and AI headlines', () => {
  assert.equal(classifyNews('Nvidia unveils new AI chip for data centers'), 'tech');
  assert.equal(classifyNews('OpenAI launches a new model'), 'tech');
  assert.equal(classifyNews('أسهم التكنولوجيا ترتفع مع طلب الذكاء الاصطناعي'), 'tech');
});

test('extractImage reads media:content, media:thumbnail, enclosure, and inline img', () => {
  const media = '<item><media:content url="https://cdn.example.com/a.jpg" type="image/jpeg" /></item>';
  assert.equal(extractImage(media), 'https://cdn.example.com/a.jpg');

  const thumb = '<item><media:thumbnail url="https://cdn.example.com/b.png" /></item>';
  assert.equal(extractImage(thumb), 'https://cdn.example.com/b.png');

  const enclosure = '<item><enclosure url="https://cdn.example.com/c.webp" type="image/webp" /></item>';
  assert.equal(extractImage(enclosure), 'https://cdn.example.com/c.webp');

  const inline = '<item><description><![CDATA[<p><img src="/d.jpg" /></p>]]></description></item>';
  assert.equal(extractImage(inline, 'https://news.example.com/story'), 'https://news.example.com/d.jpg');

  assert.equal(extractImage('<item><description>no image</description></item>'), '');
});

test('parseFeed attaches an image field to items', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item>
      <title>AI chip demand surges</title>
      <link>https://example.com/tech</link>
      <description>Data center orders rise.</description>
      <media:content url="https://cdn.example.com/chip.jpg" type="image/jpeg" />
      <pubDate>Wed, 29 Oct 2026 10:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;
  const items = parseFeed(xml, { id: 't', name: 'Tech', cls: 'tech', lang: 'en' });
  assert.equal(items.length, 1);
  assert.equal(items[0].image, 'https://cdn.example.com/chip.jpg');
  assert.equal(items[0].cls, 'tech');
});
