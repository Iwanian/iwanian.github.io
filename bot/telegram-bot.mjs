#!/usr/bin/env node
// Minimal example Telegram bot for Iwana (Node 18+, no dependencies, long polling).
//   BOT_TOKEN=123:abc SITE=https://USER.github.io/REPO/ node telegram-bot.mjs
// Optional: NOTIFY_CHAT=<chat id> to also post update notices (instead of / besides the Action's own notice).
const TOKEN = process.env.BOT_TOKEN, SITE = (process.env.SITE || '').replace(/\/?$/, '/');
if (!TOKEN || !SITE.startsWith('https://')) { console.error('Set BOT_TOKEN and SITE'); process.exit(1); }
const tg = (m, b) => fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const get = p => fetch(SITE + p + '?t=' + Date.now()).then(r => r.json());
const send = (chat, text, extra = {}) => tg('sendMessage', { chat_id: chat, text, disable_web_page_preview: true, ...extra });
const PLAT = { android: 'Android', ios: 'iOS', windows: 'Windows', macos: 'macOS', linux: 'Linux', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', opera: 'Opera', safari: 'Safari' };

async function listApps(chat) {
  const { apps } = await get('api/apps.json');
  const rows = apps.map(a => [{ text: a.name + (a.version ? ' · ' + a.version : ''), callback_data: 'app:' + a.id }]);
  await send(chat, 'یک برنامه را انتخاب کنید:', { reply_markup: { inline_keyboard: rows } });
}
async function showApp(chat, id) {
  const [{ apps }, { guides }] = await Promise.all([get('api/apps.json'), get('api/os-guides.json')]);
  const a = apps.find(x => x.id === id); if (!a) return send(chat, 'برنامه پیدا نشد.');
  const lines = [`${a.name}${a.version ? ' — ' + a.version : ''}`, a.description, ''];
  for (const d of a.downloads) lines.push(`• ${PLAT[d.platform] || d.platform}${d.arch ? ' ' + d.arch : ''}${d.format ? ' (.' + d.format + ')' : ''}: ${d.url}`);
  if (!a.downloads.length) lines.push('فعلاً لینک دانلود مستقیمی ثبت نشده.');
  if (a.guide_steps.length) lines.push('', 'آموزش:', ...a.guide_steps.map((s, i) => `${i + 1}. ${s}`));
  const plats = [...new Set(a.downloads.map(d => d.platform))];
  for (const g of guides.filter(g => plats.includes(g.id))) lines.push('', g.title + ':', ...g.steps.map((s, i) => `${i + 1}. ${s}`));
  await send(chat, lines.join('\n').slice(0, 4000));
}

let offset = 0, lastSeq = null;
const subscribers = new Set((process.env.NOTIFY_CHAT || '').split(',').filter(Boolean));
async function checkUpdates() {
  if (!subscribers.size) return;
  const u = await get('api/updates.json');
  if (lastSeq === null) { lastSeq = u.seq; return; }
  for (const e of u.updates.filter(e => e.id > lastSeq).reverse())
    for (const c of subscribers) await send(c, `${e.type === 'new' ? '🆕' : '🔄'} ${e.name} ${e.version || ''}\n/app_${e.app}`);
  lastSeq = u.seq;
}
setInterval(() => checkUpdates().catch(e => console.log('updates', e.message)), 5 * 60e3); checkUpdates().catch(() => {});

for (;;) {
  try {
    const r = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
    for (const u of r.result || []) {
      offset = u.update_id + 1;
      if (u.callback_query) { const q = u.callback_query; await tg('answerCallbackQuery', { callback_query_id: q.id }); if (/^app:/.test(q.data)) await showApp(q.message.chat.id, q.data.slice(4)); continue; }
      const m = u.message; if (!m || !m.text) continue;
      const t = m.text.trim();
      if (/^\/(start|apps)/.test(t)) await listApps(m.chat.id);
      else if (/^\/app_/.test(t)) await showApp(m.chat.id, t.slice(5).split(/[@\s]/)[0]);
      else if (/^\/subscribe/.test(t)) { subscribers.add(String(m.chat.id)); await send(m.chat.id, 'از این پس خبر آپدیت‌ها را اینجا می‌گیرید.'); }
      else await send(m.chat.id, 'دستورها: /apps ، /subscribe');
    }
  } catch (e) { console.log(e.message); await new Promise(r => setTimeout(r, 5000)); }
}
