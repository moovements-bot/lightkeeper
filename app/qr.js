/*
 * A small QR code encoder (perso.9), for the address of the settings page shown on the TV: byte mode, error
 * correction level M, versions 1 to 6 (up to 106 characters), the mask with the lowest penalty. Strict ES5,
 * no page in here: qrMatrice(text) gives the modules, true for dark, or null when the text is too long.
 */
var QR_BLOCCHI = [null, // per version, level M: [error codewords per block, [data codewords of each block]]
  [10, [16]], [16, [28]], [26, [44]], [18, [32, 32]], [24, [43, 43]], [16, [27, 27, 27, 27]]];
var QR_ALLINEA = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

function qrGf() {
  var exp = [], log = [], x = 1;
  for (var i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return { exp: exp, log: log };
}

// The error correction codewords of one block (Reed–Solomon over GF(256)).
function qrCorrezione(dati, n, gf) {
  var gen = [1];
  for (var i = 0; i < n; i++) {
    var next = [];
    for (var j = 0; j <= gen.length; j++) {
      var a = j < gen.length ? gen[j] : 0, b = j > 0 ? gen[j - 1] : 0;
      next[j] = a ^ (b ? gf.exp[gf.log[b] + i] : 0);
    }
    gen = next;
  }
  var resto = dati.slice();
  for (i = 0; i < n; i++) resto.push(0);
  for (i = 0; i < dati.length; i++) {
    var c = resto[i];
    if (!c) continue;
    for (j = 0; j < gen.length; j++) if (gen[j]) resto[i + j] ^= gf.exp[gf.log[gen[j]] + gf.log[c]];
  }
  return resto.slice(dati.length);
}

function qrMatrice(testo) {
  var bytes = [];
  for (var i = 0; i < testo.length; i++) {
    var c = testo.charCodeAt(i);
    if (c > 127) return null; // an address is ASCII
    bytes.push(c);
  }
  var v = 1;
  while (v <= 6 && QR_BLOCCHI[v][1].reduce(function (s, x) { return s + x; }, 0) < bytes.length + 2) v++;
  if (v > 6) return null;
  var blocks = QR_BLOCCHI[v][1], ecn = QR_BLOCCHI[v][0], capienza = blocks.reduce(function (s, x) { return s + x; }, 0);
  // The bits: byte mode, the count, the bytes, the end, then padding.
  var bit = [];
  var put = function (val, len) { for (var k = len - 1; k >= 0; k--) bit.push((val >> k) & 1); };
  put(4, 4);
  put(bytes.length, 8);
  bytes.forEach(function (b) { put(b, 8); });
  for (i = 0; i < 4 && bit.length < capienza * 8; i++) bit.push(0);
  while (bit.length % 8) bit.push(0);
  var dati = [];
  for (i = 0; i < bit.length; i += 8) dati.push(parseInt(bit.slice(i, i + 8).join(''), 2));
  for (i = 0; dati.length < capienza; i++) dati.push(i % 2 ? 0x11 : 0xec);
  // Blocks, their correction, then interleaved.
  var gf = qrGf(), pos = 0, db = [], eb = [];
  blocks.forEach(function (n) { var d = dati.slice(pos, pos + n); pos += n; db.push(d); eb.push(qrCorrezione(d, ecn, gf)); });
  var parole = [], maxd = Math.max.apply(null, blocks);
  for (i = 0; i < maxd; i++) db.forEach(function (d) { if (i < d.length) parole.push(d[i]); });
  for (i = 0; i < ecn; i++) eb.forEach(function (e) { parole.push(e[i]); });
  var flusso = [];
  parole.forEach(function (w) { for (var k = 7; k >= 0; k--) flusso.push((w >> k) & 1); });
  if (v > 1) for (i = 0; i < 7; i++) flusso.push(0);

  var n = 17 + 4 * v, m = [], f = [];
  for (i = 0; i < n; i++) { m.push([]); f.push([]); for (var j = 0; j < n; j++) { m[i].push(false); f[i].push(false); } }
  var fisso = function (r, c, val) { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = val; f[r][c] = true; } };
  // Finders with their separators, timing, alignment, the dark module, the format's places.
  [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (o) {
    for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
      var dentro = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      fisso(o[0] + r, o[1] + c, dentro && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
    }
  });
  for (i = 8; i < n - 8; i++) { fisso(6, i, i % 2 === 0); fisso(i, 6, i % 2 === 0); }
  var al = QR_ALLINEA[v];
  al.forEach(function (r) {
    al.forEach(function (c) {
      if (f[r][c]) return; // over a finder
      for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) fisso(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    });
  });
  fisso(n - 8, 8, true);
  for (i = 0; i < 9; i++) { if (!f[8][i]) fisso(8, i, false); if (!f[i][8]) fisso(i, 8, false); }
  for (i = 0; i < 8; i++) { fisso(8, n - 1 - i, false); fisso(n - 1 - i, 8, false); }
  // The data, up and down two columns at a time from the bottom right, over the column of the timing.
  var b = 0, su = true;
  for (var col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (var k = 0; k < n; k++) {
      var r = su ? n - 1 - k : k;
      for (var d = 0; d < 2; d++) {
        var cc = col - d;
        if (!f[r][cc]) { m[r][cc] = b < flusso.length ? flusso[b] === 1 : false; b++; }
      }
    }
    su = !su;
  }
  var MASCHERE = [
    function (r, c) { return (r + c) % 2 === 0; }, function (r) { return r % 2 === 0; }, function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; }, function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; }, function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }];
  var migliore = null, punti = Infinity;
  for (var mk = 0; mk < 8; mk++) {
    var t = m.map(function (riga, r) { return riga.map(function (x, c) { return f[r][c] ? x : x !== MASCHERE[mk](r, c); }); });
    qrFormato(t, n, mk);
    var p = qrPenalita(t, n);
    if (p < punti) { punti = p; migliore = t; }
  }
  return migliore;
}

// The format (level M, the mask), with its BCH bits, in its two places.
function qrFormato(t, n, mask) {
  var dato = (0 << 3) | mask, rem = dato;
  for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  var bits = ((dato << 10) | rem) ^ 0x5412;
  for (i = 0; i <= 5; i++) t[i][8] = ((bits >> i) & 1) === 1;
  t[7][8] = ((bits >> 6) & 1) === 1;
  t[8][8] = ((bits >> 7) & 1) === 1;
  t[8][7] = ((bits >> 8) & 1) === 1;
  for (i = 9; i < 15; i++) t[8][14 - i] = ((bits >> i) & 1) === 1;
  for (i = 0; i < 8; i++) t[8][n - 1 - i] = ((bits >> i) & 1) === 1;
  for (i = 8; i < 15; i++) t[n - 15 + i][8] = ((bits >> i) & 1) === 1;
  t[n - 8][8] = true;
}

function qrPenalita(t, n) {
  var p = 0, r, c, scuri = 0;
  for (var pass = 0; pass < 2; pass++) {
    for (r = 0; r < n; r++) {
      var run = 1, prima = null, riga = '';
      for (c = 0; c < n; c++) {
        var x = pass ? t[c][r] : t[r][c];
        riga += x ? '1' : '0';
        if (x === prima) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { run = 1; prima = x; }
      }
      var re = /10111010000|00001011101/g, mm;
      while ((mm = re.exec(riga))) { p += 40; re.lastIndex = mm.index + 1; }
    }
  }
  for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) {
    var a = t[r][c];
    if (a === t[r][c + 1] && a === t[r + 1][c] && a === t[r + 1][c + 1]) p += 3;
  }
  for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (t[r][c]) scuri++;
  p += Math.floor(Math.abs(scuri * 100 / (n * n) - 50) / 5) * 10;
  return p;
}

// An SVG of the code, dark on light, with its quiet zone, as a string.
function qrSvg(testo, lato) {
  var q = qrMatrice(testo);
  if (!q) return '';
  var n = q.length, d = '';
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q[r][c]) d += 'M' + (c + 4) + ' ' + (r + 4) + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" width="' + lato + '" height="' + lato +
    '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#f4f1ec"/><path fill="#120d08" d="' + d + '"/></svg>';
}
