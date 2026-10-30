/*
 * The library of backgrounds on a server of yours (perso.6, collections since perso.7): a manifest.json at an
 * https address set in the settings, which lists pictures (3840 × 2160 JPEGs, each named by its SHA-256) with
 * their tags, and the collections made of those tags (one tag of at least three pictures each). This TV
 * reads it at start, when it comes on and every 30 minutes, and keeps a copy for when the server cannot be
 * reached. Pictures are fetched only when needed, checked against their SHA-256, and kept in a cache whose
 * size follows the room really free (Lightkeeper's 64 MB reserve kept), the least recently shown let go first,
 * before anything is written (perso.16): the small copies count in it, a download under way is counted from its
 * start, and when the TV's free room shrinks the cache shrinks with it. The picture on the screen, the next one and
 * the last two shown of each collection in use are always kept, so the Home still has pictures without the server.
 * At each reading, what the manifest no longer names (an old version after a new crop, a picture taken away or
 * hidden, a download cut short) goes.
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
var CAPTION = { title: 90, artist: 60, year: 16, place: 60, museum: 80 };
var WAIT_EVERY = 3000, WAIT_MAX = 4 * 60000; // after a change on the server: how often, and how long, it is asked if it is done
var STATUSES = ['manuelle', 'auto', 'a-verifier', 'verifie', 'nom-de-fichier']; // of a caption, as the server tells
var MAX_API = 1024 * 1024;
var FORMAT = 16; // of the copy kept: an older one (read before the museum, the file names) is read again in full

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
    // The source file's name: the same picture after a new crop (a new id) keeps its place on the screen.
    if (str(it.name, 200)) one.name = str(it.name, 200);
    if (STATUSES.indexOf(it.captionStatus) !== -1) one.status = it.captionStatus;
    // The review of the pictures (perso.13): hidden from the TV, a hard format, the uncropped preview.
    if (it.hidden === true) one.hidden = true;
    if (it.format === 'difficile') one.format = 'difficile';
    if (it.aRevoir === true) one.aRevoir = true; // edges taken off or a hard format, until someone says OK
    if (typeof it.apercu === 'string' && /^apercus\/[0-9a-f]{16}\.jpg$/.test(it.apercu)) one.apercu = it.apercu.slice(8, 24);
    if (typeof it.original === 'string' && /^originaux\/[0-9a-f]{16}\.jpg$/.test(it.original)) one.original = it.original.slice(10, 26);
    items.push(one);
  }
  for (var i = 0; i < m.collections.length; i++) {
    var col = m.collections[i];
    if (!col || !TAG.test(col.id) || known[col.id] || col.id.split(':')[0] !== col.cat || !str(col.name, 40)) return 'collection ' + i;
    var dentro = items.filter(function (x) { return !x.hidden && x.tags.indexOf(col.id) !== -1; }), count = dentro.length;
    if (!count) continue;
    var cover = ID.test(col.cover) && seen[col.cover] ? col.cover : dentro[0].id;
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
  this.reserved = {};                 // id → bytes of a download under way, counted in the cache from its start
  this.free = null;
  this.waiters = [];                  // after a change on the server: those waiting for the new manifest
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
  var post = { legende: true, image: true, restaurer: true }, lire = { legendes: true, images: true, etat: true };
  if (!post[what] && !lire[what]) return cb(new Error('not allowed'));
  get(this.fileUrl('api/' + what), { 'X-TV-Fonds-Token': token }, MAX_API, function (err, status, b) {
    if (err) return cb(err);
    var r = null;
    try { r = JSON.parse(String(b || '')); } catch (e) {}
    cb(null, status, r);
  }, post[what] ? 'POST' : 'GET', post[what] ? JSON.stringify(body) : null);
};

// Beside the manifest: the address of one of the files it names.
Library.prototype.fileUrl = function (file) { return this.url().replace(/manifest\.json$/, '') + file; };

/* ---------- reading the manifest ---------- */

Library.prototype.sync = function (cb) {
  var self = this, u = this.url();
  cb = cb || function () {};
  if (!u) return cb();
  var cur = this.current(), headers = {};
  if (cur && cur.etag && cur.format === FORMAT) headers['If-None-Match'] = cur.etag;
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
        self.remap(cur, ok.items);
        self.manifest = { format: FORMAT, url: u, etag: h && h.etag ? String(h.etag).slice(0, 120) : '', categories: ok.categories, collections: ok.collections, items: ok.items };
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

/*
 * A picture made again on the server (a new crop: a new file, a new id) keeps its place in the order and in
 * what was last shown, so the Home fades to its new version instead of moving on.
 */
Library.prototype.remap = function (old, items) {
  if (!old) return;
  var byName = {}, map = {}, self = this, n = 0;
  items.forEach(function (it) { if (it.name) byName[it.name] = it.id; });
  old.items.forEach(function (it) { if (it.name && byName[it.name] && byName[it.name] !== it.id) { map[it.id] = byName[it.name]; n++; } });
  if (!n) return;
  if (Array.isArray(this.play.order)) this.play.order = this.play.order.map(function (id) { return map[id] || id; });
  Object.keys(map).forEach(function (id) {
    if (self.uses[id]) { self.uses[map[id]] = self.uses[id]; delete self.uses[id]; }
    self.o.log('library: ' + id + ' made again as ' + map[id]);
  });
  this.write('play.json', this.play);
  this.saveUses();
};

/*
 * After a change made from the settings page (a crop, a picture hidden, kept, taken away or back, a caption):
 * the server is asked every 3 s whether it has made the manifest again since `t` (its clock), then the manifest is
 * read and the picture on the screen fetched, so that the Home shows the change at once; 4 minutes at most, then
 * it is read anyway. `doneFor` tells the page up to which change the TV is up to date. cb() once done.
 */
Library.prototype.refresh = function (t, cb) {
  var self = this;
  if (typeof t === 'number' && isFinite(t)) this.waitFor = Math.max(this.waitFor || 0, t);
  if (cb) this.waiters.push(cb);
  if (this.waiting) return;
  this.waiting = true;
  var start = Date.now(), target = this.waitFor || 0;
  var done = function (late) {
    self.sync(function () {
      var now = self.o.config().backgroundMode === 'library' && self.now();
      var end = function () {
        self.waiting = false;
        self.doneFor = Math.max(self.doneFor || 0, target);
        self.late = late;
        if (self.waitFor > target) return self.refresh(); // another change came meanwhile
        var w = self.waiters;
        self.waiters = [];
        w.forEach(function (f) { f(); });
      };
      if (now) self.ensure(now.id, end); else end();
    });
  };
  var ask = function () {
    self.api('etat', null, function (err, status, r) {
      if (!err && status === 200 && r && typeof r.fini === 'number' && r.fini >= target) return done(false);
      if (Date.now() - start >= WAIT_MAX) return done(true);
      setTimeout(ask, WAIT_EVERY);
    });
  };
  ask();
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
  var visibili = m.items.filter(function (it) { return !it.hidden; }); // hidden in the review: never shown
  if (!chosen.length) return visibili;
  var groups = {};
  chosen.forEach(function (c) { (groups[have[c]] = groups[have[c]] || []).push(c); });
  var inAny = function (it, list) { return list.some(function (c) { return it.tags.indexOf(c) !== -1; }); };
  if (how === 'cross') {
    var crossed = visibili.filter(function (it) { return Object.keys(groups).every(function (g) { return inAny(it, groups[g]); }); });
    if (crossed.length) return crossed;
  }
  var any = visibili.filter(function (it) { return inAny(it, chosen); });
  return any.length ? any : visibili;
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
  var old = this.play.order || [], now = old[this.play.pos];
  // The picture on the screen hidden or taken away: the one after it in the old order that is still there.
  if (now && ids.indexOf(now) === -1) {
    var still = null;
    for (var k = 1; k < old.length && !still; k++) if (ids.indexOf(old[(this.play.pos + k) % old.length]) !== -1) still = old[(this.play.pos + k) % old.length];
    now = still;
  }
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
  this.room(0, function () {}); // the free room measured again: a cache over its new limit goes back within it
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

// Bytes of the small copies (the settings page's thumbnails and previews), which count in the cache too.
Library.prototype.thumbBytes = function () {
  var self = this, n = 0;
  try { fs.readdirSync(this.thumbDir).forEach(function (f) { try { n += fs.statSync(path.join(self.thumbDir, f)).size; } catch (e) {} }); } catch (e) {}
  return n;
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

/*
 * The cache's limit: what it holds, plus the room free, less the reserve and the margin (the free room is
 * measured again each time, so another app filling the TV makes it smaller).
 */
Library.prototype.cap = function (held, free) { return Math.max(0, held + free - this.o.minFree - MARGIN); };

/*
 * Room for `bytes` more (0: only back within the limit), letting the least recently shown go first, before
 * anything is written; the downloads under way of other pictures count as already there. cb(ok).
 */
Library.prototype.room = function (bytes, cb, own) {
  var self = this;
  this.o.freeSpace(function (free) {
    self.free = free;
    if (free === null) return cb(false);
    var entries = self.entries(), size = 0, thumbs = self.thumbBytes(), pending = 0;
    entries.forEach(function (e) { size += e.bytes; });
    Object.keys(self.reserved).forEach(function (id) { if (id !== own) pending += self.reserved[id]; });
    var gone = toEvict(entries, bytes + thumbs + pending, self.cap(size + thumbs, free), self.keepSet());
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
    delete self.reserved[id];
    if (!err) { self.uses[id] = Date.now(); self.saveUses(); }
    waiting.forEach(function (w) { w(err, err ? null : file); });
  };
  this.reserved[id] = it.bytes; // counted in the cache from now on, before a byte is written
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
  }, id);
};

// The uncropped preview of a picture, or its whole original (small), for the gallery on the settings page. cb(err, file).
Library.prototype.ensureApercu = function (key, cb) { this.ensureVue('apercu', key, cb); };
Library.prototype.ensureOriginal = function (key, cb) { this.ensureVue('original', key, cb); };
Library.prototype.ensureVue = function (kind, key, cb) {
  var self = this, pre = kind === 'original' ? 'or-' : 'ap-', file = path.join(this.thumbDir, pre + key + '.jpg'), m = this.current();
  if (fs.existsSync(file)) return cb(null, file);
  if (!m || !m.items.some(function (i) { return i[kind] === key; })) return cb(new Error('not in the library'));
  get(this.fileUrl((kind === 'original' ? 'originaux/' : 'apercus/') + key + '.jpg'), {}, kind === 'original' ? 3 * MAX_THUMB : MAX_THUMB, function (err, status, body) {
    if (err || status !== 200) return cb(err || new Error('HTTP ' + status));
    self.keepSmall(file, body, cb);
  });
};

// The small copy, for the settings page. cb(err, file).
Library.prototype.ensureThumb = function (id, cb) {
  var self = this, file = path.join(this.thumbDir, id + '.jpg');
  if (fs.existsSync(file)) return cb(null, file);
  if (!this.item(id)) return cb(new Error('not in the library'));
  get(this.fileUrl('vignettes/' + id + '.jpg'), {}, MAX_THUMB, function (err, status, body) {
    if (err || status !== 200) return cb(err || new Error('HTTP ' + status));
    self.keepSmall(file, body, cb);
  });
};

// A small copy written once there is room for it in the cache. cb(err, file).
Library.prototype.keepSmall = function (file, body, cb) {
  var self = this;
  this.room(body.length, function (ok) {
    if (!ok) return cb(new Error('no room'));
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

/*
 * At each reading: what the manifest no longer names goes from the cache (an old version after a new crop, a
 * picture taken away), with the pictures hidden, what a cut download or an older version left (any other
 * name), the small copies of all those, and their dates of last showing; then the cache back within its limit.
 */
Library.prototype.cleanup = function () {
  var self = this, m = this.current();
  if (!m) return;
  var shown = {}, ap = {}, or = {};
  m.items.forEach(function (i) { if (!i.hidden) shown[i.id] = true; if (i.apercu) ap[i.apercu] = true; if (i.original) or[i.original] = true; });
  [this.cacheDir, this.thumbDir].forEach(function (d) {
    try {
      fs.readdirSync(d).forEach(function (f) {
        var p = /^([0-9a-f]{16})\.jpg$/.exec(f), a = d === self.thumbDir && /^(ap|or)-([0-9a-f]{16})\.jpg$/.exec(f);
        var keep = p ? shown[p[1]] || (d === self.cacheDir && self.reserved[p[1]] !== undefined) : a ? (a[1] === 'or' ? or : ap)[a[2]] : false;
        if (keep) return;
        try { fs.unlinkSync(path.join(d, f)); self.o.log('library: ' + f + ' let go (no longer in the library)'); } catch (e) {}
      });
    } catch (e) {}
  });
  var n = 0;
  Object.keys(this.uses).forEach(function (id) { if (!shown[id]) { delete self.uses[id]; n++; } });
  if (n) this.saveUses();
  this.room(0, function () {});
};

/*
 * "Empty the cache" on the settings pages: every picture goes but the one on the screen and those kept for when
 * the server is away (keepSet), and all the small copies; they come back when needed. cb(bytes freed).
 */
Library.prototype.clear = function (cb) {
  var self = this, keep = this.keepSet(), freed = 0;
  this.entries().forEach(function (e) {
    if (keep[e.id] || self.reserved[e.id] !== undefined) return;
    try { fs.unlinkSync(path.join(self.cacheDir, e.id + '.jpg')); freed += e.bytes; } catch (er) {}
  });
  try {
    fs.readdirSync(this.thumbDir).forEach(function (f) {
      var p = path.join(self.thumbDir, f);
      try { freed += fs.statSync(p).size; fs.unlinkSync(p); } catch (er) {}
    });
  } catch (e) {}
  this.o.log('library: cache emptied, ' + freed + ' bytes freed');
  this.o.freeSpace(function (f) { self.free = f; cb(freed); });
};

// For the settings page: the collections, the cache, the last reading and what went wrong.
Library.prototype.state = function () {
  var m = this.current(), size = 0, entries = this.entries(), thumbs = this.thumbBytes();
  entries.forEach(function (e) { size += e.bytes; });
  return {
    url: !!this.url(), categories: m ? m.categories : [], collections: m ? m.collections : [], pictures: m ? m.items.length : 0, inUse: this.list().length,
    toVerify: m ? m.items.filter(function (i) { return i.status === 'a-verifier' || i.status === 'nom-de-fichier'; }).length : 0,
    auto: m ? m.items.filter(function (i) { return i.status === 'auto'; }).length : 0, token: !!this.o.config().libraryToken,
    hidden: m ? m.items.filter(function (i) { return i.hidden; }).length : 0,
    difficult: m ? m.items.filter(function (i) { return i.format === 'difficile' && !i.hidden; }).length : 0,
    toReview: m ? m.items.filter(function (i) { return i.aRevoir && !i.hidden; }).length : 0,
    cached: entries.length, cacheBytes: size + thumbs, picturesBytes: size, thumbBytes: thumbs, capBytes: this.free === null ? null : this.cap(size + thumbs, this.free),
    lastOk: this.status.lastOk || 0, lastTry: this.status.lastTry || 0, error: this.status.error || ''
  };
};

module.exports = { Library: Library, validUrl: validUrl, checkManifest: checkManifest, arrange: arrange, toEvict: toEvict,
  ROTATE: ROTATE, ORDERS: ORDERS, MATCHES: MATCHES, TAG: TAG, ID: ID };
