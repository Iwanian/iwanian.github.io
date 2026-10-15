# جعبهٔ پیام (Cloudflare Worker، رایگان)

سایت روی GitHub Pages سرور ندارد؛ پس برای دریافت پیام یک Worker کوچک لازم است. بدون ایمیل و بدون سرویس ثالث؛ پیام‌ها در KV خودتان ذخیره می‌شوند.

۱. در dash.cloudflare.com → Workers & Pages → Create → Worker. کد `messages-worker.js` را جایگزین کد پیش‌فرض کنید و Deploy بزنید.
۲. Storage & Databases → KV → یک namespace بسازید (مثلاً `iwana-msgs`). در Worker → Settings → Bindings → KV namespace: نام متغیر `MSGS`.
۳. Worker → Settings → Variables and Secrets:
   - `ALLOWED_ORIGIN` = آدرس سایت بدون مسیر، مثل `https://iwanian.github.io` (Text)
   - `ADMIN_TOKEN` = یک رشتهٔ طولانی تصادفی (Secret)
   - اختیاری: `TG_BOT_TOKEN` و `TG_CHAT_ID` (Secret) تا هر پیام به تلگرام خودتان هم برود.
۴. آدرس Worker را (مثل `https://iwana-messages.NAME.workers.dev`) و `ADMIN_TOKEN` را در پنل → تنظیمات → «پیام‌های بازدیدکنندگان» بگذارید. تب «پیام‌ها» فعال می‌شود و فرم فوتر سایت پدیدار می‌شود (تا آدرس نباشد فقط دکمهٔ تلگرام دیده می‌شود).

ضد اسپم: honeypot، حداقل زمان پر کردن فرم، اثبات کار (proof-of-work) امضاشده و یک‌بارمصرف، محدودیت ۵ پیام در ساعت و ۲۰ ثانیه فاصله برای هر بازدیدکننده (فقط هش آدرس و فقط یک ساعت)، حذف پیام تکراری، حداکثر ۲ لینک، ۲۰۰۰ نویسه، و محدود بودن به مبدأ سایت شما.
