#!/usr/bin/env node
// Finds the real download files behind every link in docs/data/content.json and writes docs/data/resolved.json.
// Runs in GitHub Actions (no CORS limits there), on every content change and every 6 hours. Zero dependencies (Node 18+).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = new Function(fs.readFileSync(path.join(here, 'shared_detect.js'), 'utf8') + '\nreturn {classifyAsset, classifyUrl, safeHref, verOf};')();
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
    out.push({ kind: 'asset', src: owner + '/' + repo, ri, plat: x.plat, arch: x.arch, fmt: x.fmt, href: a.browser_download_url, name: a.name, size: a.size || 0, tag: String(r.tag_name || ''), pre: !!r.prerelease });
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || 'docs';
  const dataDir = path.join(root, 'data');
  const content = JSON.parse(fs.readFileSync(path.join(dataDir, 'content.json'), 'utf8'));
  const outFile = path.join(dataDir, 'resolved.json');
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(outFile, 'utf8')).links || {}; } catch {}
  const links = await resolveAll(content, fetch, prev);
  if (JSON.stringify(links) === JSON.stringify(prev)) console.log('no change');
  else { fs.writeFileSync(outFile, JSON.stringify({ t: new Date().toISOString(), links }, null, 1)); console.log('written', outFile); }
}
