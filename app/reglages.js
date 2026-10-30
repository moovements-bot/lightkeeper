/*
 * The TV's own settings (perso.9, tabs since perso.10), from the gear and the tile Controls, all with the remote,
 * in the look of the Controls panel: a row of tabs at the top (Controls · Background · Home · Remote · System),
 * under it, where a tab has some, a row of sub-tabs, then the list of settings. Left and right move along the row
 * that has the focus; down goes to the next row (tabs, sub-tabs, list), up back; in the list, left and right change
 * a value (‹ ›), OK ticks, opens or acts; Back goes up a row, then closes. The help line follows where the focus is.
 * Each change is sent at once to the server (/api/home/config, the settings page's own checks) and the Home is
 * drawn again from its answer. What needs text stays on the settings page, whose address and QR code are under
 * System. Strict ES5; rows of one height, so moving asks for no layout. Uses the Home's own names.
 */
var RG_ALTEZZA = 100, RG_VISIBILI = 6; // px a row, rows in view
var reglages = document.getElementById('reglages');
var rgTabs = reglages.querySelector('.tabs'), rgSubs = reglages.querySelector('.subs'), rgVoci = reglages.querySelector('.voci');
var rgNotaEl = reglages.querySelector('.nota'), rgQr = reglages.querySelector('.qr');
var rg = { tab: 1, sub: 0, zona: 'tab', sel: 0, sposta: -1 }, rgLib = null, rgTimer = null, rgRitorno = false, rgCt = null;
reglages.querySelector('h2').textContent = TEXT.rgTitle;

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
    if (r && r.ok && r.config) applicaConfig(r.config); else rgAvviso(TEXT.rgFailed);
    if (dopo) dopo(!!(r && r.ok));
  };
  x.onerror = x.ontimeout = function () { rgAvviso(TEXT.rgFailed); if (dopo) dopo(false); };
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
var rgAvvisoTimer = null, rgAvvisoOn = false;
function rgAvviso(t) {
  rgNotaEl.textContent = t;
  rgAvvisoOn = true;
  clearTimeout(rgAvvisoTimer);
  rgAvvisoTimer = setTimeout(function () { rgAvvisoOn = false; rgAiuto(); }, 3000);
}

// The library's state, for the tab Background.
function leggiLib(sync) {
  var x = new XMLHttpRequest();
  x.open(sync ? 'POST' : 'GET', server() + (sync ? '/api/home/sync' : '/api/home/library'));
  if (sync) x.setRequestHeader('Content-Type', 'application/json');
  x.timeout = sync ? 60000 : 8000;
  x.onload = function () {
    var r = null;
    try { r = JSON.parse(x.responseText); } catch (e) {}
    if (r && r.library) rgLib = r.library;
    if (!reglages.hidden) disegnaReglages();
    if (sync) { rgAvviso(r && r.library && !r.library.error ? TEXT.rgSynced : TEXT.rgFailed); leggi(); }
  };
  x.onerror = x.ontimeout = function () { if (sync) rgAvviso(TEXT.rgFailed); };
  x.send(sync ? '{}' : null);
}
function statoLib(quale) {
  if (!cfg.libraryUrl) return quale === 'n' ? TEXT.rgNoLib : '';
  if (!rgLib) return '…';
  var mb = function (n) { return Math.round(n / 1048576) + ' Mo'; }, d = new Date(rgLib.lastOk || 0);
  if (quale === 'n') return (rgLib.error ? TEXT.rgLibAway + ' · ' : '') + rgLib.pictures + ' ' + TEXT.rgPictures + ' · ' + rgLib.collections.length + ' ' + TEXT.rgCollections;
  if (quale === 'cache') return mb(rgLib.cacheBytes) + (rgLib.capBytes ? ' / ' + mb(rgLib.capBytes) : '');
  return rgLib.lastOk ? d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() : '—';
}

// The TV's controls (sources, sound, picture, sleep timer), read as the Controls panel reads them.
function leggiCt() {
  var x = new XMLHttpRequest();
  x.open('GET', server() + '/api/control');
  x.timeout = 20000;
  x.onload = function () {
    var r = null;
    try { r = JSON.parse(x.responseText); } catch (e) {}
    rgCt = r && r.ok ? r : 'failed';
    if (r && r.ok) ctDati = r;
    if (!reglages.hidden && rg.tab === 0) disegnaReglages();
  };
  x.onerror = x.ontimeout = function () { rgCt = 'failed'; if (!reglages.hidden && rg.tab === 0) disegnaReglages(); };
  x.send();
}
// A choice among values: left and right go through them.
function scelta(nome, campo, valori, nomi) {
  return { nome: nome, tipo: 'val',
    valore: function () { var i = valori.indexOf(cfg[campo]); return nomi[i < 0 ? 0 : i]; },
    cambia: function (d) {
      var i = valori.indexOf(cfg[campo]), c = {};
      c[campo] = valori[((i < 0 ? 0 : i) + d + valori.length) % valori.length];
      salvaTv(c);
    } };
}
function interruttore(nome, acceso, cambia) {
  return { nome: nome, tipo: 'val', valore: function () { return rgSiNo(acceso()); }, cambia: function () { cambia(!acceso()); } };
}
function info(nome, valore) { return { nome: nome, tipo: 'info', valore: valore }; }
function azione(nome, fai) { return { nome: nome, tipo: 'azione', valore: function () { return ''; }, fai: fai }; }

/* ---------- the tabs, their sub-tabs and their rows ---------- */

function schede() {
  var keys = ['none', 'red', 'green', 'yellow', 'blue'], keyNames = [TEXT.keyNone, TEXT.keyRed, TEXT.keyGreen, TEXT.keyYellow, TEXT.keyBlue];
  var idle = [0, 1, 2, 5, 10, 15, 30, 60], idleNames = idle.map(function (m) { return m ? m + ' min' : TEXT.rgNever; });
  var url = 'http://' + (cfg.address || '…') + ':' + (cfg.port || porta) + '/';
  var meteoPrima = null;
  try { meteoPrima = JSON.parse(localStorage.getItem('meteoPrima')); } catch (e) {}

  // Controls: the very headings and choices of the Controls panel.
  var controllo;
  if (!rgCt) controllo = [{ nome: TEXT.tabSources, righe: [info(TEXT.loading, function () { return ''; })] }];
  else if (rgCt === 'failed') controllo = [{ nome: TEXT.tabSources, righe: [info(TEXT.failed, function () { return ''; })] }];
  else controllo = vociControllo().map(function (c) {
    return { nome: c.nome, righe: c.voci.map(function (v) {
      return { nome: v.label, tipo: v.apri ? 'apri' : 'segno', logo: v.logo, assente: v.assente, valore: function () { return v.segno ? '✓' : ''; },
        // A source or LG's page opens (the settings close); a sound output, picture mode or sleep timer is set by
        // the server as the Controls panel sets it, and the TV is read again for what it did.
        fai: v.apri ? function () { chiudiReglages(); v.apri(); } : function () { if (v.imposta) v.imposta(); setTimeout(leggiCt, 1500); } };
    }) };
  });

  // Background → Collections: crossed or not, all, then each collection under its category.
  var scelti = cfg.libraryCollections || [], collezioni = [
    interruttore(TEXT.rgCross, function () { return cfg.libraryMatch === 'cross'; }, function (v) { salvaTv({ libraryMatch: v ? 'cross' : 'any' }); }),
    { nome: TEXT.allAlbums, tipo: 'segno', valore: function () { return scelti.length ? '' : '✓'; }, fai: function () { salvaTv({ libraryCollections: [] }); } }
  ], cat = null;
  (cfg.libraryCollectionList || []).forEach(function (c) {
    if (c.cat !== cat) { cat = c.cat; collezioni.push({ nome: cat, tipo: 'titolo', valore: function () { return ''; } }); }
    collezioni.push({ nome: c.name, tipo: 'segno', conto: c.count, valore: function () { return scelti.indexOf(c.id) !== -1 ? '✓' : ''; },
      fai: function () {
        var n = scelti.filter(function (x) { return x !== c.id; });
        if (scelti.indexOf(c.id) === -1) n.push(c.id);
        salvaTv({ libraryCollections: n });
      } });
  });
  if (!(cfg.libraryCollectionList || []).length) collezioni.push(info(TEXT.noAlbums, function () { return ''; }));

  // Home → Tiles: how they show, then each tile, shown or hidden, moved with OK.
  var tiles = [scelta(TEXT.rgTileStyle, 'tileStyle', ['text', 'logo', 'icon'], [TEXT.rgNames, TEXT.rgLogos, TEXT.rgIcons]),
    scelta(TEXT.rgLabels, 'labels', ['all', 'selected', 'none'], [TEXT.rgLabelsAll, TEXT.rgLabelsSel, TEXT.rgLabelsNone])];
  (cfg.tiles || []).forEach(function (t, i) {
    tiles.push({ nome: t.title, tipo: 'tile', indice: i, spenta: !!t.hidden,
      valore: function () { return rg.sposta === i ? TEXT.rgMoving : t.hidden ? TEXT.rgHiddenOne : TEXT.rgShownOne; } });
  });

  return [
    { nome: TEXT.control, subs: controllo },
    { nome: TEXT.rgBackground, subs: [
      { nome: TEXT.albums, righe: collezioni },
      { nome: TEXT.rgScroll, righe: [
        scelta(TEXT.rgOrder, 'libraryOrder', ['shuffle', 'order'], [TEXT.rgShuffle, TEXT.rgInOrder]),
        scelta(TEXT.rgRotate, 'libraryRotate', ['power', 15, 30, 60, 120, 'manual'], [TEXT.rgPower, '15 min', '30 min', '60 min', '120 min', TEXT.rgManual]),
        interruttore(TEXT.rgByTime, function () { return cfg.backgroundMode === 'time'; }, function (v) { salvaTv({ backgroundMode: v ? 'time' : cfg.libraryUrl ? 'library' : 'fixed' }); })] },
      { nome: TEXT.rgCaptionIdle, righe: [
        interruttore(TEXT.rgCaption, function () { return !!cfg.captions; }, function (v) { salvaTv({ captions: v }); }),
        scelta(TEXT.rgIdle, 'idleMinutes', idle, idleNames)] },
      { nome: TEXT.rgState, righe: [
        azione(TEXT.rgSync, function () { rgAvviso(TEXT.rgSyncing); leggiLib(true); }),
        info(TEXT.rgLibrary, function () { return statoLib('n'); }),
        info(TEXT.rgCache, function () { return statoLib('cache'); }),
        info(TEXT.rgRead, function () { return statoLib('lue'); }),
        info(TEXT.rgToReview, function () { return rgLib && cfg.libraryUrl ? String(rgLib.toReview || 0) : '—'; }),
        info(TEXT.rgHiddenPics, function () { return rgLib && cfg.libraryUrl ? String(rgLib.hidden || 0) : '—'; }),
        info(TEXT.rgHardPics, function () { return rgLib && cfg.libraryUrl ? String(rgLib.difficult || 0) : '—'; }),
        info(TEXT.rgToVerify, function () { return rgLib && cfg.libraryUrl ? String(rgLib.toVerify || 0) + (rgLib.auto ? ' · ' + rgLib.auto + ' ' + TEXT.rgAutoN : '') : '—'; })] }] },
    { nome: TEXT.rgHome, subs: [
      { nome: TEXT.rgTiles, righe: tiles },
      { nome: TEXT.rgClock, righe: [
        scelta(TEXT.rgClockStyle, 'clockStyle', ['thin', 'classic', 'bold', 'mono', 'rounded', 'digital'], [TEXT.rgThin, TEXT.rgClassic, TEXT.rgBold, TEXT.rgMono, TEXT.rgRounded, TEXT.rgDigital]),
        scelta(TEXT.rgClockSize, 'clockSize', ['small', 'medium', 'large'], [TEXT.rgSmall, TEXT.rgMedium, TEXT.rgLarge]),
        scelta(TEXT.rgClockFormat, 'clock', ['24', '12'], ['24 h', '12 h'])] },
      { nome: TEXT.rgWeather, righe: [
        interruttore(TEXT.rgWeather, function () { return !!cfg.weather; }, function (v) {
          if (!v) { try { localStorage.setItem('meteoPrima', JSON.stringify(cfg.weather)); } catch (e) {} return salvaTv({ weather: null }); }
          if (meteoPrima && meteoPrima.name) return salvaTv({ weather: meteoPrima });
          rgAvviso(TEXT.rgWeatherPhone);
        }),
        info(TEXT.rgCity, function () { return cfg.weather ? cfg.weather.name : (meteoPrima && meteoPrima.name) || '—'; }),
        scelta(TEXT.rgUnits, 'units', ['c', 'f'], ['°C', '°F'])] },
      { nome: TEXT.rgWallpaper, righe: [
        { nome: TEXT.rgVeil, tipo: 'val', valore: function () { return (typeof cfg.veil === 'number' ? cfg.veil : 80) + ' %'; },
          cambia: function (d) {
            var v = Math.max(0, Math.min(100, (typeof cfg.veil === 'number' ? cfg.veil : 80) + d * 5));
            cfg.veil = v;
            veil.style.opacity = v / 100; // at once on the screen; saved once the key is left alone
            clearTimeout(rgTimer);
            rgTimer = setTimeout(function () { salvaTv({ veil: v }); }, 500);
          } }] }] },
    { nome: TEXT.rgRemote, subs: [{ nome: '', righe: [
      info(TEXT.rgNextKey, function () { return keyNames[Math.max(0, keys.indexOf(cfg.nextBgKey || 'none'))]; }),
      scelta(TEXT.rgCollKey, 'collectionsKey', keys, keyNames)] }] },
    { nome: TEXT.rgSystem, qr: url, subs: [{ nome: '', righe: [
      info(TEXT.rgVersion, function () { return APP_VERSION; }),
      info(TEXT.rgPage, function () { return url; }),
      azione(TEXT.rgReload, function () { location.reload(); })] }] }
  ];
}

function rgScheda() { var s = schede(); rg.tab = Math.max(0, Math.min(rg.tab, s.length - 1)); return s[rg.tab]; }
function rgSubOra(sch) { rg.sub = Math.max(0, Math.min(rg.sub, sch.subs.length - 1)); return sch.subs[rg.sub]; }
function haSub(sch) { return sch.subs.length > 1 || !!sch.subs[0].nome; }

/* ---------- drawing ---------- */

function disegnaReglages() {
  var tutte = schede();
  rg.tab = Math.max(0, Math.min(rg.tab, tutte.length - 1));
  var sch = tutte[rg.tab], sub = rgSubOra(sch), righe = sub.righe;
  rgTabs.innerHTML = '';
  tutte.forEach(function (s, i) {
    var a = document.createElement('a');
    a.textContent = s.nome;
    a.className = i === rg.tab ? 'sel' + (rg.zona === 'tab' ? ' fuoco' : '') : '';
    rgTabs.appendChild(a);
  });
  rgSubs.innerHTML = '';
  rgSubs.hidden = !haSub(sch);
  if (haSub(sch)) sch.subs.forEach(function (s, i) {
    var a = document.createElement('a');
    a.textContent = s.nome;
    a.className = i === rg.sub ? 'sel' + (rg.zona === 'sub' ? ' fuoco' : '') : '';
    rgSubs.appendChild(a);
  });
  reglages.className = haSub(sch) ? '' : 'senza-sub';
  rgVoci.innerHTML = '';
  righe.forEach(function (v, i) {
    var li = document.createElement('li'), nome = document.createElement('span');
    li.className = v.tipo + (v.spenta ? ' spenta' : '') + (v.assente ? ' assente' : '') + (rg.sposta === v.indice && v.tipo === 'tile' ? ' sposta' : '');
    if (v.logo) {
      var box = document.createElement('div');
      box.className = 'logo';
      box.appendChild(disegnaLogo(v.logo, 56, 130, 64));
      li.appendChild(box);
    }
    nome.textContent = v.nome;
    li.appendChild(nome);
    if (v.conto) { var c = document.createElement('i'); c.textContent = String(v.conto); li.appendChild(c); }
    var val = v.valore();
    if (val) { var b = document.createElement('b'); b.textContent = val; li.appendChild(b); }
    rgVoci.appendChild(li);
  });
  rgQr.innerHTML = sch.qr ? qrSvg(sch.qr, 300) + '<p>' + TEXT.rgQr + '</p>' : '';
  if (rg.zona === 'list') {
    rg.sel = Math.max(0, Math.min(rg.sel, righe.length - 1));
    if (righe[rg.sel] && righe[rg.sel].tipo === 'titolo') rg.sel = Math.max(0, prossima(righe, rg.sel, 1));
  }
  selezionaReglage(rg.sel);
}

// The row in focus, by class; the list slides by whole rows, with a transform.
function selezionaReglage(i) {
  rg.sel = i;
  for (var k = 0; k < rgVoci.children.length; k++) rgVoci.children[k].classList.toggle('sel', rg.zona === 'list' && k === i);
  var cima = rg.zona !== 'list' || i < RG_VISIBILI - 1 ? 0 : Math.min(i - RG_VISIBILI + 2, rgVoci.children.length - RG_VISIBILI);
  rgVoci.style.webkitTransform = rgVoci.style.transform = 'translateY(' + (-Math.max(0, cima) * RG_ALTEZZA) + 'px)';
  if (!rgAvvisoOn) rgAiuto();
}

// The help line, for where the focus is.
function rgAiuto() {
  var sch = rgScheda(), righe = rgSubOra(sch).righe, v = righe[rg.sel];
  if (rg.zona === 'tab') rgNotaEl.textContent = TEXT.rgHelpTab;
  else if (rg.zona === 'sub') rgNotaEl.textContent = TEXT.rgHelpSub;
  else if (rg.sposta !== -1) rgNotaEl.textContent = TEXT.rgHelpMoving;
  else if (!v || v.tipo === 'info' || v.tipo === 'titolo') rgNotaEl.textContent = TEXT.rgHelpInfo;
  else if (v.tipo === 'val') rgNotaEl.textContent = TEXT.rgHelpVal;
  else if (v.tipo === 'tile') rgNotaEl.textContent = TEXT.rgHelpTile;
  else if (v.tipo === 'segno') rgNotaEl.textContent = TEXT.rgHelpTick;
  else rgNotaEl.textContent = TEXT.rgHelpOk;
}

// The next row that can take the focus, over the category lines; -1 when there is none that way.
function prossima(righe, i, d) {
  for (var j = i + d; j >= 0 && j < righe.length; j += d) if (righe[j].tipo !== 'titolo') return j;
  return -1;
}

/* ---------- opening, closing, keys ---------- */

// tab: null for the last one used (Background the first time); sub; straight into the list.
function apriReglages(tab, sub, inLista) {
  var ultima = 1;
  try { var u = localStorage.getItem('rgTab'); if (u !== null && +u >= 0 && +u < 5) ultima = +u; } catch (e) {}
  rg = { tab: tab === undefined || tab === null ? ultima : tab, sub: sub || 0, zona: inLista ? 'list' : 'tab', sel: 0, sposta: -1 };
  reglages.hidden = false;
  document.body.classList.add('pannello');
  leggiLib(false);
  if (rg.tab === 0) leggiCt();
  disegnaReglages();
}
function chiudiReglages() {
  reglages.hidden = true;
  rgRitorno = false;
  document.body.classList.remove('pannello');
  try { localStorage.setItem('rgTab', String(rg.tab)); } catch (e) {}
  seleziona(sel, true);
}
// Kept for the panels opened from here before perso.10 (Controls, collections): back to the settings.
function tornaReglages() {
  if (!rgRitorno) return false;
  rgRitorno = false;
  reglages.hidden = false;
  document.body.classList.add('pannello');
  disegnaReglages();
  return true;
}

function cambiaScheda(d) {
  var t = rg.tab + d;
  if (t < 0 || t >= schede().length) return;
  rg.tab = t;
  rg.sub = 0;
  rg.sel = 0;
  if (t === 0) leggiCt();
  disegnaReglages();
}

function tastoReglages(e) {
  var k = e.keyCode, sch = rgScheda(), righe = rgSubOra(sch).righe, v = righe[rg.sel];
  var giu = k === 40, su = k === 38, sx = k === 37, dx = k === 39, ok = k === 13, indietro = k === 461 || k === 27 || k === 8;
  if (indietro) {
    if (rg.sposta !== -1) { rg.sposta = -1; disegnaReglages(); }
    else if (rg.zona === 'list') { rg.zona = haSub(sch) ? 'sub' : 'tab'; disegnaReglages(); }
    else if (rg.zona === 'sub') { rg.zona = 'tab'; disegnaReglages(); }
    else chiudiReglages();
  } else if (rg.zona === 'tab') {
    if (sx || dx) cambiaScheda(sx ? -1 : 1);
    else if (giu || ok) { rg.zona = haSub(sch) ? 'sub' : 'list'; rg.sel = 0; disegnaReglages(); }
    else if (!su) return;
  } else if (rg.zona === 'sub') {
    if ((sx && rg.sub > 0) || (dx && rg.sub < sch.subs.length - 1)) { rg.sub += sx ? -1 : 1; rg.sel = 0; disegnaReglages(); }
    else if (su) { rg.zona = 'tab'; disegnaReglages(); }
    else if (giu || ok) { rg.zona = 'list'; rg.sel = 0; disegnaReglages(); }
    else if (!sx && !dx) return;
  } else if (rg.sposta !== -1) {
    // A tile on the move: up and down carry it, OK drops it (saved).
    if (su || giu) {
      var tiles = (cfg.tiles || []).slice(), da = rg.sposta, a = da + (su ? -1 : 1);
      if (a >= 0 && a < tiles.length) {
        var t = tiles[da]; tiles[da] = tiles[a]; tiles[a] = t;
        cfg.tiles = tiles; rg.sposta = a; rg.sel += su ? -1 : 1;
        disegnaReglages();
      }
    } else if (ok) { rg.sposta = -1; salvaTv({ tiles: cfg.tiles }); disegnaReglages(); }
    else if (!sx && !dx) return;
  } else {
    if (su || giu) {
      var j = prossima(righe, rg.sel, su ? -1 : 1);
      if (j !== -1) selezionaReglage(j);
      else if (su) { rg.zona = haSub(sch) ? 'sub' : 'tab'; disegnaReglages(); }
    } else if ((sx || dx) && v && v.cambia) { v.cambia(sx ? -1 : 1); disegnaReglages(); }
    else if ((sx || dx) && v && v.tipo === 'tile') {
      var lista = (cfg.tiles || []).slice(), o = lista[v.indice], nuova = {};
      Object.keys(o).forEach(function (x) { if (x !== 'hidden') nuova[x] = o[x]; });
      if (!o.hidden) nuova.hidden = true;
      lista[v.indice] = nuova;
      salvaTv({ tiles: lista });
    } else if (ok && v && v.tipo === 'tile') { rg.sposta = v.indice; disegnaReglages(); }
    else if (ok && v && v.fai) v.fai();
    else if (ok && v && v.cambia) v.cambia(1);
    else if (!sx && !dx && !ok) return;
  }
  e.preventDefault();
}
