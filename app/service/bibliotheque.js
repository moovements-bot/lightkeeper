/*
 * The library of backgrounds on a server of yours (perso.6, collections since perso.7): a manifest.json at an
 * https address set in the settings, which lists pictures (3840 × 2160 JPEGs, each named by its SHA-256) with
 * their tags, and the collections made of those tags (one tag of at least three pictures each). This TV
 * reads it at start, when it comes on and every 30 minutes, and keeps a copy for when the server cannot be
 * reached. Pictures are fetched only when needed, checked against their SHA-256, and kept in a cache whose
 * size follows the room really free (Lightkeeper's 64 MB reserve kept), the least recently shown let go first.
 * The picture on the screen, the next one and the last two shown of each collection in use are always kept, so
 * the Home still has pictures without the server.
 *
 * The only requests made: GET of that manifest, and GET of the files it names, beside it on the same server.
 * Strict ES5, for the TV's node (0.12 on webOS 4).
 */
'use strict';
var https = require('https');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var urlMod = require('url');

var SYNC_EVERY = 30 * 60000;
var MAX_MANIFEST = 2 * 1024 * 1024;
var MAX_PICTURE = 12 * 1024 * 1024;
var MAX_THUMB = 512 * 1024;
var MARGIN = 8 * 1024 * 1024;      // beyond the reserve, room left for the rest of Lightkeeper
var KEEP_PER_ALBUM = 2;            // pictures of each collection in use kept for when the server is away
var ROTATE = ['power', 'manual', 15, 30, 60, 120];
var ORDERS = ['shuffle', 'order'];
var MATCHES = ['any', 'cross'];     // any collection ticked, or one of each category ticked (Van Gogh and night)
var ID = /^[0-9a-f]{16}$/;
var TAG = /^[a-z]{1,12}:[a-z0-9][a-z0-9-]{0,39}$/;
var MOMENTS = ['dawn', 'morning', 'noon', 'afternoon', 'sunset', 'dusk', 'night'];
var CAPTION = { title: 90, artist: 60, year: 16, place: 60 };
var STATUSES = ['manuelle', 'auto', 'a-verifier', 'verifie', 'nom-de-fichier']; // of a caption, as the server tells
var MAX_API = 1024 * 1024;

function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function str(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\s+|\s+$/g, '').slice(0, max) : '';
}

/*
 * The manifest's address: https only, a host name (no address, no user, no port but 443), and a path that
 * ends with manifest.json, in plain characters. '' turns the library off.
 */
function validUrl(u) {
  if (u === '') return true;
  if (typeof u !== 'string' || u.length > 300) return false;
  var m = /^https:\/\/([a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+)(\/[A-Za-z0-9._~-]+)*\/manifest\.json$/.exec(u);
  if (!m || /\.\./.test(u)) return false;
  return !/^[0-9.]+$/.test(m[1]) && /[a-z]/.test(m[1].split('.').pop());
}

/*
 * The manifest (version 2), checked field by field and cleaned: categories {id, name}, collections
 * {id, cat, name, count, cover} and pictures {id, file, thumb, bytes, sha256, caption, tags}. Anything else is
 * left out; a manifest that does not hold together is refused whole (a string says why).
 */
function checkManifest(m) {
  if (!m || typeof m !== 'object' || m.version !== 2 || !Array.isArray(m.collections) || !Array.isArray(m.items)) return 'format';
  if (m.collections.length > 2000 || m.items.length > 10000) return 'too large';
  var cats = [], catNames = {}, items = [], seen = {}, cols = [], known = {};
  (Array.isArray(m.categories) ? m.categories : []).forEach(function (c) {
    if (c && /^[a-z]{1,12}$/.test(c.id) && str(c.name, 30) && !catNames[c.id]) { catNames[c.id] = str(c.name, 30); cats.push({ id: c.id, name: catNames[c.id] }); }
  });
  for (var j = 0; j < m.items.length; j++) {
    var it = m.items[j];
    if (!it || !ID.test(it.id) || seen[it.id]) return 'picture ' + j;
    if (it.file !== 'fonds/' + it.id + '.jpg' || it.thumb !== 'vignettes/' + it.id + '.jpg') return 'picture ' + j;
    if (typeof it.bytes !== 'number' || it.bytes % 1 || it.bytes < 1 || it.bytes > MAX_PICTURE) return 'picture ' + j;
    if (typeof it.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(it.sha256) || it.sha256.slice(0, 16) !== it.id) return 'picture ' + j;
    if (it.tags !== undefined && (!Array.isArray(it.tags) || it.tags.length > 60)) return 'picture ' + j;
    var cap = {}, c = it.caption && typeof it.caption === 'object' ? it.caption : {};
    Object.keys(CAPTION).forEach(function (k) { if (str(c[k], CAPTION[k])) cap[k] = str(c[k], CAPTION[k]); });
    var tags = (it.tags || []).filter(function (t, n) { return typeof t === 'string' && TAG.test(t) && it.tags.indexOf(t) === n; });
    seen[it.id] = true;
    var one = { id: it.id, bytes: it.bytes, sha256: it.sha256, caption: cap, tags: tags };
    if (STATUSES.indexOf(it.captionStatus) !== -1) one.status = it.captionStatus;
    items.push(one);
  }
  for (var i = 0; i < m.collections.length; i++) {
    var col = m.collections[i];
    if (!col || !TAG.test(col.id) || known[col.id] || col.id.split(':')[0] !== col.cat || !str(col.name, 40)) return 'collection ' + i;
    var count = items.filter(function (x) { return x.tags.indexOf(col.id) !== -1; }).length;
    if (!count) continue;
    var cover = ID.test(col.cover) && seen[col.cover] ? col.cover : items.filter(function (x) { return x.tags.indexOf(col.id) !== -1; })[0].id;
    known[col.id] = true;
    cols.push({ id: col.id, cat: col.cat, catName: catNames[col.cat] || col.cat, name: str(col.name, 40), count: count, cover: cover });
  }
  return { categories: cats, collections: cols, items: items };
}

// A new order of the pictures: shuffled (Fisher–Yates) or as the manifest has them.
function arrange(ids, order, rnd) {
  var out = ids.slice();
  if (order !== 'shuffle') return out;
  for (var i = out.length - 1; i > 0; i--) {
    var k = Math.floor((rnd || Math.random)() * (i + 1)), x = out[i];
    out[i] = out[k];
    out[k] = x;
  }
  return out;
}

/*
 * Which cached pictures go to make room for `need` bytes within `allowed`: the least recently shown first,
 * never those protected. Null when even all of them would not be enough.
 */
function toEvict(entries, need, allowed, protect) {
  var total = 0, out = [];
  entries.forEach(function (e) { total += e.bytes; });
  var order = entries.filter(function (e) { return !protect[e.id]; }).sort(function (a, b) { return a.used - b.used; });
  for (var i = 0; total + need > allowed && i < order.length; i++) {
    out.push(order[i].id);
    total -= order[i].bytes;
  }
  return total + need > allowed ? null : out;
}

function Library(o) {
  this.o = o;                         // {data, minFree, freeSpace(cb), log, config(), mark()}
  this.dir = path.join(o.data, 'library');
  this.cacheDir = path.join(this.dir, 'cache');
  this.thumbDir = path.join(this.dir, 'thumbs');
  this.manifest = this.read('manifest.json', null);   // {url, etag, categories, collections, items}
  this.status = this.read('status.json', {});         // {lastTry, lastOk, error}
  this.uses = this.read('uses.json', {});             // id → last shown (ms)
  this.play = this.read('play.json', {});             // {key, order, pos, at, mark}
  this.fetching = {};
  this.free = null;
}

Library.prototype.read = function (name, dflt) {
  try { return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')); } catch (e) { return dflt; }
};

Library.prototype.write = function (name, value) {
  try {
    this.mkdirs();
    var f = path.join(this.dir, name);
    fs.writeFileSync(f + '.tmp', JSON.stringify(value) + '\n', { mode: 384 });
    fs.renameSync(f + '.tmp', f);
  } catch (e) { this.o.log('library: ' + e.message); }
};

Library.prototype.mkdirs = function () {
  [this.o.data, this.dir, this.cacheDir, this.thumbDir].forEach(function (d) { if (!fs.existsSync(d)) fs.mkdirSync(d, 448); });
};

Library.prototype.url = function () { var u = this.o.config().libraryUrl; return u && validUrl(u) ? u : ''; };

// The manifest for the address set now (another address's copy does not count).
Library.prototype.current = function () {
  var m = this.manifest;
  // A copy kept by perso.6 (albums, no collections) does not count: the manifest is read again.
  return m && m.url === this.url() && Array.isArray(m.collections) ? m : null;
};

/* ---------- requests ---------- */

// GET (or POST with a body) of an https address, at most `max` bytes, no redirect followed. cb(err, status, body, headers).
function get(address, headers, max, cb, method, payload) {
  var done = false, finish = function (e, s, b, h) { if (!done) { done = true; cb(e, s, b, h); } };
  var opt = urlMod.parse(address);
  opt.method = method || 'GET';
  opt.headers = headers || {};
  if (payload) { opt.headers['Content-Type'] = 'application/json'; opt.headers['Content-Length'] = Buffer.byteLength(payload); }
  var req = https.request(opt, function (res) {
    var parts = [], n = 0;
    if (res.statusCode !== 200 && !method) { res.resume(); return finish(null, res.statusCode, null, res.headers); }
    res.on('data', function (d) {
      n += d.length;
      if (n > max) { req.abort(); return finish(new Error('too large')); }
      parts.push(d);
    });
    res.on('end', function () { finish(null, 200, Buffer.concat(parts), res.headers); });
    res.on('error', finish);
  });
  req.setTimeout(60000, function () { req.abort(); finish(new Error('timeout')); });
  req.on('error', finish);
  req.end(payload || undefined);
}

/*
 * The library's captions, on the server beside the manifest (api/legendes, api/legende), with the token of the
 * config: the two fixed calls the settings page relays. cb(err, status, answer).
 */
Library.prototype.api = function (what, body, cb) {
  var token = this.o.config().libraryToken;
  if (!this.url() || !token) return cb(new Error('no library token'));
  if (what !== 'legendes' && what !== 'legende') return cb(new Error('not allowed'));
  get(this.fileUrl('api/' + what), { 'X-TV-Fonds-Token': token }, MAX_API, function (err, status, b) {
    if (err) return cb(err);
    var r = null;
    try { r = JSON.parse(String(b || '')); } catch (e) {}
    cb(null, status, r);
  }, what === 'legende' ? 'POST' : 'GET', what === 'legende' ? JSON.stringify(body) : null);
};

// Beside the manifest: the address of one of the files it names.
Library.prototype.fileUrl = function (file) { return this.url().replace(/manifest\.json$/, '') + file; };

/* ---------- reading the manifest ---------- */

Library.prototype.sync = function (cb) {
  var self = this, u = this.url();
  cb = cb || function () {};
  if (!u) return cb();
  var cur = this.current(), headers = {};
  if (cur && cur.etag) headers['If-None-Match'] = cur.etag;
  this.status.lastTry = Date.now();
  get(u, headers, MAX_MANIFEST, function (err, status, body, h) {
    if (u !== self.url()) return cb(); // the address changed meanwhile
    var why = err ? (err.code || err.message) : status === 304 && cur ? '' : status !== 200 ? 'HTTP ' + status : '';
    if (!why && status === 200) {
      var m = null;
      try { m = JSON.parse(String(body)); } catch (e) {}
      var ok = checkManifest(m);
      if (typeof ok === 'string') why = 'manifest: ' + ok;
      else {
        self.manifest = { url: u, etag: h && h.etag ? String(h.etag).slice(0, 120) : '', categories: ok.categories, collections: ok.collections, items: ok.items };
        self.write('manifest.json', self.manifest);
        self.o.log('library: ' + ok.items.length + ' pictures, ' + ok.collections.length + ' collections');
      }
    }
    self.status.error = why;
    if (!why) self.status.lastOk = Date.now();
    self.write('status.json', self.status);
    self.arrangeIfNeeded();
    self.prefetch();
    self.cleanup();
    cb();
  });
};

/* ---------- what is shown ---------- */

/*
 * The pictures of the collections ticked (all of them when none is), in the manifest's order: in any of them,
 * or, crossed, in one of each category ticked (Van Gogh or Monet, and night). Nothing matching: the pictures of
 * any of them; still nothing (collections gone from the library): all.
 */
Library.prototype.select = function (chosen, how) {
  var m = this.current();
  if (!m) return [];
  var have = {};
  m.collections.forEach(function (c) { have[c.id] = c.cat; });
  chosen = (chosen || []).filter(function (c) { return has(have, c); });
  if (!chosen.length) return m.items.slice();
  var groups = {};
  chosen.forEach(function (c) { (groups[have[c]] = groups[have[c]] || []).push(c); });
  var inAny = function (it, list) { return list.some(function (c) { return it.tags.indexOf(c) !== -1; }); };
  if (how === 'cross') {
    var crossed = m.items.filter(function (it) { return Object.keys(groups).every(function (g) { return inAny(it, groups[g]); }); });
    if (crossed.length) return crossed;
  }
  var any = m.items.filter(function (it) { return inAny(it, chosen); });
  return any.length ? any : m.items.slice();
};

Library.prototype.list = function () {
  var cfg = this.o.config();
  return this.select(cfg.libraryCollections, cfg.libraryMatch);
};

Library.prototype.item = function (id) {
  var m = this.current();
  if (!m) return null;
  for (var i = 0; i < m.items.length; i++) if (m.items[i].id === id) return m.items[i];
  return null;
};

// A new order when the collections, the pictures or the order changed; the picture on the screen stays.
Library.prototype.arrangeIfNeeded = function () {
  var cfg = this.o.config(), ids = this.list().map(function (i) { return i.id; });
  var key = crypto.createHash('sha1').update(cfg.libraryOrder + ':' + ids.join(',')).digest('hex').slice(0, 16);
  if (this.play.key === key && Array.isArray(this.play.order)) return;
  var now = this.play.order && this.play.order[this.play.pos];
  var order = arrange(ids, cfg.libraryOrder === 'order' ? 'order' : 'shuffle');
  if (now && order.indexOf(now) !== -1) {
    if (cfg.libraryOrder !== 'order') { order.splice(order.indexOf(now), 1); order.unshift(now); }
  }
  this.play = { key: key, order: order, pos: now && order.indexOf(now) !== -1 ? order.indexOf(now) : 0, at: this.play.at || Date.now(), mark: this.play.mark };
  this.write('play.json', this.play);
};

Library.prototype.cached = function (id) { return fs.existsSync(path.join(this.cacheDir, id + '.jpg')); };

// The id at a place of the order, or, while the server cannot be reached, the next one in the cache.
Library.prototype.at = function (pos) {
  var order = this.play.order || [], away = !!this.status.error;
  for (var k = 0; k < order.length; k++) {
    var id = order[(pos + k) % order.length];
    if (!away || this.cached(id)) return id;
  }
  return null;
};

// One step on; at the end of a shuffled round, a new round.
Library.prototype.step = function () {
  this.arrangeIfNeeded();
  var order = this.play.order || [];
  if (!order.length) return null;
  var pos = this.play.pos + 1;
  if (pos >= order.length) {
    pos = 0;
    if (this.o.config().libraryOrder !== 'order') {
      var last = order[order.length - 1];
      order = arrange(order, 'shuffle');
      if (order.length > 1 && order[0] === last) { order.push(order.shift()); }
      this.play.order = order;
    }
  }
  // While the server cannot be reached, over to the next picture in the cache.
  if (this.status.error) {
    for (var k = 0; k < order.length && !this.cached(order[(pos + k) % order.length]); k++);
    if (k < order.length) pos = (pos + k) % order.length;
  }
  this.play.pos = pos;
  this.play.at = Date.now();
  this.write('play.json', this.play);
  this.prefetch();
  return order[pos];
};

// "Next background" from the Home.
Library.prototype.next = function () {
  var id = this.step();
  if (id) this.o.log('library: next ' + id);
  return id;
};

// What the Home shows: {id, next, captions: {id: caption}}, or null (then the usual background).
Library.prototype.now = function () {
  this.arrangeIfNeeded();
  var id = this.at(this.play.pos || 0);
  if (!id) return null;
  var order = this.play.order, next = order.length > 1 ? this.at((order.indexOf(id) + 1) % order.length) : null;
  var caps = {}, self = this;
  [id, next].forEach(function (x) { var it = x && self.item(x); if (it) caps[x] = it.caption; });
  return { id: id, next: next && next !== id ? next : null, captions: caps };
};

/*
 * Once a minute: the TV come on (a new mark from the boot hook) or the time up moves on, as chosen;
 * the manifest is read again every 30 minutes and when the TV comes on.
 */
Library.prototype.tick = function () {
  var cfg = this.o.config(), self = this;
  if (!this.url()) return;
  this.o.freeSpace(function (f) { self.free = f; }); // for the cache's limit shown in the settings
  var mark = this.o.mark(), came = mark !== this.play.mark;
  if (came) { this.play.mark = mark; this.write('play.json', this.play); }
  if (came || !this.status.lastTry || Date.now() - this.status.lastTry >= SYNC_EVERY) this.sync();
  if (cfg.backgroundMode !== 'library') return;
  var r = cfg.libraryRotate;
  if ((r === 'power' && came && this.play.order) || (typeof r === 'number' && Date.now() - (this.play.at || 0) >= r * 60000)) this.step();
};

/* ---------- the cache ---------- */

Library.prototype.entries = function () {
  var self = this, out = [];
  try {
    fs.readdirSync(this.cacheDir).forEach(function (f) {
      var m = /^([0-9a-f]{16})\.jpg$/.exec(f);
      if (!m) return;
      try { out.push({ id: m[1], bytes: fs.statSync(path.join(self.cacheDir, f)).size, used: self.uses[m[1]] || 0 }); } catch (e) {}
    });
  } catch (e) {}
  return out;
};

// Never let go: the picture on the screen, the next one, and the last two shown of each collection in use.
Library.prototype.keepSet = function () {
  var keep = {}, now = this.now(), per = {}, cfg = this.o.config(), m = this.current();
  if (now) { keep[now.id] = true; if (now.next) keep[now.next] = true; }
  if (!m) return keep;
  var inUse = {};
  this.list().forEach(function (it) { inUse[it.id] = it; });
  var cols = (cfg.libraryCollections || []).length ? cfg.libraryCollections : ['*'];
  this.entries().filter(function (e) { return inUse[e.id]; }).sort(function (a, b) { return b.used - a.used; }).forEach(function (e) {
    cols.forEach(function (c) {
      if (c !== '*' && inUse[e.id].tags.indexOf(c) === -1) return;
      per[c] = (per[c] || 0) + 1;
      if (per[c] <= KEEP_PER_ALBUM) keep[e.id] = true;
    });
  });
  return keep;
};

// Room for `bytes` more, letting the oldest go if needed. cb(ok).
Library.prototype.room = function (bytes, cb) {
  var self = this;
  this.o.freeSpace(function (free) {
    self.free = free;
    if (free === null) return cb(false);
    var entries = self.entries(), size = 0;
    entries.forEach(function (e) { size += e.bytes; });
    var allowed = size + free - self.o.minFree - MARGIN;
    var gone = toEvict(entries, bytes, allowed, self.keepSet());
    if (!gone) return cb(false);
    gone.forEach(function (id) {
      try { fs.unlinkSync(path.join(self.cacheDir, id + '.jpg')); } catch (e) {}
      self.o.log('library: ' + id + ' let go from the cache');
    });
    cb(true);
  });
};

// A picture in the cache, fetched and checked if it is not there. cb(err, file).
Library.prototype.ensure = function (id, cb) {
  var self = this, file = path.join(this.cacheDir, id + '.jpg'), it = this.item(id);
  if (fs.existsSync(file)) { this.uses[id] = Date.now(); this.saveUses(); return cb(null, file); }
  if (!it) return cb(new Error('not in the library'));
  if (this.fetching[id]) return this.fetching[id].push(cb);
  var waiting = this.fetching[id] = [cb];
  var end = function (err) {
    delete self.fetching[id];
    if (!err) { self.uses[id] = Date.now(); self.saveUses(); }
    waiting.forEach(function (w) { w(err, err ? null : file); });
  };
  this.room(it.bytes, function (ok) {
    if (!ok) return end(new Error('no room'));
    get(self.fileUrl('fonds/' + id + '.jpg'), {}, MAX_PICTURE, function (err, status, body) {
      // The server or the internet away: from now on, only what is in the cache, until the manifest is read again.
      if (err) { self.status.error = 'download: ' + (err.code || err.message); self.write('status.json', self.status); }
      if (err || status !== 200) return end(err || new Error('HTTP ' + status));
      if (crypto.createHash('sha256').update(body).digest('hex') !== it.sha256) return end(new Error('checksum'));
      try {
        self.mkdirs();
        fs.writeFileSync(file + '.tmp', body, { mode: 420 });
        fs.renameSync(file + '.tmp', file);
      } catch (e) { return end(e); }
      self.o.log('library: ' + id + ' fetched (' + body.length + ' bytes)');
      end(null);
    });
  });
};

// The small copy, for the settings page. cb(err, file).
Library.prototype.ensureThumb = function (id, cb) {
  var self = this, file = path.join(this.thumbDir, id + '.jpg');
  if (fs.existsSync(file)) return cb(null, file);
  if (!this.item(id)) return cb(new Error('not in the library'));
  get(this.fileUrl('vignettes/' + id + '.jpg'), {}, MAX_THUMB, function (err, status, body) {
    if (err || status !== 200) return cb(err || new Error('HTTP ' + status));
    try { self.mkdirs(); fs.writeFileSync(file + '.tmp', body, { mode: 420 }); fs.renameSync(file + '.tmp', file); } catch (e) { return cb(e); }
    cb(null, file);
  });
};

Library.prototype.saveUses = function () {
  var self = this;
  clearTimeout(this.usesTimer);
  this.usesTimer = setTimeout(function () { self.write('uses.json', self.uses); }, 2000);
};

// The picture on the screen and the next one, fetched ahead.
Library.prototype.prefetch = function () {
  var now = this.o.config().backgroundMode === 'library' && this.now(), self = this;
  if (!now) return;
  this.ensure(now.id, function () { if (now.next) self.ensure(now.next, function () {}); });
};

// Pictures no longer in the library, and small copies of them, let go.
Library.prototype.cleanup = function () {
  var self = this;
  if (!this.current()) return;
  [this.cacheDir, this.thumbDir].forEach(function (d) {
    try {
      fs.readdirSync(d).forEach(function (f) {
        var m = /^([0-9a-f]{16})\.jpg(\.tmp)?$/.exec(f);
        if (m && (m[2] || !self.item(m[1]))) { try { fs.unlinkSync(path.join(d, f)); } catch (e) {} }
      });
    } catch (e) {}
  });
};

// For the settings page: the collections, the cache, the last reading and what went wrong.
Library.prototype.state = function () {
  var m = this.current(), size = 0, entries = this.entries();
  entries.forEach(function (e) { size += e.bytes; });
  return {
    url: !!this.url(), categories: m ? m.categories : [], collections: m ? m.collections : [], pictures: m ? m.items.length : 0, inUse: this.list().length,
    toVerify: m ? m.items.filter(function (i) { return i.status === 'a-verifier' || i.status === 'nom-de-fichier'; }).length : 0,
    auto: m ? m.items.filter(function (i) { return i.status === 'auto'; }).length : 0, token: !!this.o.config().libraryToken,
    cached: entries.length, cacheBytes: size, capBytes: this.free === null ? null : Math.max(0, size + this.free - this.o.minFree - MARGIN),
    lastOk: this.status.lastOk || 0, lastTry: this.status.lastTry || 0, error: this.status.error || ''
  };
};

module.exports = { Library: Library, validUrl: validUrl, checkManifest: checkManifest, arrange: arrange, toEvict: toEvict,
  ROTATE: ROTATE, ORDERS: ORDERS, MATCHES: MATCHES, TAG: TAG, ID: ID };
