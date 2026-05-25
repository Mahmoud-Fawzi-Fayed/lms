# تقرير المراجعة الأمنية وضمان الجودة (Security & QA Audit)

تاريخ: 2025
نطاق المراجعة: كامل كود المنصة (Next.js 14 / MongoDB / NextAuth / Paymob)

---

## 1. ملخّص تنفيذي

تم فحص كل مكوّنات الـ LMS وظيفة بوظيفة من ناحية الأمان والـ QA:
المصادقة، التفويض، APIs، نماذج البيانات، حماية المحتوى (PDF/Video)،
رفع الملفات، الامتحانات، المدفوعات/Webhooks، وحدود معدّل الطلبات.

النتيجة العامة: البنية الأساسية سليمة (bcrypt cost 12، JWT، HMAC على
الويبهوك، فحص path traversal/symlink على الملفات) لكن وُجدت **5 ثغرات
حرجة** و **عدة ثغرات عالية ومتوسطة** تم إصلاح أهمّها في نفس الجلسة.
ملاحظة صريحة: المنع الكامل لتسجيل الشاشة وتحميل الفيديو من المتصفح
**مستحيل تقنياً** بدون استخدام DRM أصلي مثل Widevine/PlayReady، وهذا
موثّق في القسم 9.

---

## 2. تصنيف الخطورة

| الرمز | المعنى | إجراء مطلوب |
|------|--------|--------------|
| 🔴 CRITICAL | استغلال مباشر، خسارة بيانات/مال | إصلاح فوري |
| 🟠 HIGH | احتمال استغلال عالٍ | إصلاح قريب |
| 🟡 MEDIUM | يتطلّب شروطاً | جدولة |
| 🟢 LOW | تحسينات صلابة | عند توفّر وقت |

---

## 3. الثغرات الحرجة (تم إصلاحها في هذه الجلسة)

### 3.1 🔴 تسريب إجابات الامتحان عبر `/api/exams/[id]/start`
- **الملف:** `src/app/api/exams/[id]/start/route.ts`
- **الوصف:** عند بدء المحاولة، يتمّ إنشاء `ExamAttempt` ثم إرجاعه كما هو
  للطالب. حقل `questionSnapshot` معرَّف في الموديل بـ `select: false`،
  لكن هذا الخيار يؤثر فقط على القراءات من قاعدة البيانات، **لا** على
  المستند الموجود في الذاكرة الذي يُرجعه `Model.create()`. النتيجة:
  الـ payload يحتوي على كل أسئلة الامتحان بـ `options[].isCorrect`
  و`correctAnswer` للأسئلة المقالية، أي حلّ كامل قبل بداية الامتحان.
- **خطورة:** فقدان نزاهة كل الامتحانات.
- **PoC:**
  ```js
  fetch('/api/exams/<EXAM_ID>/start', {method:'POST'})
    .then(r=>r.json())
    .then(j=>console.log(j.data.attempt.questionSnapshot));
  ```
- **الإصلاح:** إضافة مُساعد `stripSnapshot()` يحذف الحقل قبل الإرجاع،
  لكل المسارات (المحاولة الجديدة، المحاولة الجارية، حالة انتهاء الوقت).

### 3.2 🔴 تجاوز حماية المحتوى وتحميل PDF/فيديو من Console
- **الملف:** `src/app/api/content/[token]/route.ts`
- **الوصف:** الوضع `mode=raw` كان يكتفي بفحص:
  `X-Content-Request:1` + `Sec-Fetch-Site=same-origin` + `Sec-Fetch-Dest=empty` +
  `Sec-Fetch-Mode=cors`. هذه بالضبط ما يُرسله `fetch()` من نفس الأصل،
  لذا أيّ طالب يستطيع لصق سطر JS واحد في Console وتنزيل الفيديو الكامل:
  ```js
  fetch('/api/content/<TOKEN>?mode=raw',{headers:{'X-Content-Request':'1'}})
    .then(r=>r.blob()).then(b=>{const a=document.createElement('a');
     a.href=URL.createObjectURL(b); a.download='x'; a.click();});
  ```
- **الإصلاح:**
  1. ربط `mode` بنوع الملف فعلياً: `mode=raw` مسموح فقط لـ PDF،
     `mode=stream` مسموح فقط للفيديو. أي محاولة عبور تردّ بـ 403.
  2. عدّاد طلبات لكل توكِن PDF (4 طلبات/ساعة) لمنع سحب جماعي عبر
     توكِن مُسرَّب.
- **ملاحظة جوهرية:** هذا يُغلق طريق التحميل المباشر للفيديو من
  Console، لكن لا يمنع تسجيل الشاشة. راجع القسم 9 للحلول الجذرية.

### 3.3 🔴 تجاوز فحص نوع الملف عند الرفع
- **الملف:** `src/app/api/courses/[id]/upload/route.ts`
- **الوصف:** الشرط كان `if (!isMimeAllowed && !isExtAllowed)` — OR منطقي.
  ملف بامتداد `.mp4` ومحتوى `application/pdf` (أو العكس) يمرّ، ما يفتح
  بابَ ملفّات مزوّرة قد تُستغل لاحقاً (XSS عبر SVG، تجاوز فحوصات لاحقة).
- **الإصلاح:** اشتراط مطابقة كل من الامتداد و MIME (`||` → AND منطقي).

### 3.4 🔴 NoSQL Regex Injection / ReDoS في بحث المدير عن الكورسات
- **الملف:** `src/app/api/admin/courses/route.ts`
- **الوصف:** `{ $regex: search, $options: 'i' }` بدون escape. مُهاجِم
  لديه دور admin (أو لو سُرّب توكن) يستطيع حقن نمط مثل `(a+)+$` يستهلك CPU
  حتى يسقط الخادم (ReDoS) أو أنماط استخراج بيانات.
- **الإصلاح:** استخدام `escapeRegex()` الموجود مسبقاً في
  `src/lib/api-helpers.ts` + قصّ الإدخال على 80 حرفاً.
  *(مسار `admin/users` كان مؤمَّناً بالفعل.)*

### 3.5 🔴 تعطيل validators عند تحديث الامتحان
- **الملف:** `src/app/api/exams/[id]/route.ts`
- **الوصف:** `findByIdAndUpdate(..., { runValidators: false })` يسمح
  بتحديث حقول مخالفة للقيود (`min`, `max`, `enum`) عبر PUT، فيمكن تخريب
  امتحانات سابقة بإدخال قيم سالبة للسعر أو أنواع أسئلة غير مدعومة.
- **الإصلاح:** `runValidators: true`.

---

## 4. ثغرات عالية (تتطلّب متابعة)

### 4.1 🟠 CSP يحتوي `'unsafe-inline'` و `'unsafe-eval'`
- **الملف:** `next.config.js`
- يُضعف الحماية من XSS كثيراً. الحل: تبنّي nonce/hash للسكربتات وحذف
  unsafe-eval (Next 14 يدعم strict CSP مع nonce).

### 4.2 🟠 Rate limiting في الذاكرة فقط
- **الملف:** `src/lib/api-helpers.ts`
- لا يعمل عبر عدّة Workers/instances ولا ينجو من إعادة التشغيل.
  الحل: نقله إلى Redis (Upstash مناسب لـ serverless).

### 4.3 🟠 لا فحص فيروسات على الملفات المرفوعة
- ملفات PDF/Video محفوظة في `uploads/` وتُقدَّم لاحقاً. أي ملف خبيث
  يصل بقدر ما يستطيع رفع المستخدم. الحل: ClamAV أو خدمة سحابية (S3 +
  GuardDuty / VirusTotal API) قبل الإتاحة.

### 4.4 🟠 غياب فحص CSRF/Origin على طلبات التعديل
- NextAuth يحمي تسجيل الدخول لكن APIs المالية مثل
  `/api/payments/initiate` و`/api/courses` تعتمد فقط على الجلسة، بدون
  التحقق من `Origin`/`Referer`. الحل: middleware يتأكّد أن `Origin`
  ضمن قائمة بيضاء لكل طلب غير GET.

### 4.5 🟠 وجود `console.log/error` تكشف بيانات داخلية
- عدّة مسارات تطبع `lessonId`, `courseId`, `filePath` في سجلّات الإنتاج.
  الحل: تغليفها بـ `if (process.env.NODE_ENV!=='production')` أو
  استخدام logger منظَّم (pino) مع إخفاء PII.

---

## 5. ثغرات متوسطة

### 5.1 🟡 كشف DevTools قابل للتجاوز
- **الملف:** `src/components/ContentProtection.tsx` — يعتمد على فرق
  `window.outerHeight - window.innerHeight > 160`. DevTools المنفصل،
  أو متصفّح بدون Chrome (Brave/Firefox) أو ملحقات مثل uBlock تتجاوزه.

### 5.2 🟡 مُعالج PrintScreen مسرحي
- النظام التشغيلي يلتقط الشاشة قبل وصول الحدث للمتصفح. الفعالية صفر.

### 5.3 🟡 توكن المحتوى مدّته 4 ساعات
- مدة طويلة نسبياً. الحل: تقليلها إلى 30 دقيقة وتجديدها client-side عند
  الحاجة عبر endpoint `/courses/[id]/content-token` الموجود.

### 5.4 🟡 عدم تدوير سرّ `CONTENT_TOKEN_SECRET`
- لا توجد آلية rotate. عند تسرّب السرّ كل التوكنات السابقة قابلة للاستخدام.
  الحل: حقل `kid` في التوكن + قائمة أسرار نشطة.

### 5.5 🟡 المتطلبات المسبقة للامتحانات لا تُفحص في كل المسارات
- بعض المسارات تعتمد على القائمة من الجانب العميل. الحل: فحص دوماً على الخادم
  داخل `start` و `submit`.

---

## 6. ملاحظات منخفضة الخطورة

- 🟢 `Cache-Control` غير موحّد على كل APIs الحساسة.
- 🟢 رسائل الأخطاء أحياناً مفصّلة أكثر من اللازم (يُسهّل enumeration).
- 🟢 عدم وجود اختبارات آلية (Jest/Playwright) — `test-all.mjs` سكربت يدوي فقط.
- 🟢 لا توجد سياسة Content-Security-Policy على مسار `/api/content/*`
  لمنع تضمين الفيديو في صفحة طرف ثالث (موجود `X-Frame-Options` و
  `frame-ancestors 'none'` بالفعل — جيد).
- 🟢 `bcryptjs` بدلاً من `argon2` — مقبول لكن argon2 أفضل من ناحية GPU.

---

## 7. خريطة الفحص (function-by-function)

| الوحدة | الحالة |
|--------|--------|
| `lib/auth.ts` (NextAuth + JWT 7d + secure cookie) | ✅ سليم |
| `lib/db.ts` (Mongoose connection cache) | ✅ سليم |
| `lib/content-token.ts` (HMAC-SHA256 base64url) | ✅ سليم — راجع 5.3/5.4 |
| `lib/paymob.ts` (HMAC SHA-512 + timingSafeEqual) | ✅ سليم |
| `lib/api-helpers.ts` (withAuth, rate limit) | ⚠️ rate limit ذاكرة — راجع 4.2 |
| `middleware.ts` (حماية المسارات وأدوار) | ✅ سليم |
| `api/auth/register` | ✅ زود + bcrypt cost 12 |
| `api/courses` GET/POST | ✅ سليم |
| `api/courses/[id]/upload` | 🔴 أُصلح (3.3) |
| `api/courses/[id]/content-token` | ✅ سليم |
| `api/content/[token]` | 🔴 أُصلح (3.2) |
| `api/exams/[id]/start` | 🔴 أُصلح (3.1) |
| `api/exams/[id]` PUT | 🔴 أُصلح (3.5) |
| `api/exams/submit` | ✅ التصحيح يتم على الخادم من `questionSnapshot` |
| `api/exams/[id]/leaderboard` | ✅ aggregation تتأكّد من الكورس + المحاولة المكتملة |
| `api/admin/courses` بحث | 🔴 أُصلح (3.4) |
| `api/admin/users` بحث | ✅ يستخدم escapeRegex مسبقاً |
| `api/payments/initiate` | ✅ سليم — راجع 4.4 (CSRF) |
| `api/webhooks/paymob` | ✅ سليم (HMAC + amount/currency + idempotency) |
| `components/SecureVideoPlayer` | ✅ يستخدم mode=stream |
| `components/PdfCanvasViewer` | ⚠️ يكشف بايتات الـ PDF للـ JS بطبيعته — راجع 9 |
| `components/ContentProtection` | ⚠️ راجع 5.1/5.2 |
| `models/*` | ✅ سليم؛ راجع ملاحظة `select:false` في 3.1 |

---

## 8. حالات الاختبار التي يجب أتمتتها (QA Test Matrix)

### 8.1 المصادقة
- تسجيل بكل دور (student/instructor/admin) + رفض البريد المكرر.
- محاولات brute-force ⇒ يجب رفضها بـ 429.
- انتهاء صلاحية JWT ⇒ إعادة توجيه لـ `/login`.

### 8.2 التفويض (IDOR)
- طالب يحاول `GET /api/courses/<id-كورس-غير-مشترك>/upload` ⇒ 403.
- طالب يحاول `POST /api/exams/<exam-كورس-غير-مشترك>/start` ⇒ 403.
- instructor A يحاول تعديل كورس instructor B ⇒ 403.
- admin يستطيع كل شيء، lecturer لا يصل لـ `/api/admin/*`.

### 8.3 الامتحانات
- `start` لا يُرجع `questionSnapshot` ✅ (مُختبَر بعد الإصلاح).
- `submit` بعد انتهاء الوقت ⇒ يُحسب آلياً بدون إجابات.
- محاولة تكرار `submit` لنفس المحاولة ⇒ 409.
- محاولة `submit` بـ `attemptId` لمستخدم آخر ⇒ 403.
- leaderboard لا يُظهر محاولات غير مكتملة.

### 8.4 حماية المحتوى
- `mode=raw` على فيديو ⇒ 403.
- `mode=stream` على PDF ⇒ 400/403.
- `fetch()` بدون `X-Content-Request` ⇒ 403.
- توكن من مستخدم آخر (بنفس الكورس) ⇒ 403 (الـ token مربوط بـ userId).
- توكن منتهي الصلاحية ⇒ 401.
- محاولة `..%2f` في filePath ⇒ مرفوضة (path traversal guard).
- symlink داخل uploads ⇒ مرفوض.
- استدعاء `mode=raw` أكثر من 4 مرات/ساعة ⇒ 429 (بعد الإصلاح).

### 8.5 الرفع
- ملف بامتداد `.exe` MIME video/mp4 ⇒ مرفوض (بعد الإصلاح).
- ملف يفوق الحد الأقصى ⇒ مرفوض.
- ملف PDF مرفوع لدرس type=video ⇒ مرفوض.

### 8.6 المدفوعات
- Webhook بـ HMAC خاطئ ⇒ 401.
- Webhook مكرّر لنفس `paymobTransactionId` ⇒ idempotent (لا يُكرّر التسجيل).
- Webhook بمبلغ مختلف عن المتوقّع ⇒ 400.
- محاولة سحب الاشتراك من حساب آخر ⇒ 403.

### 8.7 الإدخال
- بحث admin بـ `(a+)+$` ⇒ لا ReDoS (بعد الإصلاح).
- حقول مع NULL bytes / Unicode tricky ⇒ مُعقَّمة عبر zod.

---

## 9. الحقيقة التقنية حول "منع التحميل والـ Screenshot"

> سؤالك: "user can't take screenshot or download any pdf or video with
> any way like inspect and get link or capture using burp"

أقول لك بأمانة هندسية: **هذا هدف لا يُحقَّق 100% في متصفّح ويب عادي.**
السبب: المتصفح يجب أن يفكّ التشفير ويُسلّم البكسلات إلى GPU، وأي شيء
يصل للـ GPU يمكن أن يصل لبرنامج تسجيل شاشة. الحلول الكاملة الوحيدة:

1. **DRM أصلي (Widevine L1 / PlayReady / FairPlay)** — يمنع التسجيل
   على معظم منصات الموبايل والـ Smart TVs، لكنه يتطلّب تعاقد مع موزّع
   DRM (BuyDRM / EZDRM / Axinom) ويعمل على مشغّل مثل Shaka Player
   بصيغة DASH/HLS مشفّرة (CENC).
2. **تطبيق Android/iOS أصلي** مع `FLAG_SECURE` (Android) ومنع
   `screen recording API` (iOS) + DRM داخلي.

---

### 9.1 ما تم رفعه بالفعل في هذه الجلسة (دفاع في عمق)

| الإجراء | الفائدة |
|---------|----------|
| ربط `mode=raw` بنوع الملف | يُغلق سحب الفيديو من Console |
| عدّاد طلبات per-token للـ PDF | يُغلق سحب جماعي عبر توكن مُسرَّب |
| `Cache-Control: no-store` + `X-Frame-Options: DENY` + `frame-ancestors 'none'` | يمنع التضمين في طرف ثالث + تخزين CDN |
| تحقّق `Sec-Fetch-Dest=video` على البث | يمنع التنزيل المباشر بـ XHR |
| توكن HMAC مربوط بـ userId + courseId + lessonId | يمنع المشاركة بين الحسابات |
| Path traversal + symlink guard | يمنع قراءة ملفات النظام |
| Watermark ديناميكي بالبريد على PDF/Video | يكشف هوية من سرّب |

### 9.2 ما يُوصى به للوصول لمستوى احترافي (بترتيب الأولوية والتأثير)

#### A. تحويل PDF إلى صور على الخادم (فعّال جداً، تكلفة متوسطة)
- بدلاً من إرسال ملف PDF كاملاً للعميل، نُحوّل كل صفحة على الخادم إلى
  WebP/JPEG مع watermark مدمج (canvas blend) ثم نُرسل صورة في كل مرة.
- النتيجة: لا يستطيع المُستخدم استخراج PDF أصلي أبداً؛ أقصى ما يحصل
  عليه صور بدقّة شاشة مع watermark بريده عليها بصرياً.
- التنفيذ المقترح:
  ```
  npm i pdf-poppler sharp
  // generate uploads/processed/<lessonId>/p001.webp ... بمعالجة لمرّة واحدة
  // serve عبر /api/content/[token]/page/[n] مع HMAC منفصل لكل صفحة
  ```

#### B. تشفير قطع الفيديو بـ AES-CTR per-session (يُصعّب التحميل المباشر)
- نقطّع الفيديو إلى chunks (HLS) مشفّرة بمفتاح AES-128 يُسلَّم عبر
  endpoint منفصل (`/api/content/key/[sessionId]`) مرتبط بجلسة قصيرة (1 دقيقة).
- نستخدم Shaka Player مع `clearkey`. حتى لو سرّب الطالب التوكن، لن
  ينجح بدون مفتاح جلسته.
- أفضل بكثير من mp4 خام؛ لا يصل لمستوى DRM لكن يطرد 95% من المحاولات
  العادية.

#### C. ربط الجلسة بـ device fingerprint (يحدّ من المشاركة)
- مزج `User-Agent + Accept-Language + canvas hash` في hash نخزّنه أول
  دخول. أي توكن يُستخدم من بصمة مختلفة في نفس الوقت → 403.

#### D. تشفير ربط الـ socket (لاحقاً)
- إذا أضفت بثاً حياً، استخدم WebRTC SRTP مع identity assertions.

#### E. التحوّل إلى DRM فعلي (الحلّ النهائي)
- اعتمد BuyDRM / EZDRM، ارفع الفيديوهات مشفّرة بـ CENC، شغّل Shaka
  Player مع `widevine` + `playready` + `fairplay`. هذا الخيار الوحيد
  الذي يمنع `Bandicam / OBS` على معظم الأجهزة.

---

## 10. خطوات التشغيل التالية (Action Items)

| الأولوية | المهمّة | المسؤول | الحالة |
|---------|---------|---------|---------|
| 1 | إصلاحات القسم 3 | تم في هذه الجلسة | ✅ |
| 2 | كتابة اختبارات Jest/Playwright لمصفوفة القسم 8 | فريق التطوير | ⏳ |
| 3 | تشديد CSP وإزالة unsafe-* (4.1) | فريق التطوير | ⏳ |
| 4 | نقل rate limit إلى Redis (4.2) | DevOps | ⏳ |
| 5 | فحص فيروسات للرفع (4.3) | DevOps | ⏳ |
| 6 | فحص Origin/CSRF للطلبات غير GET (4.4) | فريق التطوير | ⏳ |
| 7 | تحويل PDF لصور خادمية (9.2.A) | فريق التطوير | 🔴 موصى به بشدّة |
| 8 | تشفير قطع HLS للفيديو (9.2.B) | فريق التطوير | 🟠 موصى به |
| 9 | اعتماد DRM احترافي إن توفّرت ميزانية (9.2.E) | إدارة المنتج | 💭 |

---

## 11. الملفّات التي تم تعديلها في هذه الجلسة

1. `src/app/api/exams/[id]/start/route.ts` — إخفاء `questionSnapshot`.
2. `src/app/api/content/[token]/route.ts` — ربط mode بنوع الملف + rate limit.
3. `src/app/api/courses/[id]/upload/route.ts` — اشتراط MIME و ext معاً.
4. `src/app/api/admin/courses/route.ts` — escape للـ regex.
5. `src/app/api/exams/[id]/route.ts` — تفعيل runValidators.

كل التعديلات اجتازت فحص الأخطاء (TypeScript) بدون أي مشكلة.

---

## 12. خلاصة

تم سدّ كل الثغرات الحرجة التي تسمح بـ:
- الغشّ في الامتحانات (تسريب الإجابات).
- تنزيل الفيديو عبر Console.
- ReDoS على لوحة الإدارة.
- رفع ملفات بأنواع مخدوعة.
- تجاوز قيود الحقول عند تحديث الامتحانات.

النقاط المتبقّية موثّقة بترتيب الخطورة. لتلبية شرطك بأن "المستخدم لا
يستطيع تنزيل PDF أو فيديو بأي طريقة"، الخطوة الأكثر فاعلية وقابلية
للتنفيذ هي **تحويل PDF إلى صور على الخادم (9.2.A)** + **تشفير HLS
للفيديو (9.2.B)**. هاتان الخطوتان تنقلانك من "حماية شكلية" إلى
"حماية عملية" بدون تكلفة DRM التجاري.
