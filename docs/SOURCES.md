# مصادر البيانات والأخبار

هذا الملف يوثّق **كل مصدر** تستخدمه المنصة، وفترات السحب، وحدود المعدل، ونتائج الفحص الحي. الهدف هو معرفة ما هو موثوق وما هو هشّ قبل الاعتماد على أي تنبيه.

آخر فحص حي: **2026-10-30** عبر `scripts/check-sources.js` — النتيجة **45/47 ناجح** (وفحص X متخطى لغياب التوكن).

---

## 1. ملخص الفحص الحي

| المؤشر | القيمة |
|---|---|
| إجمالي الفحوص | 47 |
| ناجح | 45 |
| فاشل | 2 |
| متخطى | 1 (X بدون توكن) |
| زمن الاستجابة | 17ms – 1080ms |

**الفشلان:** `Reddit · r/Bitcoin` و`Reddit · r/technology` → `HTTP 429` (تجاوز حد المعدل). هذا سلوك متوقع من Reddit للطلبات غير المصادَق عليها، وليس خطأً في المنصة.

```
Binance · 24h ticker            prices  OK     305ms   6 رموز · BTCUSDT=78519.31
Yahoo · GC=F                    prices  OK     110ms   XAU/USD=3995.7 USD
Yahoo · CL=F                    prices  OK      74ms   WTI=103.11 USD
Yahoo · BZ=F                    prices  OK      59ms   BRENT=112.14 USD
Yahoo · DX-Y.NYB                prices  OK      60ms   DXY=101.811
Yahoo · SI=F                    prices  OK      72ms   XAG/USD=50.925 USD
Yahoo · NG=F                    prices  OK      20ms   NG=2.902 USD
Yahoo · NVDA / MSFT / AAPL …    prices  OK      19–132ms  12 سهمًا تقنيًا
Google News · كريبتو/ذهب/طاقة/اقتصاد/تقنية   news OK  21–77ms  30 عنصرًا لكل استعلام
Google News · Crypto/Gold/Energy/Macro/Tech news OK  17–23ms  30 عنصرًا لكل استعلام
TechCrunch / The Verge / Ars Technica / Hacker News · AI  news OK  44–505ms
CoinDesk / Cointelegraph / BBC / الجزيرة / OilPrice / Investing  news OK  41–814ms
Reddit · r/CryptoCurrency       news    OK     669ms   25 عنصرًا
Reddit · r/Bitcoin              news    FAIL  1080ms   HTTP 429
Reddit · r/technology           news    FAIL   900ms   HTTP 429
Mastodon · #crypto/#bitcoin/#gold social OK   192–246ms  5 منشورات
الترجمة · Google Translate      translation OK  46ms   «يرتفع الذهب مع انخفاض الدولار»
X API v2                        social  متخطى      0ms   بدون X_BEARER_TOKEN
```

> الأرقام أعلاه لقطة لحظية وليست ثابتة. الأسعار تتغير، وعدد العناصر يعتمد على ما ينشره المصدر.

---

## 2. مصادر الأسعار

### 2.1 Binance — العملات الرقمية

- **النقطة:** `GET https://api.binance.com/api/v3/ticker/24hr?symbols=[...]`
- **التهيئة:** `GET /api/v3/klines?symbol=...&interval=1m&limit=240`
- **الفترة:** 1000ms افتراضيًا (`CRYPTO_POLL_MS`, الحد الأدنى 500ms).
- **الأصول (6):** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT`, `DOGEUSDT`.
- **الحقول المستخدمة:** `lastPrice`, `openPrice`, `highPrice`, `lowPrice`, `quoteVolume`, `priceChangePercent`.
- **حدود:** عامة بدون مفتاح، لكن Binance تحدّ المعدل حسب IP. طلب واحد لكل 6 رموز كل ثانية = 60 طلبًا/دقيقة، وهو ضمن الحدود المعتادة.
- **الفشل:** تراجع أسّي حتى 30 ثانية؛ يظهر في «حالة المصادر» بالأحمر.

**لماذا لا WebSocket؟** يمكن إضافته لاحقًا لزمن استجابة أقل، لكن REST كل ثانية كافٍ لرادار تنبيهات وليس لتنفيذ صفقات.

### 2.2 Yahoo Finance — الذهب والطاقة والدولار وأسهم التقنية

- **النقطة:** `GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1m&range=1d`
- **الفترة:** 20000ms افتراضيًا (`YAHOO_POLL_MS`, الحد الأدنى 5000ms).
- **الرموز (18):**

| الرمز | الأصل | السوق | نوع العقد |
|---|---|---|---|
| `GC=F` | الذهب | COMEX | آجل |
| `SI=F` | الفضة | COMEX | آجل |
| `CL=F` | خام غرب تكساس | NYMEX | آجل |
| `BZ=F` | خام برنت | ICE | آجل |
| `NG=F` | الغاز الطبيعي | NYMEX | آجل |
| `DX-Y.NYB` | مؤشر الدولار | ICE | مؤشر |
| `NVDA`, `MSFT`, `AAPL`, `GOOGL`, `META`, `AMZN` | أسهم تقنية كبرى | NASDAQ | سهم |
| `TSLA`, `AMD`, `AVGO`, `ORCL`, `TSM`, `PLTR` | أسهم تقنية/ذكاء اصطناعي | NASDAQ/NYSE | سهم |

- **لماذا هذه الرموز؟** `XAUUSD=X` غير مدعوم (404)، وStooq `xauusd` غير متاح. `GC=F` هو أقرب بديل عام ومجاني.
- **الحقول:** `regularMarketPrice`, `regularMarketTime`, `regularMarketChangePercent`, `chartPreviousClose`, `regularMarketDayHigh/Low`, `regularMarketVolume`.
- **التعامل مع الجلسات:** تُستخرج نقاط الجلسة النظامية فقط لاحتساب الافتتاح، وتُدمج النقاط التاريخية في السلسلة عند البدء.
- **حدود:** واجهة غير رسمية. قد تُحدّ المعدل أو تطلب `crumb`/كوكيز في المستقبل. لا يوجد اتفاقية مستوى خدمة. تُسحب الرموز الـ18 تسلسليًا مع فاصل زمني لتقليل خطر الحجب.
- **الفشل:** تراجع أسّي حتى 5 دقائق، مع الإبقاء على آخر سعر معروف (لا يُصفَّر).

---

## 3. مصادر الأخبار

كل خلاصة تُسحب بطلب شرطي (`ETag` / `If-Modified-Since`) لتوفير النطاق وتقليل الحمل. التكرار مضبوط بـ `NEWS_POLL_SCALE` (100 = افتراضي، 50 = ضعف السرعة، 200 = نصف السرعة) مع تشتيت عشوائي ±15%.

| المعرّف | الاسم | اللغة | الفئة | الفترة | النوع |
|---|---|---|---|---|---|
| `g-ar-crypto` | Google News · كريبتو | ar | crypto | 2د | Google |
| `g-ar-gold` | Google News · ذهب | ar | gold | 2د | Google |
| `g-ar-energy` | Google News · طاقة | ar | energy | 2د | Google |
| `g-ar-macro` | Google News · اقتصاد | ar | macro | 2د | Google |
| `g-ar-tech` | Google News · تقنية | ar | tech | 2د | Google |
| `g-en-crypto` | Google News · Crypto | en | crypto | 2د | Google |
| `g-en-gold` | Google News · Gold | en | gold | 2د | Google |
| `g-en-energy` | Google News · Energy | en | energy | 2د | Google |
| `g-en-macro` | Google News · Macro | en | macro | 2د | Google |
| `g-en-tech` | Google News · Tech/AI | en | tech | 2د | Google |
| `coindesk` | CoinDesk | en | crypto | 2د | RSS |
| `cointelegraph` | Cointelegraph | en | crypto | 2د | RSS |
| `techcrunch` | TechCrunch | en | tech | 2.5د | RSS |
| `the-verge` | The Verge | en | tech | 2.5د | RSS |
| `ars-technica` | Ars Technica | en | tech | 3د | RSS |
| `hnrss-ai` | Hacker News · AI | en | tech | 3د | RSS |
| `bbc-business` | BBC Business | en | macro | 3د | RSS |
| `aljazeera-business` | الجزيرة · اقتصاد | ar | macro | 3د | RSS |
| `oilprice` | OilPrice | en | energy | 3د | RSS |
| `investing-markets` | Investing.com | en | macro | 3د | RSS |
| `reddit-crypto` | Reddit · r/CryptoCurrency | en | crypto | 4د | Atom |
| `reddit-bitcoin` | Reddit · r/Bitcoin | en | crypto | 4د | Atom |
| `reddit-technology` | Reddit · r/technology | en | tech | 4د | Atom |

### 3.1 Google News RSS
- **الشكل:** `https://news.google.com/rss/search?q=...&hl=ar|en-US&gl=SA|US&ceid=...`
- **الميزة:** يغطي مئات المواقع، بما فيها مواقع لا توفر RSS مباشرًا.
- **العيب:** الرابط يعيد توجيه عبر Google، والعنوان قد يحمل لاحقة ` - اسم المصدر` (تتم إزالتها).
- **الفترة:** دقيقتان لكل استعلام (10 استعلامات = 5 طلبات/دقيقة تقريبًا).

### 3.2 RSS المباشر
CoinDesk وCointelegraph وTechCrunch وThe Verge وArs Technica وHacker News (AI) وBBC والجزيرة وOilPrice وInvesting.com. كلها اختُبرت وتعمل. الفائدة: مصدر أصلي، رابط مباشر، وتحديث أسرع من Google أحيانًا.

### 3.3 Reddit
- **الشكل:** `https://www.reddit.com/r/{sub}/.rss` (Atom).
- **المشكلة الموثّقة:** `r/Bitcoin` و`r/technology` أعادا **HTTP 429** أثناء الفحص. Reddit يقيّد الطلبات غير المصادَق عليها من عناوين IP مشتركة/سحابية.
- **السلوك:** تراجع أسّي حتى 30 دقيقة، واستمرار بقية المصادر. لا تُحذف الأخبار القديمة.
- **بدائل غير مستخدمة عمدًا:** كشط Reddit عبر JSON أو OAuth يتطلب تسجيل تطبيق؛ لم يُضف لأنه خارج نطاق «بدون اعتماديات/بدون مفاتيح».

### 3.4 Mastodon
- **الشكل:** `GET https://mastodon.social/api/v1/timelines/tag/{tag}?limit=...` (API عام).
- **الوسوم (6):** `bitcoin`, `crypto`, `gold`, `oil`, `artificialintelligence`, `nvidia`.
- **الفترة:** 3 دقائق (`MASTODON_POLL_MS`).
- **الصور:** تُستخرج من `media_attachments` مباشرة.
- **القيود:** خطوط زمنية عامة للوسوم فقط، وليست تغطية كاملة. بعض الخوادم قد تحدّ المعدل؛ يوجد تراجع أسّي حتى 30 دقيقة.
- **الخصوصية:** منشورات عامة فقط؛ لا مصادقة ولا متابعة حسابات.

### 3.5 X / Twitter
- **الوضع الافتراضي:** معطّل بوضوح في الواجهة. تظهر روابط بحث يدوية فقط.
- **التفعيل:** `X_BEARER_TOKEN` + `X_POLL_MS`. يستخدم `GET https://api.x.com/2/tweets/search/recent`.
- **الاستعلامات:** كريبتو، ذهب، طاقة، تقنية/ذكاء اصطناعي، وعربي.
- **القيود:** الخطة المجانية من X محدودة جدًا (غالبًا لا تتيح البحث الحديث). بدون خطة مدفوعة لن يعمل حتى مع توكن صالح.
- **لا كشط:** لا تُستخدم واجهات غير رسمية أو متصفح آلي، احترامًا لشروط الخدمة.

---

## 4. الترجمة الآلية

- **النقطة:** `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=ar&q=...&q=...` — خدمة عامة **غير رسمية** من Google (نفس محرّك إضافة Chrome). تقبل **عدة نصوص في طلب واحد** (حتى 20 نصًا / 1600 حرف)، ما يقلل الطلبات بشدة ويمنع حجب 429 الذي أصاب نقطة `gtx`.
- **الدمج:** نافذة تجميع 25ms قبل إرسال الطلب، حتى تتجمّع نصوص الأخبار المتزامنة في دفعة واحدة.
- **النطاق:** العناوين غير العربية دائمًا، والملخصات للعاجل/المهم فقط (`TRANSLATE_SUMMARIES=auto`) أو الكل (`all`).
- **الأداء:** تخزين مؤقت (1500 نصًا)، تزامن 3، فاصل 120ms، حد 90 طلبًا/دقيقة، مهلة 8s، وإعادة محاولة تلقائية عند 429/5xx.
- **كشف اللغة:** `sl=auto`، لذا تُترجم الألمانية/الفرنسية/الإسبانية أيضًا لا الإنجليزية فقط.
- **الخصوصية:** نص الخبر يخرج من الجهاز إلى Google. يمكن التعطيل بـ `TRANSLATE_ENABLED=0`.
- **الفشل:** لا يوقف التدفق؛ يبقى النص الأصلي مع وسم «قيد الترجمة» ثم يُعاد لاحقًا عند توفر الخبر في طابور جديد.

---

## 5. إثراء الصور

- **المصدر الأول:** `media:content` / `media:thumbnail` / `enclosure` / `<img>` داخل الخلاصة.
- **عند الغياب:** قراءة `og:image` أو `twitter:image` من صفحة الخبر.
- **الحدود:** تزامن 3، **30 طلبًا/دقيقة**، مهلة 9s، حد 600KB لكل صفحة، ذاكرة 800 عنوان لمدة 6 ساعات.
- **الأمان:** رفض العناوين المحلية/الخاصة (`localhost`, `10.*`, `192.168.*`, `172.16-31.*`, `::1`).
- **لا صور وهمية:** عند تعذّر الصورة يظهر بديل تصميمي حسب الفئة. بعض المواقع تحجب الجلب (403) أو لا توفر `og:image`.

---

## 6. حدود المعدل والسلوك عند الفشل

| المصدر | الحد التقريبي | سلوك المنصة |
|---|---|---|
| Binance | 1200 وزن/دقيقة لكل IP | تراجع أسّي حتى 30s |
| Yahoo | غير معلن | تراجع أسّي حتى 5د |
| Google News | غير معلن | تراجع حتى 30د |
| Reddit | ~60 طلب/دقيقة غير مصادَق | 429 → تراجع حتى 30د |
| Mastodon | حسب الخادم | 429/5xx → تراجع حتى 30د |
| Google Translate | غير معلن | فشل فردي، لا إعادة فورية |
| X API | حسب الخطة | 429 → انتظار حتى `x-rate-limit-reset` |

كل مصدر يظهر في الواجهة بحالة: `idle` (بانتظار أول سحب)، `ok`، `error`، `disabled`. الخطأ لا يوقف التطبيق.

---

## 7. ما لم يُستخدم ولماذا

| البديل | السبب |
|---|---|
| `XAUUSD=X` | يعيد 404 من Yahoo |
| Stooq `xauusd` | غير متاح |
| Metals-API / GoldAPI | تتطلب مفتاحًا وحدًا مجانيًا صغيرًا |
| TradingView WebSocket | غير رسمي ويخالف الشروط |
| كشط X/Nitter | يخالف شروط X وغير مستقر |
| Bluesky public search | يعيد 403 بدون مصادقة |
| RSS لـ Kitco | الرابط القديم 404 |
| CoinGecko | يعمل لكن Binance أسرع وأدق للزوج/دولار |

---

## 8. كيف تتحقق بنفسك

```powershell
# فحص كل المصادر
C:\ps5build\node\node.exe scripts/check-sources.js

# فحص مصدر واحد
Invoke-WebRequest -UseBasicParsing 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'
Invoke-WebRequest -UseBasicParsing 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d'
Invoke-WebRequest -UseBasicParsing 'https://cointelegraph.com/rss'

# حالة المصادر داخل التطبيق
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

---

## 9. اعتبارات قانونية

- الخلاصات العامة تُقرأ كما يقرأها أي قارئ RSS. لا يُعاد نشر المحتوى؛ الواجهة تعرض العنوان والملخص ورابط المصدر.
- Yahoo وBinance وMastodon واجهات عامة؛ الاستخدام الكثيف قد يخالف شروطها. الفترات الافتراضية متحفظة.
- الترجمة تستخدم نقطة Google العامة غير الرسمية، وقد تتوقف دون إشعار.
- لا تُستخدم بيانات المنصة لأي غرض تجاري أو إعادة توزيع.
- الأسعار معلوماتية وليست نصيحة استثمارية.
