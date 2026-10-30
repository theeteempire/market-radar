# دليل النشر العام

هذا الدليل يشرح كيف تجعل «رادار السوق» متاحًا من أي متصفح، مع نسخة عامة للجوال.

> **قاعدة أساسية:** GitHub Pages **لا يستطيع تشغيل الخادم** لأن المنصة تحتاج Node.js وSSE وطلبات خارجية. GitHub Pages يصلح فقط لصفحة الهبوط (`docs/index.html`). التطبيق نفسه يحتاج استضافة Node.

---

## 1. الخيار الموصى به: Render

الملف `render.yaml` جاهز كـ Blueprint.

1. ارفع المشروع إلى GitHub أولًا (انظر `scripts/publish-github.js`).
2. أنشئ حسابًا على [render.com](https://render.com) واربطه بـ GitHub.
3. من لوحة Render: **New → Blueprint**.
4. اختر المستودع. سيتعرّف Render على `render.yaml` تلقائيًا.
5. اضغط **Apply**. سيبدأ البناء والتشغيل.
6. بعد دقيقة تقريبًا افتح الرابط:
   `https://market-radar-xxxx.onrender.com`
7. تحقق من `https://.../api/health` أن `ok: true`.

### ملاحظات Render

- الخطة المجانية تُوقف الخدمة بعد فترة خمول؛ أول فتح بعد التوقف قد يستغرق 30–60 ثانية.
- الإعدادات المحفوظة في `data/settings.json` مؤقتة على الخطة المجانية وتُفقد عند إعادة النشر.
- لا تحتاج `npm install`؛ المشروع بلا أي اعتماديات npm.
- أضف `X_BEARER_TOKEN` أو Telegram من **Environment** إن أردت.
- لتفعيل النطاق المخصص: **Settings → Custom Domains** ثم أضف CNAME عند مزوّد النطاق.

---

## 2. Railway

1. أنشئ مشروعًا جديدًا: **New Project → Deploy from GitHub repo**.
2. اختر المستودع.
3. Railway يقرأ `Procfile` تلقائيًا: `web: node server.js`.
4. أضف المتغيرات:
   ```
   HOST=0.0.0.0
   TRANSLATE_ENABLED=1
   IMAGE_ENRICH_ENABLED=1
   ```
5. من **Settings → Networking** اضغط **Generate Domain**.
6. افتح الرابط وتحقق من `/api/health`.

---

## 3. Docker على VPS

```bash
docker build -t market-radar .
docker run -d --name market-radar \
  -p 8787:8787 \
  -e HOST=0.0.0.0 \
  -e TRANSLATE_ENABLED=1 \
  --restart unless-stopped \
  market-radar
```

ثم ضع reverse proxy مع HTTPS. مثال Caddy:

```caddy
radar.example.com {
  reverse_proxy 127.0.0.1:8787 {
    flush_interval -1
  }
}
```

`flush_interval -1` مهم لبث SSE حتى لا تتجمع الأحداث.

مثال Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_read_timeout 3600s;
}
```

---

## 4. Fly.io

```bash
fly launch --no-deploy
fly secrets set HOST=0.0.0.0 TRANSLATE_ENABLED=1 IMAGE_ENRICH_ENABLED=1
fly deploy
fly open
```

اضبط `min_machines_running = 1` إن أردت تجنّب التوقف عند الخمول.

---

## 5. Koyeb / منصات Node أخرى

أي منصة تدعم Node 20+ تكفي:

- **Build command:** `node -e "console.log('no build')"` أو اتركه فارغًا.
- **Run command:** `node server.js`
- **Port:** المنصة تحقن `PORT` عادة؛ الخادم يقرأه تلقائيًا.
- **Health check:** `/api/health`
- **متغير إلزامي للاستضافة العامة:** `HOST=0.0.0.0`

---

## 6. صفحة GitHub Pages

الصفحة العامة موجودة في `docs/index.html` وتعمل كـ landing page:

1. في GitHub: **Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main` — **Folder:** `/docs`.
4. احفظ. سيصبح الرابط:
   `https://<username>.github.io/<repo>/`

الصفحة تعرض الشرح واللقطات وطريقة الاستخدام وروابط التشغيل المحلي والنشر. **لا تحاول تشغيل التطبيق نفسه من Pages**؛ لن تعمل الأسعار والأخبار وSSE.

لربط زر «النسخة الحية» بعنوان Render، عدّل `docs/index.html` واستبدل قيمة `https://github.com/theeteempire/market-radar#deploy` أو أعد تشغيل سكربت النشر مع:

```bash
APP_URL=https://your-app.onrender.com node scripts/publish-github.js --repo market-radar --pages
```

---

## 7. الأمان عند النشر العام

- **لا توجد مصادقة.** أي زائر يستطيع قراءة البيانات وتغيير الإعدادات وإنشاء تنبيهات تجريبية.
- الإعدادات **مشتركة** بين كل الزوار لأنها محفوظة على الخادم.
- لا تضع أسرارًا في الكود أو المستودع. استخدم متغيرات البيئة.
- `.env` مستبعد من Git وDocker.
- إن أردت نسخة عرض عامة مقيدة، أضف طبقة مصادقة أو reverse proxy يقيّد `POST` قبل نشرها.
- لا تعِد نشر محتوى الأخبار كاملًا؛ المنصة تعرض عنوانًا وملخصًا ورابط المصدر فقط.

---

## 8. الجوال

- الواجهة متجاوبة وتعمل على عرض 390px دون تمرير أفقي.
- يوجد `manifest.webmanifest`؛ من Chrome/Safari يمكن **إضافة إلى الشاشة الرئيسية** لتعمل كتطبيق.
- بث SSE يعمل على الشبكات الخلوية، لكنه قد ينقطع عند تبديل الشبكة؛ يعيد المتصفح الاتصال تلقائيًا.

---

## 9. التحقق بعد النشر

```bash
curl https://your-app.example.com/api/health
curl "https://your-app.example.com/api/news?breaking=1&limit=3"
curl https://your-app.example.com/manifest.webmanifest
```

يجب أن يعيد الأول `"ok": true`، والثاني عناصر عاجلة أو مصفوفة فارغة، والثالث JSON صالحًا.

---

## 10. استكشاف الأعطال

| العرض | السبب | الحل |
|---|---|---|
| `Application failed to respond` | الخادم يستمع على `127.0.0.1` فقط | اضبط `HOST=0.0.0.0` |
| الصفحة تعمل لكن لا أسعار | حجب Binance/Yahoo من مراكز البيانات | راجع `/api/health` و«حالة المصادر» |
| SSE ينقطع بسرعة | proxy buffering | `proxy_buffering off` أو `flush_interval -1` |
| الترجمة لا تعمل | Google حجب الطلبات | عطّل `TRANSLATE_ENABLED` وستبقى الأخبار الإنجليزية |
| الخدمة بطيئة أول مرة | خطة مجانية نائمة | انتظر 30–60 ثانية أو ترقَّ للخطة المدفوعة |
