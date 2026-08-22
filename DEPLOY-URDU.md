# YARUB ONE — مفت میں chat چلانے کی گائیڈ

یہ گائیڈ صرف **chat** چلانے کے لیے ہے۔ تصویر اور ویڈیو بعد کا مرحلہ ہے۔

---

## کیا استعمال کریں گے (تینوں مستقل مفت، وقت کی کوئی حد نہیں)

| کام | جگہ | خرچہ |
|---|---|---|
| ویب سائٹ چلانا | **Vercel** | مفت |
| ڈیٹابیس (PostgreSQL) | **Neon** | مفت، ہمیشہ |
| Redis | **Upstash** | مفت |
| AI کے جواب | OpenAI یا کوئی اور | **پیسے لگتے ہیں** |

Hosting مفت ہے۔ AI مفت نہیں — یہ hosting کا مسئلہ نہیں، AI کمپنیاں ہر جواب کا پیسہ لیتی ہیں۔
شروع کے لیے $5 کافی ہیں۔

---

## قدم ۱ — فائلیں GitHub پر ڈالیں

اس zip کو کھول کر ساری فائلیں ایک نئے GitHub repo میں ڈالیں۔

**zip فائل خود اپلوڈ نہ کریں** — Vercel، Neon، کوئی بھی zip نہیں پڑھ سکتا۔ فائلیں کھلی ہوئی ہونی چاہییں۔

---

## قدم ۲ — Neon سے ڈیٹابیس (۵ منٹ)

1. **https://neon.com** کھولیں → GitHub سے sign up
2. **Create project** دبائیں، نام کچھ بھی رکھ دیں
3. جو **Connection string** ملے، اسے محفوظ کر لیں۔ ایسا نظر آئے گا:
   ```
   postgresql://user:password@ep-xxxx.aws.neon.tech/neondb?sslmode=require
   ```

کارڈ کی ضرورت نہیں۔

---

## قدم ۳ — Upstash سے Redis (۵ منٹ)

1. **https://upstash.com** کھولیں → sign up
2. **Create Database** → Redis چنیں
3. جو **Redis URL** ملے (`rediss://...` سے شروع ہوتا ہے) محفوظ کر لیں

---

## قدم ۴ — AI key لیں

**https://platform.openai.com** پر اکاؤنٹ بنائیں → **API keys** → **Create new secret key**۔

کچھ رقم ڈالنی پڑے گی (کم از کم $5)۔ یہ key `sk-` سے شروع ہوتی ہے اور **صرف ایک بار** دکھائی جاتی ہے، تو فوراً محفوظ کر لیں۔

---

## قدم ۵ — دو خفیہ الفاظ بنائیں

`AUTH_SECRET` اور `CREDENTIAL_SECRET` کے لیے دو لمبے بے ترتیب الفاظ چاہییں۔
**https://generate-secret.vercel.app/32** کھولیں، دو بار refresh کر کے دو الگ الگ نقل کر لیں۔

---

## قدم ۶ — Vercel پر deploy

1. **https://vercel.com** → GitHub سے sign up
2. **Add New → Project** → اپنا repo چنیں
3. **Root Directory** میں `apps/web` لکھیں — یہ سب سے اہم قدم ہے
4. **Environment Variables** میں یہ سب ڈالیں:

```
DATABASE_URL          = (Neon والا)
REDIS_URL             = (Upstash والا)
AUTH_SECRET           = (پہلا خفیہ لفظ)
CREDENTIAL_SECRET     = (دوسرا خفیہ لفظ)
TEXT_PRIMARY_API_KEY  = (OpenAI کی sk-... key)
TEXT_PRIMARY_BASE_URL = https://api.openai.com/v1
TEXT_PRIMARY_MODEL    = gpt-4o-mini
NODE_ENV              = production
APP_URL               = https://آپ-کا-پتہ.vercel.app
```

`APP_URL` پہلی بار معلوم نہیں ہوتا — کچھ بھی ڈال دیں، deploy کے بعد اصل پتہ آ جائے تو درست کر کے دوبارہ deploy کر دیں۔

5. **Deploy** دبائیں اور ۵–۱۰ منٹ انتظار کریں

---

## قدم ۷ — APK کو نئے پتے سے جوڑیں

جو لنک ملے (مثلاً `https://yarub-one.vercel.app`) اسے
`android/gradle.properties` میں ڈالیں:

```
YARUB_API_BASE_URL_DEBUG=https://yarub-one.vercel.app
```

پھر APK دوبارہ بنائیں۔ اب کھلتے ہی اصل صفحہ آئے گا، خالی سکرین نہیں۔

---

## کیا چلے گا اور کیا نہیں

**چلے گا:** chat، اکاؤنٹ بنانا، لاگ ان، گفتگو محفوظ ہونا، عربی/اردو/انگریزی

**نہیں چلے گا:** تصویر، ویڈیو، اور coding کے وہ کام جو قطار میں لگتے ہیں

وجہ: یہ کام `apps/worker` کرتا ہے، جو مسلسل چلنے والا الگ پروگرام ہے۔ Vercel ایسے پروگرام نہیں چلاتا۔ اس کے لیے بعد میں ایک چھوٹا سرور (~$5 ماہانہ) لینا پڑے گا۔

---

## اگر build ناکام ہو

Vercel کا log کھول کر آخری سرخ لائنیں دیکھیں۔ سب سے عام وجوہات:

- **Root Directory `apps/web` نہیں لکھا** — سب سے زیادہ یہی غلطی ہوتی ہے
- **DATABASE_URL غلط یا خالی** — Neon سے دوبارہ نقل کریں
- **repo میں zip پڑی ہے، فائلیں نہیں**
