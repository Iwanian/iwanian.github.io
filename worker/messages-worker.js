// Iwana message box — Cloudflare Worker (free plan is enough). Stores visitor messages in KV; no email, no third party.
// Bindings:  KV namespace  MSGS
// Variables: ALLOWED_ORIGIN = https://USER.github.io        (your site's origin, no path)
// Secrets:   ADMIN_TOKEN    = a long random string          (the panel uses it to read messages)
// Optional:  TG_BOT_TOKEN + TG_CHAT_ID                       (also forward each message to your Telegram)
const POW_ZEROS = '000';                        // 12 bits: ~4k hashes, well under a second in a browser
const MAX_LEN = 2000, MIN_LEN = 5, PER_HOUR = 5, MIN_GAP_S = 20, MIN_FILL_MS = 2500;
const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', te.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, te.encode(data)));
}
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

function cors(req, env, admin) {
  const o = req.headers.get('Origin') || '';
  const allow = admin ? '*' : (env.ALLOWED_ORIGIN && o === env.ALLOWED_ORIGIN ? o : (env.ALLOWED_ORIGIN || '*'));
  return { 'access-control-allow-origin': allow, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'vary': 'Origin' };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '');
    const isAdmin = path.startsWith('/admin');
    const H = cors(req, env, isAdmin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    try {
      if (!env.MSGS || !env.ADMIN_TOKEN) return json({ error: 'پیکربندی ناقص است (MSGS / ADMIN_TOKEN).' }, 500, H);
      const signKey = env.SIGN_KEY || env.ADMIN_TOKEN;

      if (req.method === 'GET' && path === '/challenge') {
        const c = crypto.randomUUID().replace(/-/g, ''), ts = Date.now();
        return json({ c, ts, sig: await hmac(signKey, c + '.' + ts), zeros: POW_ZEROS.length }, 200, H);
      }

      if (req.method === 'POST' && path === '/send') {
        if (env.ALLOWED_ORIGIN && req.headers.get('Origin') !== env.ALLOWED_ORIGIN) return json({ error: 'مبدأ درخواست مجاز نیست.' }, 403, H);
        let b; try { b = await req.json(); } catch { return json({ error: 'درخواست نامعتبر است.' }, 400, H); }
        if (b.hp) return json({ ok: true }, 200, H);                                   // honeypot: pretend success
        const text = String(b.message || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
        if (text.length < MIN_LEN) return json({ error: 'پیام خیلی کوتاه است.' }, 400, H);
        if (text.length > MAX_LEN) return json({ error: 'پیام بیش از ' + MAX_LEN + ' نویسه است.' }, 400, H);
        if ((text.match(/https?:\/\/|www\.|t\.me\//gi) || []).length > 2) return json({ error: 'تعداد لینک‌ها زیاد است.' }, 400, H);
        if (!(+b.fill >= MIN_FILL_MS)) return json({ error: 'کمی بعد دوباره تلاش کنید.' }, 429, H);
        // proof of work: signed, short-lived, single-use challenge
        const ts = +b.ts;
        if (!b.c || !ts || Date.now() - ts > 15 * 60e3 || ts > Date.now() + 5e3) return json({ error: 'اعتبار فرم تمام شد؛ صفحه را تازه کنید.' }, 400, H);
        if (!same(await hmac(signKey, b.c + '.' + ts), b.sig || '')) return json({ error: 'فرم نامعتبر است.' }, 400, H);
        if (!(await sha(b.c + ':' + b.nonce)).startsWith(POW_ZEROS)) return json({ error: 'بررسی ضدربات ناموفق بود.' }, 400, H);
        if (await env.MSGS.get('u:' + b.c)) return json({ error: 'این فرم قبلاً استفاده شده است.' }, 400, H);
        await env.MSGS.put('u:' + b.c, '1', { expirationTtl: 1800 });
        // rate limit per visitor (only a hash of the address is kept, for one hour)
        const ip = req.headers.get('CF-Connecting-IP') || 'x', rk = 'r:' + (await sha(ip + signKey)).slice(0, 24);
        const rec = JSON.parse((await env.MSGS.get(rk)) || '{"n":0,"t":0}');
        if (Date.now() - rec.t < MIN_GAP_S * 1000 || rec.n >= PER_HOUR) return json({ error: 'پیام‌های پیاپی؛ کمی بعد دوباره بفرستید.' }, 429, H);
        // duplicate text
        const dk = 'd:' + (await sha(text.toLowerCase())).slice(0, 24);
        if (await env.MSGS.get(dk)) return json({ ok: true }, 200, H);
        await env.MSGS.put(dk, '1', { expirationTtl: 86400 });
        await env.MSGS.put(rk, JSON.stringify({ n: rec.n + 1, t: Date.now() }), { expirationTtl: 3600 });
        const now = Date.now(), id = String(9999999999999 - now).padStart(13, '0') + '-' + crypto.randomUUID().slice(0, 6);
        await env.MSGS.put('m:' + id, JSON.stringify({ id, t: now, text, read: false }));
        if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) ctx.waitUntil(fetch('https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: '📩 پیام جدید از سایت:\n\n' + text.slice(0, 3500) }) }).catch(() => {}));
        return json({ ok: true }, 200, H);
      }

      if (isAdmin) {
        const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (!same(auth, env.ADMIN_TOKEN)) return json({ error: 'توکن نادرست است.' }, 401, H);
        if (req.method === 'GET' && path === '/admin/list') {
          const l = await env.MSGS.list({ prefix: 'm:', limit: 200, cursor: url.searchParams.get('cursor') || undefined });
          const items = (await Promise.all(l.keys.map(k => env.MSGS.get(k.name)))).filter(Boolean).map(v => JSON.parse(v));
          return json({ items, cursor: l.list_complete ? '' : l.cursor }, 200, H);
        }
        if (req.method === 'POST' && path === '/admin/delete') { const b = await req.json(); if (!/^[0-9]{13}-[0-9a-f]{6}$/.test(b.id || '')) return json({ error: 'bad id' }, 400, H); await env.MSGS.delete('m:' + b.id); return json({ ok: true }, 200, H); }
        if (req.method === 'POST' && path === '/admin/read') { const b = await req.json(); const v = await env.MSGS.get('m:' + b.id); if (!v) return json({ error: 'not found' }, 404, H); const m = JSON.parse(v); m.read = !!b.read; await env.MSGS.put('m:' + b.id, JSON.stringify(m)); return json({ ok: true }, 200, H); }
      }
      return json({ error: 'not found' }, 404, H);
    } catch (e) { return json({ error: 'خطای سرور' }, 500, H); }
  },
};
