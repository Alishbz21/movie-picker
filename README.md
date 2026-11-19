# FRAME / 20 — انتخاب فیلم با Google Sheets و GitHub Pages

یک وب‌اپ فارسی برای انتخاب ۲۰ فیلم تصادفی از شیت فیلم‌ها، ثبت یک انتخاب در هر دور، اختصاص شمارهٔ اولویت ۱، ۲، ۳، ... و بازیابی انتخاب‌ها در مراجعهٔ بعدی.

## این پروژه چه کار می‌کند؟

- دادهٔ اصلی **زنده** از Google Sheet مشخص‌شده در `Code.gs` خوانده می‌شود؛ دادهٔ آرشیوی `films.json` فقط مخصوص حالت نمایشی است.
- از میان فیلم‌های **بدون Personal Rating و بدون Watchlist Priority** که قبلاً در رابط انتخاب نشده‌اند، ۲۰ فیلم تصادفی نشان می‌دهد.
- با انتخاب یک فیلم، کوچک‌ترین اولویت آزاد در بازهٔ ۱ تا ۱۰۰۰ برای آن در ستون G همان شیت ثبت می‌شود؛ انتخاب بعدی معمولاً اولویت ۲، بعد ۳، و ... خواهد بود.
- انتخاب‌ها **بلافاصله** در یک فایل JSON به نام `movie_picker_state.json` در **همان پوشهٔ Google Drive** که شیت در آن است، ذخیره می‌شوند. لازم نیست هنگام خروج دکمهٔ Save بزنید.
- در صورت تنظیم اختیاری GitHub mirror، همین JSON بعد از هر انتخاب در ریشهٔ مخزن سایت، کنار `index.html`، commit می‌شود.
- هیچ فیلم امتیازدار یا دارای اولویت مجدداً پیشنهاد نمی‌شود. فیلم‌هایی که قبلاً در این رابط انتخاب شده‌اند نیز حتی اگر بعداً اولویتشان را در شیت پاک کنید، دوباره پیشنهاد نمی‌شوند.
- مرتب‌سازی شیت همچنان دستی است: در Google Sheets از منوی **Movies → Sort Movies** استفاده کنید. انتخاب در رابط، کل ۱۰۰۰ ردیف را جابه‌جا نمی‌کند.

> **پروژه هنوز به‌صورت زنده منتشر یا متصل نشده است.** برای فعال‌کردن، Apps Script را یک‌بار deploy کنید و یک مخزن GitHub Pages داشته باشید. اتصال GitHub در ChatGPT به معنی داشتن کلیدهای API در کد یک وب‌سایت عمومی نیست.

## ۱. راه‌اندازی Google Apps Script (بک‌اند)

1. شیت خود را باز کنید:
   https://docs.google.com/spreadsheets/d/1LJXyVJrWrux99oqgN8OwtHlOCYVWINgDdnKnULEk4j8/edit
2. به **Extensions → Apps Script** بروید. اگر قبلاً `onEdit` یا `Sort Movies` نوشته‌اید، **آن کد را پاک نکنید**. از علامت + یک فایل Script جدید با نام `PickerBackend` بسازید و محتوای **`Code.gs`** این پروژه را در آن کپی کنید. نام فایل مهم نیست؛ نام تابع‌های `doGet` و `initializePicker` مهم‌اند.
3. از **Project Settings → Script Properties** این مقدار را اضافه کنید:

   | Property | Value |
   |---|---|
   | `PICKER_ACCESS_CODE` | یک رمز خصوصی قوی با حداقل ۱۲ کاراکتر که خودتان انتخاب می‌کنید |

   هیچ رمز یا توکنی را در GitHub Pages، `index.html` یا `app.js` ذخیره نکنید.
4. در ویرایشگر Apps Script تابع `initializePicker` را انتخاب و **Run** کنید و مجوزهای Google Drive و Google Sheets را به خود اسکریپت بدهید. این مرحله فایل JSON خالی را کنار Google Sheet در Drive می‌سازد.
5. **Deploy → New deployment → Web app** را انتخاب کنید: **Execute as: Me**، **Who has access: Anyone**. Deploy و URL پایان‌یافته با `/exec` را کپی کنید.
6. بعداً اگر `Code.gs` را اصلاح کردید، از **Deploy → Manage deployments → Edit → New version → Deploy** استفاده کنید تا نسخهٔ وب‌اپ به‌روز شود.

**امنیت:** سرویس `Anyone` از نظر شبکه قابل دسترسی است، اما بدون `PICKER_ACCESS_CODE` داده‌ای را برنمی‌گرداند و انتخابی ثبت نمی‌کند. چون API برای حل مشکل CORS از JSONP استفاده می‌کند، درخواست‌ها روی GET و رمز ورودی از طریق HTTPS در پارامتر URL به Google ارسال می‌شوند. این الگو برای اپ شخصی با دادهٔ کم‌حساسیت طراحی شده، نه برای اطلاعات محرمانه یا اشتراک عمومی گسترده. اگر لینک و رمز لو برود، فرد دارندهٔ آنها می‌تواند لیست را بخواند یا تغییر دهد. رمز را فقط خودتان بدانید و در GitHub commit نکنید.

## ۲. راه‌اندازی GitHub Pages (فرانت‌اند)

1. یک repository **جدید** در GitHub ایجاد کنید (مثلاً `movie-picker`)؛ برای GitHub Pages معمولی می‌توانید آن را Public انتخاب کنید. از repo خصوصی موجود `mlops-training` استفاده نکنید تا پروژه‌ها جدا بمانند.
2. این فایل‌ها را در ریشهٔ repo آپلود یا commit کنید: `index.html`, `styles.css`, `app.js`, `films.json`, `movie_picker_state.json`, `.nojekyll` و `README.md`. `Code.gs` را نیز می‌توانید صرفاً برای نگهداری کد در repo بگذارید؛ **هیچ رمز و توکنی داخلش نیست**.
3. در GitHub به **Settings → Pages → Build and deployment → Deploy from a branch** بروید. Branch اصلی (معمولاً `main`) و folder `/ (root)` را انتخاب کنید و Save بزنید.
4. نشانی Pages معمولاً چنین می‌شود: `https://<username>.github.io/<repository>/`، ولی فقط URL تأییدشده در GitHub Pages Settings را معتبر بدانید.
5. وب‌سایت را باز کنید، **Apps Script Web App URL** و **کد خصوصی** را وارد و **اتصال به شیت** را انتخاب کنید. URL در مرورگر شما باقی می‌ماند؛ رمز فقط در sessionStorage همان نشست ذخیره می‌شود.

### نسخهٔ JSON در کنار فایل‌های GitHub (اختیاری ولی برای خواستهٔ شما لازم)

برای اینکه پس از **هر انتخاب**، خود فایل `movie_picker_state.json` در repo هم به‌روز شود، در GitHub یک **Fine-grained personal access token** بسازید، به همان repo محدودش کنید، و به آن **Contents: Read and write** بدهید. سپس این Script Properties را در **پروژهٔ Apps Script** اضافه کنید:

| Property | Value |
|---|---|
| `GITHUB_REPO` | `YOUR_USERNAME/YOUR_REPOSITORY` |
| `GITHUB_BRANCH` | `main` (یا branch واقعی سایت) |
| `GITHUB_TOKEN` | توکن خصوصی GitHub با Contents Read/Write برای همین repo |

**توکن را به GitHub Pages یا مرورگر وارد نکنید**. توکن فقط در بخش Script Properties در سرور Google Apps Script می‌ماند؛ بک‌اند فایل JSON را از طریق GitHub API commit می‌کند. فایل `movie_picker_state.json` در یک repo عمومی برای عموم قابل مشاهده است و نام فیلم‌های انتخاب‌شده را افشا می‌کند. اگر خصوصی بودن انتخاب‌ها مهم‌تر است، این mirror را فعال نکنید؛ نسخهٔ اصلی JSON در Google Drive خودتان خودکار ذخیره می‌شود.

> GitHub Pages با هر commit جدید ممکن است دوباره build شود؛ به همین دلیل نسخهٔ Drive منبع اصلی وضعیت است و GitHub فقط mirror است. اگر GitHub mirror شکست بخورد، انتخاب در شیت و Drive از دست نمی‌رود و برنامه هشدار می‌دهد.

## ۳. استفادهٔ روزمره

1. وارد صفحهٔ GitHub Pages شوید و متصل شوید (اولین‌بار URL و رمز را وارد می‌کنید؛ در بازکردن دوبارهٔ مرورگر ممکن است لازم باشد فقط رمز را وارد کنید).
2. روی **نمایش ۲۰ فیلم** کلیک کنید.
3. از ۲۰ کارت، **انتخاب این فیلم** را برای یکی از آنها بزنید؛ صبر کنید تأیید ثبت نمایش داده شود.
4. روی **دور بعد: ۲۰ فیلم تازه** کلیک کنید.
5. در بخش **انتخاب‌های من** سوابق را ببینید یا یک نسخهٔ JSON از آنها دانلود کنید.
6. دفعهٔ بعدی برنامه وضعیت ذخیره‌شده را بازیابی می‌کند. فیلم‌های امتیازدار در شیت، یا دارای اولویت، وارد قرعه‌کشی بعدی نمی‌شوند.

### آزمایش محلی (قبل از انتشار)

در پوشهٔ پروژه دستور `python -m http.server 8000` را اجرا و آدرس `http://localhost:8000` را در مرورگر باز کنید. برای تست منطق بک‌اند بدون اتصال به Google، اگر Node.js نصب است دستور `node tests/backend.test.js` را اجرا کنید. مرور مستقیم `index.html` با `file://` ممکن است به خاطر محدودیت مرورگر در بارگذاری `films.json` حالت نمایشی را اجرا نکند.

### حالت نمایشی

**حالت نمایشی** از `films.json` استفاده می‌کند و انتخاب‌ها را فقط در localStorage همان مرورگر نگه می‌دارد. این حالت برای تست ظاهر و منطق UI است؛ **با شیت و JSON زنده سینک نمی‌شود**. بعد از راه‌اندازی واقعی، از گزینهٔ تنظیمات به حالت متصل بروید.

## ۴. ساختار پروژه

```
index.html               # رابط اصلی GitHub Pages
styles.css               # استایل واکنش‌گرا و راست‌به‌چپ
app.js                   # منطق قرعه‌کشی، تعامل و اتصال JSONP
films.json               # دادهٔ صرفاً نمایشی (فهرست ۱۰۰۰ فیلم)
movie_picker_state.json  # فایل آغازینِ mirror در مخزن؛ بک‌اند آن را به‌روز می‌کند
Code.gs                  # کد سرور Google Apps Script (باید در Apps Script نصب شود)
README.md                # راهنمای نصب
.nojekyll                # انتشار مستقیم فایل‌های استاتیک در Pages
```

## نکات

- شیت Google Sheets: ستون‌های `A:G` به‌ترتیب `Title`, `Director`, `Year`, `Country`, `Runtime`, `Personal Rating`, `Watchlist Priority`.
- ورود دستی Rating و اصلاح Priority همچنان در شیت انجام می‌شود. ابزار صرفاً یک فیلم را در هر دور به اولویت جدید اضافه می‌کند.
- هر درخواست انتخاب روی داده‌های **لحظه‌ای** شیت بررسی می‌شود. اگر فیلم در فاصلهٔ گرفتن ۲۰ پیشنهاد تا کلیک شما امتیاز گرفته باشد، انتخاب رد می‌شود تا اولویت اشتباه ثبت نشود.
- هویت فیلم از عنوان، کارگردان و سال ساخته می‌شود؛ جابه‌جایی ردیف‌ها در شیت هویت انتخاب‌ها را خراب نمی‌کند.
- JSON بک‌اند در همان پوشهٔ Google Drive ساخته می‌شود که فایل Sheet قرار دارد؛ بنابراین حتی اگر مرورگر عوض شود، سوابق باقی می‌مانند.

## قابلیت لغو انتخاب (Undo Pick)

در سایت از **انتخاب‌های من / My picks** می‌توانید کنار هر فیلم گزینه **لغو انتخاب / Undo pick** را بزنید. پس از تأیید، انتخاب از تاریخچهٔ JSON حذف می‌شود. اگر فیلم هنوز اولویت داشته باشد، مقدار ستون G آن پاک می‌شود و اولویت‌های بزرگ‌تر یک واحد کم می‌شوند. **Personal Rating هیچ‌وقت پاک نمی‌شود.** فیلم بدون امتیاز دوباره می‌تواند در قرعه‌کشی بیاید؛ فیلم امتیازدار همچنان از قرعه‌کشی کنار می‌ماند. حالت نمایشی هم لغو انتخاب را در حافظهٔ مرورگر پشتیبانی می‌کند.

**برای فعال شدن لغو انتخاب در حالت متصل:** نسخهٔ جدید بک‌اند را در فایل `PickerBackend.gs` پروژهٔ Apps Script جایگزین و ذخیره کنید؛ سپس **Deploy → Manage deployments → Edit → New version → Deploy** را انجام دهید. صرفاً تغییر فایل‌های GitHub Pages کافی نیست و تا زمانی که بک‌اند به‌روزرسانی نشود، سایت نمی‌تواند لغو انتخاب را در Google Sheets اجرا کند.

## Personal Rating داخل سایت (۱ تا ۱۰)

بخش **جست‌وجو و امتیازدهی** به سایت اضافه شد. امکان دادن، اصلاح یا پاک‌کردن امتیاز فیلم‌ها از ۳ جا وجود دارد: کارت‌های ۲۰ فیلم تصادفی، بخش انتخاب‌های من و جست‌وجو در همه ۱۰۰۰ فیلم. نتایج جست‌وجو حداکثر ۴۰ مورد را در هر درخواست نمایش می‌دهند. امتیاز فقط عدد صحیح بین ۱ و ۱۰ یا خالی (حذف امتیاز) است.

در حالت اتصال واقعی، امتیاز در ستون **F (Personal Rating)** از تب `Movies` در Google Sheets ثبت می‌شود. اگر هنگام ثبت امتیاز فیلم اولویت G داشته باشد، اولویت آن حذف می‌شود و اولویت‌های بزرگ‌تر ۱ واحد کم می‌شوند؛ این کار در خود Apps Script انجام می‌شود زیرا تغییرات برنامه‌نویسی‌شده تریگر ساده `onEdit` را فعال نمی‌کنند. فیلم امتیازدار دیگر در قرعه‌کشی‌های ۲۰تایی ظاهر نمی‌شود. اگر فقط امتیاز را پاک کنی، اولویت قبلی به‌طور خودکار برنمی‌گردد. تاریخچهٔ انتخاب‌ها در JSON حفظ می‌شود.

**برای فعال‌سازی این قابلیت در حالت واقعی:** فایل `PickerBackend_with_Ratings.gs` تحویلی را جایگزین محتوای فایل `PickerBackend.gs` در همان پروژه Apps Script کن. فایل قدیمی `Code.gs` (توابع onOpen/onEdit/sortMovies) را تغییر نده. سپس **Deploy → Manage deployments → Edit → New version → Deploy**. تنظیمات `PICKER_ACCESS_CODE` و URL قبلی بدون تغییر باقی می‌مانند. بک‌اند جدید همچنان انتخاب و لغو انتخاب را پشتیبانی می‌کند و نیازی به TMDB یا کلید پوستر ندارد.

**حالت نمایشی** امتیازها را فقط در localStorage مرورگر ذخیره می‌کند و Google Sheets را تغییر نمی‌دهد.

## TMDB poster integration (November 2026)

The site supports movie posters from TMDB. The public code contains **no TMDB token**; poster metadata comes through the existing authorized Apps Script backend. Movies are matched by normalized title and release year (±1 year). Nonmatching titles retain styled fallback covers. The backend caches lookups for six hours; the browser additionally caches positive matches for 30 days and missing posters for 24 hours.

**Installation:** Save `TMDB_READ_ACCESS_TOKEN` (TMDB API Read Access Token) as a **Script Property** in the existing Apps Script project. If only the shorter API v3 key is available, save that as `TMDB_API_KEY` instead. Replace the contents of `PickerBackend.gs` with the generated **PickerBackend_with_Ratings_and_Posters.gs**, retaining the separate `Code.gs` containing `onOpen`, `onEdit` and `sortMovies`. Save. Select `testTmdbConnection`, run it, and grant permissions for external calls; check for `TMDB connection OK` in Execution log. Then use **Deploy → Manage deployments → Edit → New version → Deploy** to update the existing /exec endpoint without changing its URL.

The integration preserves **pick, cancel, rate, search**, Google Sheets sync and the Drive JSON history. It does **not** require a TMDB token in GitHub. Image requests are looked up in groups of five film keys. Missing posters do not block movie picking.

If permissions errors appear, review the optional explicit `oauthScopes` in `appsscript.json`; when scopes are explicitly listed, they must include `https://www.googleapis.com/auth/script.external_request` as well as the existing Sheets and Drive scopes.

TMDB copyright/attribution guidance: https://www.themoviedb.org/about/logos-attribution

### Improving missing TMDB posters

The optional backend `PickerBackend_with_Better_Posters.gs` uses a more tolerant but year-verified title match (including capitalization, punctuation, short/long variants, localized alternate-title search results) and retries missing titles without the year filter. It rejects unrelated remakes and ambiguous same-year results. Run the read-only `testPosterCoverage` function manually, then deploy **New version** on the existing Web App. The browser poster cache has been bumped to v2 so previously missing posters are retried; negative matches now expire after 45 minutes. This can improve coverage but is **not** guaranteed to cover all titles, especially films absent from TMDB or with a different title.
