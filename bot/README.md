# API ربات تلگرام

سایت چند فایل JSON ثابت دارد (روی GitHub Pages، بدون سرور):

| آدرس | محتوا |
|---|---|
| `api/apps.json` | فقط برنامه‌ها (نه پروژه‌ها): `id, name, category, kind, description, icon, guide_steps, version, downloads[]` |
| `api/updates.json` | آخرین آپدیت‌ها: `seq` و `updates[]` با `id, app, name, type(new/update), version, previous, t` |
| `api/os-guides.json` | آموزش نصب هر سیستم‌عامل |

هر `downloads[]`: `platform, arch, format, kind(file/store), url, version, prerelease, size`.
فایل‌ها هر ~۱۰ دقیقه توسط GitHub Action به‌روز می‌شوند. اولین اجرا فقط مبنا را ثبت می‌کند (اعلان نمی‌دهد).

## اعلان خودکار آپدیت
در ریپو: Settings → Secrets and variables → Actions → دو secret بسازید: `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHAT_ID`. با هر آپدیت پیام می‌رسد.

## ربات نمونه
`BOT_TOKEN=... SITE=https://USER.github.io/REPO/ node telegram-bot.mjs`
دستورها: `/apps` (فهرست)، `/app_<id>` (لینک‌ها و آموزش)، `/subscribe`.
