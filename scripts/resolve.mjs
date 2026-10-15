#!/usr/bin/env node
// Finds the real download files behind every link in docs/data/content.json and writes docs/data/resolved.json.
// Runs in GitHub Actions (no CORS limits there), on every content change and every 6 hours. Zero dependencies (Node 18+).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = new Function(fs.readFileSync(path.join(here, 'shared_detect.js'), 'utf8') + '\nreturn {classifyAsset, classifyUrl, safeHref, verOf, cmpVer};')();
const UA = 'Mozilla/5.0 (compatible; IwanaResolver/1.0)';
const MAX_HTML = 3 * 1024 * 1024;

async function getText(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, { redirect: 'follow', headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(25000) });
  return res;
}

async function githubCands(fetchImpl, owner, repo) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': UA };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=12`, { headers, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('github ' + res.status);
  const list = (await res.json()).filter(r => r && !r.draft);
  list.sort((a, b) => String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || '')));
  const out = [];
  list.forEach((r, ri) => (r.assets || []).forEach(a => {
    const x = D.classifyAsset(a.name); if (!x || !/^https:\/\/github\.com\//.test(a.browser_download_url || '')) return;
    out.push({ kind: 'asset', src: owner + '/' + repo, ri, plat: x.plat, arch: x.arch, fmt: x.fmt, href: a.browser_download_url, name: a.name, size: a.size || 0, tag: String(r.tag_name || ''), pre: !!r.prerelease, date: String(r.published_at || r.created_at || '') });
  }));
  return out;
}

const decode = s => s.replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
async function pageCands(fetchImpl, url) {
  const res = await getText(fetchImpl, url, { Accept: 'text/html,application/xhtml+xml,*/*' });
  if (!res.ok) throw new Error('http ' + res.status);
  const final = res.url || url;
  const cd = res.headers.get('content-disposition') || '', ct = (res.headers.get('content-type') || '').toLowerCase();
  const fn = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd);
  if (fn || (ct && !/text\/html|xhtml|json|xml|text\/plain/.test(ct))) {   // the link itself is a file
    const name = decodeURIComponent(fn ? fn[1] : final.split('?')[0].split('/').pop() || '');
    const x = D.classifyAsset(name);
    return x ? [{ kind: 'direct', plat: x.plat, arch: x.arch, fmt: x.fmt, href: final, name, ver: D.verOf({ name }) }] : [];
  }
  const html = (await res.text()).slice(0, MAX_HTML);
  const found = new Set();
  for (const m of html.matchAll(/(?:href|src|data-href|data-url|data-download|content)\s*=\s*["']([^"']+)["']/gi)) found.add(decode(m[1]));
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^\s"'<>)]+/g)) found.add(decode(m[0]));
  const out = [], seen = new Set();
  for (const raw of found) {
    let u; try { u = new URL(raw.trim(), final); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const href = u.href; if (seen.has(href)) continue;
    const base = decodeURIComponent(u.pathname.split('/').pop() || '');
    const x = D.classifyAsset(base);
    if (x) { seen.add(href); out.push({ kind: 'direct', plat: x.plat, arch: x.arch, fmt: x.fmt, href, name: base, ver: D.verOf({ name: base }) }); continue; }
    const c = D.classifyUrl(href);
    if (c.type === 'store' && !seen.has(href)) { seen.add(href); out.push({ kind: 'store', plat: c.plat, href, store: c.store }); }
    if (out.length >= 80) break;
  }
  return out;
}

export async function resolveLink(fetchImpl, url) {
  const c = D.classifyUrl(url);
  if (c.type === 'github') return githubCands(fetchImpl, c.owner, c.repo);
  if (c.type === 'store') return [{ kind: 'store', plat: c.plat, href: url, store: c.store }];
  if (c.type === 'direct') return [{ kind: 'direct', plat: c.plat, arch: c.arch, fmt: c.fmt, href: url, name: decodeURIComponent(url.split('?')[0].split('/').pop() || '') }];
  return pageCands(fetchImpl, url);
}

export async function resolveAll(content, fetchImpl = fetch, previous = {}) {
  const urls = new Set();
  for (const a of content.apps || []) for (const l of a.links || []) { const u = D.safeHref(l && l.url); if (u) urls.add(u); }
  const links = {};
  for (const u of urls) {
    try { links[u] = await resolveLink(fetchImpl, u); console.log('ok  ', u, links[u].length, 'files'); }
    catch (e) { links[u] = previous[u] || []; console.log('FAIL', u, String(e.message || e), previous[u] ? '(kept previous)' : ''); }
  }
  return links;
}


const DEFAULT_BASE = 'https://iwanian.github.io/website/';
export function baseUrl(content, env = process.env) {
  let b = content && content.site && content.site.url || '';
  if (!/^https:\/\//.test(b) && env.GITHUB_REPOSITORY) {
    const [o, r] = env.GITHUB_REPOSITORY.split('/');
    b = r.toLowerCase() === (o + '.github.io').toLowerCase() ? `https://${o}.github.io/` : `https://${o}.github.io/${r}/`;
  }
  if (!/^https:\/\//.test(b)) b = DEFAULT_BASE;
  return b.endsWith('/') ? b : b + '/';
}

const bestVer = ds => ds.reduce((m, d) => (d.version && (!m || D.cmpVer({ ver: d.version }, { ver: m }) > 0) ? d.version : m), '');

export function buildApps(content, links, base, t) {
  const abs = p => (p ? base + p : '');
  const apps = (content.apps || []).map(a => {
    const downloads = [];
    const seen = new Set();
    for (const l of a.links || []) {
      const u = D.safeHref(l && l.url); if (!u) continue;
      for (const c of links[u] || []) {
        if (!c.href || seen.has(c.href)) continue;
        if (l.os && c.plat && l.os !== c.plat && !(['edge', 'opera'].includes(l.os) && c.plat === 'chrome')) continue;
        seen.add(c.href);
        downloads.push({ platform: c.plat || l.os || '', arch: c.arch || '', format: c.fmt || '', kind: c.kind === 'store' ? 'store' : 'file', store: c.store || '', url: c.href, name: c.name || '', version: c.tag || c.ver || '', prerelease: !!c.pre, size: c.size || 0, published: c.date || '' });
      }
    }
    return {
      id: a.id, name: a.name, category: a.category, kind: a.kind || '', description: a.desc || '',
      icon: a.icon ? abs(a.icon) : '', page: base + '#apps', homepage: a.home || '', guide_url: a.guideUrl || '', guide_steps: a.steps || [],
      version: bestVer(downloads), downloads,
    };
  });
  return { generated: t, site: base, count: apps.length, apps };
}

const sigOf = a => (a.version || '') + '|' + a.downloads.map(d => d.url).sort().join(',');

export function diffUpdates(prevApps, apps, prevUpdates, t) {
  const events = [];
  if (prevApps) {
    const before = new Map(prevApps.apps.map(a => [a.id, a]));
    for (const a of apps.apps) {
      const p = before.get(a.id);
      if (!a.downloads.length) continue;
      if (!p) { events.push({ app: a.id, name: a.name, type: 'new', version: a.version, previous: '', t }); continue; }
      if (sigOf(p) !== sigOf(a)) events.push({ app: a.id, name: a.name, type: 'update', version: a.version, previous: p.version || '', t });
    }
  }
  const list = (prevUpdates && prevUpdates.updates || []);
  const all = events.concat(list).slice(0, 100);
  const seq = (prevUpdates && prevUpdates.seq || 0) + events.length;
  return { events, file: { generated: t, seq, updates: all.map((e, i) => ({ ...e, id: seq - i })) } };
}

async function telegram(events, apps, base) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat || !events.length) return;
  for (const e of events) {
    const a = apps.apps.find(x => x.id === e.app);
    const lines = [(e.type === 'new' ? '🆕 ' : '🔄 ') + e.name + (e.version ? ' — ' + e.version : '')];
    for (const d of (a && a.downloads || []).slice(0, 6)) lines.push(`• ${d.platform}${d.arch ? ' ' + d.arch : ''}${d.format ? ' .' + d.format : ''}: ${d.url}`);
    try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: lines.join('\n'), disable_web_page_preview: true }) }); } catch (e2) { console.log('telegram failed', String(e2.message || e2)); }
  }
}

function patchBase(root, base) {
  if (base === DEFAULT_BASE) return;
  for (const f of ['index.html', 'support.html', 'sitemap.xml', 'robots.txt']) {
    const p = path.join(root, f); if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, 'utf8');
    if (t.includes(DEFAULT_BASE)) fs.writeFileSync(p, t.split(DEFAULT_BASE).join(base));
  }
}

const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeIf = (p, obj) => { const n = JSON.stringify(obj, null, 1); let o = ''; try { o = fs.readFileSync(p, 'utf8'); } catch {} if (o === n) return false; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, n); return true; };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || 'docs';
  const dataDir = path.join(root, 'data'), apiDir = path.join(root, 'api');
  const content = JSON.parse(fs.readFileSync(path.join(dataDir, 'content.json'), 'utf8'));
  const outFile = path.join(dataDir, 'resolved.json');
  const prev = readJson(outFile, {}).links || {};
  const links = await resolveAll(content, fetch, prev);
  const t = new Date().toISOString();
  if (JSON.stringify(links) === JSON.stringify(prev)) console.log('no change');
  else { fs.writeFileSync(outFile, JSON.stringify({ t, links }, null, 1)); console.log('written', outFile); }
  const base = baseUrl(content);
  const prevApps = readJson(path.join(apiDir, 'apps.json'), null);
  const apps = buildApps(content, links, base, t);
  // keep the old timestamp when nothing but the timestamp changed, so the repo does not get a commit every 10 minutes
  if (prevApps && JSON.stringify({ ...prevApps, generated: 0 }) === JSON.stringify({ ...apps, generated: 0 })) apps.generated = prevApps.generated;
  const prevUpd = readJson(path.join(apiDir, 'updates.json'), null);
  const { events, file } = diffUpdates(prevApps, apps, prevUpd, t);
  if (!events.length && prevUpd) file.generated = prevUpd.generated;
  writeIf(path.join(apiDir, 'apps.json'), apps);
  writeIf(path.join(apiDir, 'updates.json'), file);
  const guides = readJson(path.join(apiDir, 'os-guides.json'), null);
  if (!guides) console.log('os-guides.json missing');
  patchBase(root, base);
  if (events.length) { console.log('updates:', events.map(e => e.name + ' ' + e.version).join(', ')); await telegram(events, apps, base); }
}
