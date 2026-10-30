/*
 * The TV's own settings (perso.9), from the gear and the tile Controls: a full screen panel with the headings on
 * the left and their settings on the right, all with the remote. Up and down move, Right or OK goes into a
 * heading, Left and Right change a value, OK flips or opens, Back goes up a level, then closes. Each change is
 * sent at once to the server (/api/home/config, the settings page's own checks) and the Home is drawn again
 * from its answer; what needs text (a city, a tile's name, the library's address, the PIN) stays on the settings
 * page, whose address and QR code are under System. Strict ES5; the rows are of one height, so moving among
 * them asks for no layout. Uses the Home's own names (cfg, TEXT, server, disegna…).
 */
var RG_ALTEZZA = 92; // px, one row
var reglages = document.getElementById('reglages');
var rgMenu = reglages.querySelector('.rub'), rgVoci = reglages.querySelector('.voci'), rgTitolo = reglages.querySelector('h3');
var rgNotaEl = reglages.querySelector('.nota'), rgQr = reglages.querySelector('.qr');
var rg = { rub: 0, zona: 'menu', sel: 0, sotto: null, sposta: -1, tiles: null }, rgLib = null, rgTimer = null, rgRitorno = false;
reglages.querySelector('h2').textContent = TEXT.rgTitle;

function rgT(k) { return TEXT[k] || k; }
function rgSiNo(v) { return v ? TEXT.rgYes : TEXT.rgNo; }

// A setting sent to the server; its answer is the config the Home is drawn again from.
function salvaTv(change, dopo) {
  var x = new XMLHttpRequest();
  x.open('POST', server() + '/api/home/config');
  x.setRequestHeader('Content-Type', 'application/json');
  x.timeout = 8000;
  x.onload = function () {
    var r = null;
    try { r = JSON.parse(x.responseText); } catch (e) {}
    if (r && r.ok && r.config) { applicaConfig(r.config); rgNota(''); } else rgNota(TEXT.rgFailed);
    if (dopo) dopo(!!(r && r.ok));
  };
  x.onerror = x.ontimeout = function () { rgNota(TEXT.rgFailed); if (dopo) dopo(false); };
  x.send(JSON.stringify(change));
}
function applicaConfig(c) {
  var j = JSON.stringify(c);
  shown = j;
  cfg = c;
  try { localStorage.setItem('config', j); } catch (e) {}
  disegna();
  if (!reglages.hidden) disegnaReglages();
}
function rgNota(t) { rgNotaEl.textContent = t || (rg.sotto === 'tiles' ? TEXT.rgTilesNote : TEXT.rgNote); }

// The library's state, for the heading Background.
function leggiLib(sync) {
  var x = new XMLHttpRequest();
  x.open(sync ? 'POST' : 'GET', server() + (sync ? '/api/home/sync' : '/api/home/library'));
  if (sync) x.setRequestHeader('Content-Type', 'application/json');
  x.timeout = sync ? 60000 : 8000;
  x.onload = function () {
    var r = null;
    try { r = JSON.parse(x.responseText); } catch (e) {}
    if (r && r.library) rgLib = r.library;
    if (sync) { rgNota(r && r.library && !r.library.error ? TEXT.rgSynced : TEXT.rgFailed); leggi(); }
    if (!reglages.hidden) disegnaReglages();
  };
  x.onerror = x.ontimeout = function () { if (sync) rgNota(TEXT.rgFailed); };
  x.send(sync ? '{}' : null);
}
function statoLib() {
  if (!cfg.libraryUrl) return TEXT.rgNoLib;
  if (!rgLib) return '…';
  var mb = function (n) { return Math.round(n / 1048576) + ' Mo'; }, d = new Date(rgLib.lastOk || 0);
  return (rgLib.error ? TEXT.rgLibAway + ' · ' : '') + rgLib.pictures + ' ' + TEXT.rgPictures + ' · ' + rgLib.collections.length + ' ' + TEXT.rgCollections +
    ' · ' + TEXT.rgCache + ' ' + mb(rgLib.cacheBytes) + (rgLib.capBytes ? ' / ' + mb(rgLib.capBytes) : '') +
    (rgLib.lastOk ? ' · ' + TEXT.rgRead + ' ' + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() : '');
}

// A choice among values: its place, the next one each way.
function scelta(campo, valori, nomi) {
  return { tipo: 'scelta', valori: valori, nomi: nomi, campo: campo,
    valore: function () { var i = valori.indexOf(cfg[campo]); return nomi[i < 0 ? 0 : i]; },
    cambia: function (d) {
      var i = valori.indexOf(cfg[campo]), n = valori[((i < 0 ? 0 : i) + d + valori.length) % valori.length], c = {};
      c[campo] = n;
      salvaTv(c);
    } };
}
function interruttore(nome, acceso, cambia) {
  return { nome: nome, tipo: 'scelta', valore: function () { return rgSiNo(acceso()); }, cambia: function () { cambia(!acceso()); } };
}

// The headings and their settings, from the config as it is now.
function rubriche() {
  var keys = ['none', 'red', 'green', 'yellow', 'blue'], keyNames = [TEXT.keyNone, TEXT.keyRed, TEXT.keyGreen, TEXT.keyYellow, TEXT.keyBlue];
  var idle = [0, 1, 2, 5, 10, 15, 30, 60], idleNames = idle.map(function (m) { return m ? m + ' min' : TEXT.rgNever; });
  var url = 'http://' + (cfg.address || '…') + ':' + (cfg.port || porta) + '/';
  var controllo = [[TEXT.tabSources, 0], [TEXT.tabSound, 1], [TEXT.tabPicture, 2], [TEXT.tabSleep, 3], [TEXT.tabLg, 4]].map(function (c) {
    return { nome: c[0], tipo: 'apri', valore: function () { return ''; }, apri: function () { rgRitorno = true; apriControllo(c[1]); } };
  });
  var fond = [
    { nome: TEXT.albums, tipo: 'apri', valore: function () { var n = (cfg.libraryCollections || []).length; return n ? n + ' ' + TEXT.rgTicked : TEXT.allAlbums; },
      apri: function () { rgRitorno = true; apriAlbum(); } },
    (function () { var s = scelta('libraryOrder', ['shuffle', 'order'], [TEXT.rgShuffle, TEXT.rgInOrder]); s.nome = TEXT.rgOrder; return s; })(),
    (function () { var s = scelta('libraryRotate', ['power', 15, 30, 60, 120, 'manual'], [TEXT.rgPower, '15 min', '30 min', '60 min', '120 min', TEXT.rgManual]); s.nome = TEXT.rgRotate; return s; })(),
    interruttore(TEXT.rgCross, function () { return cfg.libraryMatch === 'cross'; }, function (v) { salvaTv({ libraryMatch: v ? 'cross' : 'any' }); }),
    interruttore(TEXT.rgCaption, function () { return !!cfg.captions; }, function (v) { salvaTv({ captions: v }); }),
    (function () { var s = scelta('idleMinutes', idle, idleNames); s.nome = TEXT.rgIdle; return s; })(),
    interruttore(TEXT.rgByTime, function () { return cfg.backgroundMode === 'time'; }, function (v) {
      salvaTv({ backgroundMode: v ? 'time' : cfg.libraryUrl ? 'library' : 'fixed' });
    }),
    { nome: TEXT.rgSync, tipo: 'azione', valore: function () { return ''; }, apri: function () { rgNota(TEXT.rgSyncing); leggiLib(true); } },
    { nome: TEXT.rgState, tipo: 'info', valore: statoLib }
  ];
  var meteoPrima = null;
  try { meteoPrima = JSON.parse(localStorage.getItem('meteoPrima')); } catch (e) {}
  var accueil = [
    { nome: TEXT.rgTiles, tipo: 'apri', valore: function () {
      var t = cfg.tiles || [], h = t.filter(function (x) { return x.hidden; }).length;
      return (t.length - h) + ' ' + TEXT.rgShown + (h ? ' · ' + h + ' ' + TEXT.rgHidden : '');
    }, apri: function () { rg.sotto = 'tiles'; rg.tiles = (cfg.tiles || []).slice(); rg.sel = 0; rg.sposta = -1; disegnaReglages(); } },
    (function () { var s = scelta('tileStyle', ['text', 'logo', 'icon'], [TEXT.rgNames, TEXT.rgLogos, TEXT.rgIcons]); s.nome = TEXT.rgTileStyle; return s; })(),
    (function () { var s = scelta('labels', ['all', 'selected', 'none'], [TEXT.rgLabelsAll, TEXT.rgLabelsSel, TEXT.rgLabelsNone]); s.nome = TEXT.rgLabels; return s; })(),
    (function () { var s = scelta('clockStyle', ['thin', 'classic', 'bold', 'mono', 'rounded', 'digital'], [TEXT.rgThin, TEXT.rgClassic, TEXT.rgBold, TEXT.rgMono, TEXT.rgRounded, TEXT.rgDigital]); s.nome = TEXT.rgClock; return s; })(),
    (function () { var s = scelta('clockSize', ['small', 'medium', 'large'], [TEXT.rgSmall, TEXT.rgMedium, TEXT.rgLarge]); s.nome = TEXT.rgClockSize; return s; })(),
    (function () { var s = scelta('clock', ['24', '12'], ['24 h', '12 h']); s.nome = TEXT.rgClockFormat; return s; })(),
    interruttore(TEXT.rgWeather, function () { return !!cfg.weather; }, function (v) {
      if (!v) { try { localStorage.setItem('meteoPrima', JSON.stringify(cfg.weather)); } catch (e) {} return salvaTv({ weather: null }); }
      if (meteoPrima && meteoPrima.name) return salvaTv({ weather: meteoPrima });
      rgNota(TEXT.rgWeatherPhone);
    }),
    (function () { var s = scelta('units', ['c', 'f'], ['°C', '°F']); s.nome = TEXT.rgUnits; return s; })(),
    { nome: TEXT.rgVeil, tipo: 'cursore', valore: function () { return (typeof cfg.veil === 'number' ? cfg.veil : 80) + ' %'; },
      cambia: function (d) {
        var v = Math.max(0, Math.min(100, (typeof cfg.veil === 'number' ? cfg.veil : 80) + d * 5));
        cfg.veil = v;
        veil.style.opacity = v / 100; // at once on the screen; saved once the key is left alone
        clearTimeout(rgTimer);
        rgTimer = setTimeout(function () { salvaTv({ veil: v }); }, 500);
        disegnaReglages();
      } }
  ];
  var remote = [
    { nome: TEXT.rgNextKey, tipo: 'info', valore: function () { return keyNames[Math.max(0, keys.indexOf(cfg.nextBgKey || 'none'))]; } },
    (function () { var s = scelta('collectionsKey', keys, keyNames); s.nome = TEXT.rgCollKey; return s; })(),
    { nome: TEXT.rgKeysHelp, tipo: 'info', valore: function () { return ''; } }
  ];
  var sistema = [
    { nome: TEXT.rgVersion, tipo: 'info', valore: function () { return APP_VERSION; } },
    { nome: TEXT.rgPage, tipo: 'info', valore: function () { return url; } },
    { nome: TEXT.rgReload, tipo: 'azione', valore: function () { return ''; }, apri: function () { location.reload(); } }
  ];
  return [
    { nome: TEXT.control, voci: controllo }, { nome: TEXT.rgBackground, voci: fond }, { nome: TEXT.rgHome, voci: accueil },
    { nome: TEXT.rgRemote, voci: remote }, { nome: TEXT.rgSystem, voci: sistema, qr: url }
  ];
}

// The tiles, in the sub-list of Home: each shown or hidden, and moved with OK then up and down.
function vociTiles() {
  return rg.tiles.map(function (t, i) {
    return { nome: t.title, tipo: 'tile', valore: function () { return rg.sposta === i ? TEXT.rgMoving : t.hidden ? TEXT.rgHiddenOne : TEXT.rgShownOne; } };
  });
}

function vociOra() { return rg.sotto === 'tiles' ? vociTiles() : rubriche()[rg.rub].voci; }

function disegnaReglages() {
  var rub = rubriche(), voci = vociOra();
  rgMenu.innerHTML = '';
  rub.forEach(function (r, i) {
    var li = document.createElement('li');
    li.textContent = r.nome;
    li.className = i === rg.rub ? (rg.zona === 'menu' ? 'sel' : 'scelta') : '';
    rgMenu.appendChild(li);
  });
  rgTitolo.textContent = rg.sotto === 'tiles' ? TEXT.rgTiles : rub[rg.rub].nome;
  rgVoci.innerHTML = '';
  voci.forEach(function (v, i) {
    var li = document.createElement('li'), n = document.createElement('span'), val = document.createElement('b');
    n.textContent = v.nome;
    val.textContent = v.valore();
    // Left and right change a value (‹ ›); OK opens what has a chevron (›).
    li.className = (v.tipo === 'info' ? 'info' : v.cambia ? 'val' : v.tipo === 'apri' ? 'apre' : '') + (rg.sposta === i ? ' sposta' : '') +
      (rg.sotto === 'tiles' && rg.tiles[i].hidden ? ' spenta' : '');
    li.appendChild(n);
    li.appendChild(val);
    rgVoci.appendChild(li);
  });
  rgQr.innerHTML = !rg.sotto && rub[rg.rub].qr ? qrSvg(rub[rg.rub].qr, 300) + '<p>' + TEXT.rgQr + '</p>' : '';
  rg.sel = Math.max(0, Math.min(rg.sel, voci.length - 1));
  selezionaReglage(rg.sel);
  if (!rgNotaEl.textContent || rgNotaEl.textContent === TEXT.rgNote || rgNotaEl.textContent === TEXT.rgTilesNote) rgNota('');
}

// The row in focus, by class on the row left and the one taken; the list slides by whole rows, with a transform.
var rgSelPrima = -1;
function selezionaReglage(i) {
  rg.sel = i;
  for (var k = 0; k < rgVoci.children.length; k++) {
    var c = rgVoci.children[k];
    c.classList.toggle('sel', rg.zona === 'det' && k === i);
  }
  var visibili = 8, cima = Math.max(0, Math.min(i - visibili + 2, rgVoci.children.length - visibili));
  if (i < visibili - 1) cima = 0;
  rgVoci.style.webkitTransform = rgVoci.style.transform = 'translateY(' + (-cima * RG_ALTEZZA) + 'px)';
  rgSelPrima = i;
}

function apriReglages(rub, dentro) {
  rg = { rub: rub || 0, zona: dentro ? 'det' : 'menu', sel: 0, sotto: null, sposta: -1, tiles: null };
  reglages.hidden = false;
  document.body.classList.add('pannello');
  rgNota('');
  leggiLib(false);
  disegnaReglages();
}
function chiudiReglages() {
  reglages.hidden = true;
  rgRitorno = false;
  document.body.classList.remove('pannello');
  seleziona(sel, true);
}
// Back from the controls or the collections opened from here: to the settings again.
function tornaReglages() {
  if (!rgRitorno) return false;
  rgRitorno = false;
  reglages.hidden = false;
  document.body.classList.add('pannello');
  disegnaReglages();
  return true;
}

function tastoReglages(e) {
  var k = e.keyCode, voci = vociOra(), v = voci[rg.sel];
  if (k === 461 || k === 27 || k === 8) {
    if (rg.sposta !== -1) { rg.sposta = -1; rg.tiles = (cfg.tiles || []).slice(); disegnaReglages(); }
    else if (rg.sotto) { rg.sotto = null; rg.sel = 0; disegnaReglages(); }
    else if (rg.zona === 'det') { rg.zona = 'menu'; disegnaReglages(); }
    else chiudiReglages();
  } else if (rg.zona === 'menu') {
    if (k === 38 && rg.rub > 0) { rg.rub--; rg.sel = 0; disegnaReglages(); }
    else if (k === 40 && rg.rub < rubriche().length - 1) { rg.rub++; rg.sel = 0; disegnaReglages(); }
    else if (k === 39 || k === 13) { rg.zona = 'det'; rg.sel = 0; disegnaReglages(); }
    else if (k < 37 || k > 40) return; // the panel keeps every arrow, even one that leads nowhere
  } else if (rg.sotto === 'tiles') {
    if (k === 38 || k === 40) {
      var d = k === 38 ? -1 : 1, j = rg.sel + d;
      if (j < 0 || j >= rg.tiles.length) { e.preventDefault(); return; }
      if (rg.sposta !== -1) { var t = rg.tiles[rg.sel]; rg.tiles[rg.sel] = rg.tiles[j]; rg.tiles[j] = t; rg.sposta = j; rg.sel = j; disegnaReglages(); }
      else selezionaReglage(j);
    } else if (k === 13) {
      if (rg.sposta === -1) { rg.sposta = rg.sel; disegnaReglages(); }
      else { rg.sposta = -1; salvaTv({ tiles: rg.tiles }); disegnaReglages(); }
    } else if ((k === 37 || k === 39) && rg.sposta === -1) {
      var tile = {}, o = rg.tiles[rg.sel];
      Object.keys(o).forEach(function (x) { if (x !== 'hidden') tile[x] = o[x]; });
      if (!o.hidden) tile.hidden = true;
      rg.tiles[rg.sel] = tile;
      salvaTv({ tiles: rg.tiles });
      disegnaReglages();
    } else if (k < 37 || k > 40) return;
  } else {
    if (k === 38 && rg.sel > 0) selezionaReglage(rg.sel - 1);
    else if (k === 40 && rg.sel < voci.length - 1) selezionaReglage(rg.sel + 1);
    else if ((k === 37 || k === 39) && v && v.cambia) { v.cambia(k === 37 ? -1 : 1); disegnaReglages(); }
    else if (k === 13 && v && v.apri) { if (v.tipo === 'apri' && v.nome !== TEXT.rgTiles) reglages.hidden = true; v.apri(); }
    else if (k === 13 && v && v.cambia) { v.cambia(1); disegnaReglages(); }
    else if (k === 37 && !(v && v.cambia)) { rg.zona = 'menu'; disegnaReglages(); }
    else if (k !== 38 && k !== 40 && k !== 37 && k !== 39 && k !== 13) return;
  }
  e.preventDefault();
}
