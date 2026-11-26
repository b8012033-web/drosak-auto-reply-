# دروسك بلس — Telegram Business Auto Reply

واجهة عربية حديثة للوحة الردود مع صفحة تسجيل دخول مخصصة، إدارة الردود بالكلمات المفتاحية، البحث، تفعيل/إيقاف/حذف/تعديل الردود، ورد افتراضي.

## ملفات المشروع
- `server.js` — Express API + Telegram Business webhook + تسجيل الدخول بجلسة Cookie.
- `public/index.html` — صفحة الدخول ولوحة التحكم.
- `package.json` — إعدادات التشغيل.

## النشر على Railway
1. ارفع محتويات المجلد إلى نفس GitHub repository المرتبط بخدمة Railway (استبدل `server.js` و`public/index.html` و`README.md`، واحتفظ بـ `package.json`).
2. تأكد من وجود Volume مربوط على `/data`.
3. احتفظ بمتغيرات Railway التالية:
   - `BOT_TOKEN` — توكن البوت من BotFather.
   - `ADMIN_USER` — اسم مستخدم دخول اللوحة.
   - `ADMIN_PASSWORD` — كلمة مرور قوية للوحة.
   - `WEBHOOK_SECRET` — قيمة سرية عشوائية من 1 إلى 256 حرفًا وبصيغة مقبولة لدى Telegram.
   - `DATA_FILE=/data/replies.json`
4. تأكد أن الخدمة لديها Public Domain. عند التشغيل سيضبط السيرفر webhook تلقائيًا باستخدام `RAILWAY_PUBLIC_DOMAIN`.
5. افتح `https://YOUR-DOMAIN/admin`.

## ملاحظات
- صفحة الدخول تستخدم Cookie آمنة `HttpOnly`, `Secure`, `SameSite=Strict`؛ لذلك افتح لوحة التحكم عبر HTTPS.
- الجلسات محفوظة في ذاكرة الخدمة وتنتهي بعد 12 ساعة أو عند إعادة تشغيل الخدمة.
- الردود محفوظة في `/data/replies.json` على الـ Volume.
- لا تشارك `BOT_TOKEN` أو `ADMIN_PASSWORD` أو `WEBHOOK_SECRET` مع أي شخص.
- البوت يرد على رسائل النص فقط التي تصل كـ `business_message` وبها `business_connection_id`، ولا يرد على الرسائل التي تبدأ بـ `/`.
