/*DETECT:START*/
/* Shared by the site and the admin panel (synced by sync_detect.py). DOM-free. */
var PLATS = {android:'Android', ios:'iOS', windows:'Windows', macos:'macOS', linux:'Linux', chrome:'Chrome', edge:'Edge', firefox:'Firefox', opera:'Opera', safari:'Safari'};
var OS_IDS = ['android','ios','windows','macos','linux'], BROWSER_IDS = ['chrome','edge','firefox','opera','safari'];
var FMT_PREF = {windows:['installer','portable'], macos:['dmg','pkg','zip'], linux:['appimage','deb','rpm','archive'], android:['apk','archive'], ios:['ipa'], chrome:['crx','zip'], edge:['crx','zip'], opera:['crx','zip'], firefox:['xpi'], safari:[]};
var FMT_NAMES = {apk:'APK', ipa:'IPA', installer:'نصب‌کننده (exe/msi)', portable:'قابل‌حمل (zip)', dmg:'DMG', pkg:'PKG', zip:'ZIP', appimage:'AppImage', deb:'deb (Debian/Ubuntu)', rpm:'rpm (Fedora/openSUSE)', archive:'آرشیو (tar/zip)', crx:'CRX', xpi:'XPI'};
var FALLBACK = {'windows:arm64':['x64','x86'], 'windows:x64':['x86'], 'macos:arm64':['x64'], 'android:arm64':['armv7'], 'android:x64':['x86'], 'linux:x64':['x86']};

function archOf(n, plat){
  if (/universal/.test(n)) return 'universal';
  if (/arm64|aarch64|armv8|apple-?silicon/.test(n)) return 'arm64';
  if (/armeabi|armv7|armhf|arm32|armv6/.test(n)) return 'armv7';
  if (/x86[_-]?64|amd64|x64|win64|(^|[^0-9])64-?bit|(^|[^0-9a-z])64([^0-9a-z]|$)/.test(n)) return 'x64';
  if (plat === 'macos' && /(^|[^a-z0-9])intel([^a-z0-9]|$)/.test(n)) return 'x64';
  if (/(^|[^a-z0-9])arm([^a-z0-9]|$)/.test(n)) return plat === 'macos' ? 'arm64' : 'armv7';
  if (/i[3-6]86|x86|ia32|win32|(^|[^0-9])32-?bit/.test(n)) return 'x86';
  return '';
}
/* file name -> {plat, arch, fmt}, or null when it is not something a person should download */
function classifyAsset(name){
  var n = String(name || '').toLowerCase(), plat = '', fmt = '';
  if (!n || /\.(sha\d*|md5|sig|asc|txt|json|ya?ml|blockmap|sbom|pem|minisig|sh|ps1|md|html|pdb|log|aab|apks)$|sha\d*sums?|checksums?|dsym|debug|symbols|(^|[-_.])(src|source)([-_.]|$)/.test(n)) return null;
  var tk = n.split(/[^a-z0-9]+/);
  var has = function(list){ return list.some(function(t){ return tk.indexOf(t) >= 0; }); };
  if (/\.apk$/.test(n)) { plat = 'android'; fmt = 'apk'; }
  else if (/\.ipa$/.test(n)) { plat = 'ios'; fmt = 'ipa'; }
  else if (/\.(msi|msix|msixbundle|appx|appxbundle)$/.test(n)) { plat = 'windows'; fmt = 'installer'; }
  else if (/\.exe$/.test(n)) { plat = 'windows'; fmt = tk.indexOf('portable') >= 0 ? 'portable' : 'installer'; }
  else if (/\.dmg$/.test(n)) { plat = 'macos'; fmt = 'dmg'; }
  else if (/\.pkg$/.test(n)) { plat = 'macos'; fmt = 'pkg'; }
  else if (/\.appimage$/.test(n)) { plat = 'linux'; fmt = 'appimage'; }
  else if (/\.deb$/.test(n)) { plat = 'linux'; fmt = 'deb'; }
  else if (/\.rpm$/.test(n)) { plat = 'linux'; fmt = 'rpm'; }
  else if (/\.xpi$/.test(n)) { plat = 'firefox'; fmt = 'xpi'; }
  else if (/\.crx$/.test(n)) { plat = 'chrome'; fmt = 'crx'; }
  else if (/\.(zip|7z|tar\.gz|tgz|tar\.xz|tar\.bz2|gz|xz)$/.test(n)) {
    if (has(['firefox','gecko'])) { plat = 'firefox'; fmt = 'xpi'; }
    else if (has(['edge'])) { plat = 'edge'; fmt = 'zip'; }
    else if (has(['chrome','chromium'])) { plat = 'chrome'; fmt = 'zip'; }
    else if (has(['win','win32','win64','windows','msvc'])) { plat = 'windows'; fmt = 'portable'; }
    else if (has(['mac','macos','darwin','osx'])) { plat = 'macos'; fmt = 'zip'; }
    else if (has(['android','termux'])) { plat = 'android'; fmt = 'archive'; }
    else if (has(['linux','gnu','musl'])) { plat = 'linux'; fmt = 'archive'; }
    else return null;
  } else return null;
  return {plat:plat, arch:(plat === 'ios' || BROWSER_IDS.indexOf(plat) >= 0) ? '' : archOf(n, plat), fmt:fmt};
}
function safeHref(u){ u = String(u || '').trim(); return /^https?:\/\/[^\s]+$/i.test(u) ? u : ''; }
/* a pasted address -> what kind of source it is */
function classifyUrl(u){
  var x, m;
  try { x = new URL(u); } catch (e) { return {type:'page'}; }
  var h = x.hostname.toLowerCase().replace(/^www\./, ''), p = x.pathname;
  if (h === 'github.com'){
    m = /^\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/(.*))?$/.exec(p);
    if (m && ['orgs','topics','sponsors','settings','marketplace','features','about','login','search','collections','explore'].indexOf(m[1]) < 0){
      var rest = m[3] || '';
      if (/^(releases\/(download|latest\/download)|archive|raw)\//.test(rest)){
        var ai0 = classifyAsset(rest.split('/').pop()); if (ai0) return {type:'direct', plat:ai0.plat, arch:ai0.arch, fmt:ai0.fmt};
      }
      return {type:'github', owner:m[1], repo:m[2], page:'https://github.com/' + m[1] + '/' + m[2] + '/releases'};
    }
  }
  if (h === 'play.google.com' || h === 'f-droid.org' || h === 'apt.izzysoft.de') return {type:'store', plat:'android', store:h === 'play.google.com' ? 'Google Play' : 'F-Droid'};
  if (h === 'apps.apple.com' || h === 'itunes.apple.com' || h === 'testflight.apple.com') return {type:'store', plat:'ios', store:'App Store'};
  if (h === 'apps.microsoft.com' || (h === 'microsoft.com' && /\/store\//.test(p))) return {type:'store', plat:'windows', store:'Microsoft Store'};
  if (h === 'flathub.org' || h === 'snapcraft.io') return {type:'store', plat:'linux', store:h};
  if (h === 'chromewebstore.google.com' || (h === 'chrome.google.com' && /^\/webstore/.test(p))) return {type:'store', plat:'chrome', store:'Chrome Web Store'};
  if (h === 'addons.mozilla.org') return {type:'store', plat:'firefox', store:'Firefox Add-ons'};
  if (h === 'microsoftedge.microsoft.com') return {type:'store', plat:'edge', store:'Edge Add-ons'};
  if (h === 'addons.opera.com') return {type:'store', plat:'opera', store:'Opera Add-ons'};
  var ai = classifyAsset(decodeURIComponent(p.split('/').pop() || ''));
  if (ai) return {type:'direct', plat:ai.plat, arch:ai.arch, fmt:ai.fmt};
  return {type:'page'};
}
function platOK(cp, tp){ return cp === tp || (cp === 'chrome' && (tp === 'edge' || tp === 'opera')); }
/* how well does candidate c fit target T = {plat, arch, fmt}? -1 = does not fit */
function scoreC(c, T){
  if (!T.plat) return -1;
  if (c.plat && !platOK(c.plat, T.plat)) return -1;
  var pen = (c.plat && c.plat !== T.plat) ? 10 : 0;
  if (c.kind === 'store') return (BROWSER_IDS.indexOf(T.plat) >= 0 ? 120 : 40) - pen;   /* extensions: the store beats loose files */
  var a = c.arch, t = T.arch, s;
  if (!t) s = a ? 55 : 60;
  else if (a === t) s = 100;
  else if (a === 'universal') s = 70;
  else if (!a) s = 60;
  else if ((FALLBACK[T.plat + ':' + t] || []).indexOf(a) >= 0) s = 30;
  else return -1;
  if (T.fmt) s += c.fmt === T.fmt ? 20 : 0;
  else { var i = (FMT_PREF[T.plat] || []).indexOf(c.fmt); s += i < 0 ? 0 : Math.max(0, 9 - i * 3); }
  return s - pen;
}
/* version shown on the button: release tag, else a number found in the file name */
function verOf(c){
  var t = String(c.ver || c.tag || '').replace(/^[vV]\s*/, '');
  if (!/\d/.test(t)) t = '';
  if (!t){ var m = /(\d+\.\d+(?:\.\d+){0,2}(?:[-.]?(?:beta|alpha|rc|nightly|preview|pre)[.-]?\d*)?)/i.exec(String(c.name || '').replace(/(x|amd|arm|i)\d{2,3}/gi, '')); t = m ? m[1] : ''; }
  return t.length > 24 ? t.slice(0, 24) : t;
}
function cmpVer(a, b){
  var x = (verOf(a).match(/\d+/g) || []).map(Number), y = (verOf(b).match(/\d+/g) || []).map(Number);
  for (var i = 0; i < Math.max(x.length, y.length); i++){ var d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
/* newest release that has a fitting file wins; then the best-fitting source overall */
function pickBest(cands, T){
  var groups = {}, rest = [];
  cands.forEach(function(c){
    var s = scoreC(c, T); if (s < 0) return;
    if (c.kind === 'asset') (groups[c.src] = groups[c.src] || []).push({c:c, s:s}); else rest.push({c:c, s:s});
  });
  Object.keys(groups).forEach(function(k){
    var g = groups[k], good = g.filter(function(x){ return x.s >= 50; });
    if (good.length){ good.sort(function(a, b){ return a.c.ri - b.c.ri || b.s - a.s; }); rest.push(good[0]); }
    else { g.sort(function(a, b){ return b.s - a.s || a.c.ri - b.c.ri; }); rest.push(g[0]); }
  });
  rest.sort(function(a, b){ return b.s - a.s || cmpVer(b.c, a.c); });   /* equal fit: higher version wins */
  return rest.length ? rest[0].c : null;
}
var relCache = {};
function getReleases(o, r){
  var key = o + '/' + r;
  if (relCache[key]) return relCache[key];
  var ls = 'iw-rel:' + key, stale = null;
  try { var s = JSON.parse(localStorage.getItem(ls) || 'null'); if (s && s.d){ stale = s.d; if (Date.now() - s.t < 30 * 60000) return (relCache[key] = Promise.resolve(s.d)); } } catch (e) {}
  return (relCache[key] = fetch('https://api.github.com/repos/' + encodeURIComponent(o) + '/' + encodeURIComponent(r) + '/releases?per_page=12', {headers:{Accept:'application/vnd.github+json'}})
    .then(function(res){ if (!res.ok) throw new Error('github ' + res.status); return res.json(); })
    .then(function(list){
      var d = list.filter(function(x){ return x && !x.draft; }).map(function(x){
        return {tag:String(x.tag_name || ''), pre:!!x.prerelease, date:x.published_at || x.created_at || '', url:String(x.html_url || ''),
          assets:(x.assets || []).map(function(a){ return {name:String(a.name || ''), size:a.size || 0, url:String(a.browser_download_url || '')}; }).filter(function(a){ return /^https:\/\/github\.com\//.test(a.url); })};
      });
      d.sort(function(a, b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      try { localStorage.setItem(ls, JSON.stringify({t:Date.now(), d:d})); } catch (e) {}
      return d;
    }).catch(function(e){ delete relCache[key]; if (stale) return stale; throw e; }));
}
var RESOLVED_LINKS = {};   /* url -> candidates found by the scheduled resolver (data/resolved.json) */
function forcedOnly(list, forced){ return forced ? list.filter(function(x){ return !x.plat || platOK(x.plat, forced); }) : list; }
function linkCands(L){
  var forced = L.os || '', c, name, ai;
  if (L.file){
    var m = /^downloads\/([a-z]+)\//.exec(L.file); name = L.file.split('/').pop(); ai = classifyAsset(name) || {};
    return Promise.resolve([{kind:'file', plat:forced || (m && m[1]) || ai.plat || '', arch:ai.arch || '', fmt:ai.fmt || '', href:L.file, name:name}]);
  }
  var url = safeHref(L.url); if (!url) return Promise.resolve([]);
  var pre = RESOLVED_LINKS[url];
  if (pre && pre.length) return Promise.resolve(forcedOnly(pre.filter(function(x){ return /^https?:\/\//.test(x.href || ''); }), forced));
  c = classifyUrl(url);
  if (c.type === 'github') return githubCands(c.owner, c.repo).then(function(l){ return forcedOnly(l, forced); }, function(){ return []; });
  if (c.type === 'store') return Promise.resolve([{kind:'store', plat:forced || c.plat, href:url, store:c.store}]);
  if (c.type === 'direct') return Promise.resolve([{kind:'direct', plat:forced || c.plat, arch:c.arch, fmt:c.fmt, href:url, name:decodeURIComponent(url.split('?')[0].split('/').pop() || '')}]);
  return Promise.resolve([]);   /* a plain page: only the resolver can look inside it */
}
function githubCands(owner, repo){
  return getReleases(owner, repo).then(function(rels){
    var out = [];
    rels.forEach(function(r, ri){
      r.assets.forEach(function(a){
        var x = classifyAsset(a.name); if (!x) return;
        out.push({kind:'asset', src:owner + '/' + repo, ri:ri, plat:x.plat, arch:x.arch, fmt:x.fmt, href:a.url, name:a.name, size:a.size, tag:r.tag, pre:r.pre});
      });
    });
    return out;
  });
}
function candsOf(links){
  return Promise.all((links || []).map(function(L, i){
    return linkCands(L).then(function(l){ return l.map(function(c){ var o = {}; for (var k in c) o[k] = c[k]; o.li = i; return o; }); });   /* li = which of the app's links it came from */
  })).then(function(l){ return [].concat.apply([], l); });
}
/* one button per link that fits: e.g. Google Play and a direct file for the same system are both offered */
function pickAll(cands, T){
  var by = {}, out = [];
  cands.forEach(function(c){ (by[c.li == null ? 0 : c.li] = by[c.li == null ? 0 : c.li] || []).push(c); });
  Object.keys(by).forEach(function(k){ var b = pickBest(by[k], T); if (b) out.push({c:b, s:scoreC(b, T), li:+k}); });
  out.sort(function(a, b){ return b.s - a.s || a.li - b.li; });
  var seen = {};
  var all = out.map(function(x){ return x.c; }).filter(function(c){ if (seen[c.href]) return false; seen[c.href] = 1; return true; });
  /* a file for this exact CPU exists -> never also show files for other CPUs */
  var exact = T && T.arch && all.some(function(c){ return c.kind !== 'store' && c.arch === T.arch; });
  return exact ? all.filter(function(c){ return c.kind === 'store' || c.arch === T.arch; }) : all;
}
function fmtBytes(n){ n = +n || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 0 ? Math.max(1, Math.round(n / 1024)) + ' KB' : ''; }
/*DETECT:END*/
