/*
 * The background by the time of day, shared by the Home, the settings page and the
 * server (which reads it to check what it is sent) and by test/check.js. Pure
 * functions and constants, no page and no server in here: strict ES5, as the Home runs
 * on the oldest Chromium the TVs have.
 *
 * The slots: seven, each from its start hour to the next one's; the last, the night,
 * runs on past midnight to the first one's start. Which pictures go with which slot is
 * the config's bgTags: { "<picture id>": { slots: ["noon", "afternoon"] } }. A later
 * version can add seasons to each entry (seasons: ["spring"]), a picture with none
 * being for every season, and the slot's pool then takes the season of the day in
 * fondiDellaFascia; nothing else here has to change.
 */
var FASCE = ['dawn', 'morning', 'noon', 'afternoon', 'sunset', 'dusk', 'night'];
// Where each slot starts, in hours of the TV's own clock.
var FASCE_INIZI = { dawn: 6, morning: 8, noon: 11, afternoon: 15, sunset: 18, dusk: 20, night: 22 };

// All seven starts, whole hours from 0 to 23, each later than the one before.
function iniziValidi(inizi) {
  if (!inizi || typeof inizi !== 'object' || Object.prototype.toString.call(inizi) === '[object Array]') return false;
  if (Object.keys(inizi).length !== FASCE.length) return false;
  for (var i = 0; i < FASCE.length; i++) {
    var h = inizi[FASCE[i]];
    if (typeof h !== 'number' || h % 1 || h < 0 || h > 23 || (i && h <= inizi[FASCE[i - 1]])) return false;
  }
  return true;
}

// The slot an hour (0 to 23) is in. Before the first slot starts it is still the night's.
function fasciaDi(ora, inizi) {
  if (!iniziValidi(inizi)) inizi = FASCE_INIZI;
  for (var i = FASCE.length - 1; i >= 0; i--) if (ora >= inizi[FASCE[i]]) return FASCE[i];
  return 'night';
}

// A name for this slot of this day: "noon@20388". The day turns over when the first slot
// starts, so a night is one night across midnight. The day is counted on the wall clock.
function chiaveFascia(data, inizi) {
  if (!iniziValidi(inizi)) inizi = FASCE_INIZI;
  var parete = data.getTime() - data.getTimezoneOffset() * 60000 - inizi[FASCE[0]] * 3600000;
  return fasciaDi(data.getHours(), inizi) + '@' + Math.floor(parete / 86400000);
}

// The pictures (ids, in order) ticked for a slot.
function fondiDellaFascia(fascia, ids, tag) {
  return (ids || []).filter(function (id) {
    var t = tag && tag[id];
    return !!(t && t.slots && t.slots.indexOf(fascia) !== -1);
  });
}

// FNV-1a over the characters, in 32 bits.
function hash32(testo) {
  var h = 2166136261;
  for (var i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h;
}

// One of the pictures for this slot of this day, as if drawn at random: the same one all
// along it, on the TV and on the settings page alike. passo moves on from it, one picture
// for each press of "next background".
function sceltaFascia(chiave, pool, passo) {
  if (!pool.length) return null;
  // The high bits: the low ones of a hash of such short names follow the day's parity.
  return pool[((hash32(chiave) >>> 8) + (passo || 0)) % pool.length];
}

// What the background by the time of day is at this moment, for a config as the server
// gives it: {fascia, chiave, pool, id}, with id null when no picture is ticked for the slot.
function fondoDelMomento(cfg, data, passo) {
  var fascia = fasciaDi(data.getHours(), cfg.timeSlots);
  var pool = fondiDellaFascia(fascia, cfg.backgroundIds, cfg.bgTags);
  var chiave = chiaveFascia(data, cfg.timeSlots);
  return { fascia: fascia, chiave: chiave, pool: pool, id: sceltaFascia(chiave, pool, passo) };
}
