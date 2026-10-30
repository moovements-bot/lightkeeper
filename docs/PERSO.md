# Lightkeeper, personal version (1.0.9-perso.14)

Branch `perso`, from Lightkeeper 1.0.9. Two additions, and the updates off.

## Background by the time of day

Settings, *Background*, *Choice of background*: **Fixed**, **Random at power on**, **By time of day**.

| Slot | Default hours |
|---|---|
| Dawn (Aube) | 06:00 – 08:00 |
| Morning (Matin) | 08:00 – 11:00 |
| Noon (Midi) | 11:00 – 15:00 |
| Afternoon (Après-midi) | 15:00 – 18:00 |
| Sunset (Coucher) | 18:00 – 20:00 |
| Dusk (Crépuscule) | 20:00 – 22:00 |
| Night (Nuit) | 22:00 – 06:00 |

- The hours are the TV's own clock. The start of each slot can be changed in the settings (whole hours, each after the one before).
- Under the hours, each picture has one tick box per slot. Several pictures in a slot: one is drawn when the slot begins (the same all along it, and the same on the settings preview). A slot with none ticked keeps the picture on the screen.
- The Home looks at the slot every minute, at power on and when it comes back to the front, and changes with a soft fade.

### Data (config.json)

```
"backgroundMode": "fixed" | "random" | "time"      randomBackground stays true only with "random"
"timeSlots": { "dawn": 6, "morning": 8, "noon": 11, "afternoon": 15, "sunset": 18, "dusk": 20, "night": 22 }
"bgTags": { "<picture id>": { "slots": ["noon", "afternoon"] } }
"nextBgKey": "none" | "red" | "green" | "yellow" | "blue"
```

The server refuses anything else (unknown picture, unknown slot, extra field). **Seasons, later:** add `"seasons": [...]` to each `bgTags` entry (none = every season), accept it in `validate` (`bgTags`) and take it into account in `fondiDellaFascia` in `app/fondi.js`; the config saved today keeps working as it is.

The calculation (`fasciaDi`, `chiaveFascia`, `fondiDellaFascia`, `sceltaFascia`, `fondoDelMomento`) is in `app/fondi.js`, shared by the Home, the settings page and the server, and checked in `test/check.js`.

## Next background

- **Tile**: Settings, *Tiles*, *Add a tile…*, group *Lightkeeper*, *Next background* (picture-frame icon, renamable like any tile).
- **Key**: *Remote key for the next background*: red, green, yellow or blue. The Home reads the colour key itself while it is in front; GlassHouse's key map is not touched.
- By the time of day: next of the pictures of the slot, kept until the slot changes. Random: next of those ticked, kept until the TV goes off (the server keeps it, `POST /api/background/next`, from the Home only). Fixed: nothing to go through.

## Captions, the painting alone, controls (perso.2)

- **Captions**: settings, *Captions of your paintings* (artist, title, year for each picture of yours), and the switch *Caption on the Home*. Config: `captions`, `bgInfo: { "<id>": { "artist", "title", "year" } }`.
- **Painting alone**: *Painting alone after* (`idleMinutes`, 5 by default, 0 = never). Any key or the pointer ends it and does nothing else. **LG's screen saver and OLED care are not touched**: the TV's own screen saver has its own timer (it is not readable from here); if it starts before ours, it covers the painting, and a key press wakes the TV from it first. For the painting to show, keep LG's timer longer than ours, or use *Pause for an hour* under *Remote and power* in the settings, which answers LG's own request for the screen saver (a mechanism the project already had) and ends by itself.
- **Controls tile**: *Tiles*, *Add a tile…*, *Lightkeeper*, *Controls*. Left and right change the heading, up and down the choice, OK applies it, Back closes.
  - Sources: `applicationManager/launch` of the input's app, as a tile does. Names and devices are those of your tiles, else the TV's labels.
  - Sound output, picture mode, sleep timer: `com.webos.settingsservice` `getSystemSettings` / `getSystemSettingDesc` / `setSystemSettings` (categories `sound`, `picture`, `time`; keys `soundOutput`, `pictureMode`, `sleepTimer`). Read on the C1 (webOS 6.5.3) on 27/10/2026. Only values of the fixed lists in `server.js` (`CONTROLS`) are sent, and only those the TV itself lists as active and visible.
  - LG's pages: `applicationManager/launch` of `com.palm.app.settings` with `{"target": "network" | "Device" | "picture" | "sound"}`, targets read in that app's own code.
  - Left out: switching Wi-Fi or Bluetooth on or off (undocumented services), and the sound outputs the TV lists beyond the four above.

## Updates

Off: no button, and the server answers that updates are off. An official update would replace this version. In the Homebrew Channel, do not update Lightkeeper from the project's repository.

## Back to the official version

Install the project's `lightkeeper.ipk` (latest release) over this one: Homebrew Channel, or from a computer
`LIGHTKEEPER_SSH="ssh -i <key>" ./lightkeeper.sh install <tv>` with the official sources. Your settings are in `/var/lib/lightkeeper/` and stay; fields the official version does not know (`backgroundMode`, `timeSlots`, `bgTags`, `nextBgKey`) are ignored by it, and dropped at its next save. A copy of that folder, taken before installing this version, is in `~/Pictures/TV-fonds/backup-lightkeeper-2026-10-27/`.

## Library of backgrounds on a server (perso.6, collections since perso.7)

Settings, *Background*, *Choice of background*: **Library**. Give the https address of the library's `manifest.json`.

- On the server (SoQa): drop the pictures in `/srv/tv-fonds/source/` (the Storage Box, `tv-fonds/source` in Filestash); a sub-folder still works, its name becomes a tag. `source/legendes.json` holds, for each file, `titre`, `artiste`, `annee`, `lieu` and `tags` (`artiste`, `type`, `periode`, `style`, `sujet`, `saison`, `moment`). Every 5 minutes the pictures are made 3840 × 2160 (a 4K 16:9 JPEG is kept as it is), captions and tags proposed for those without (`source: auto` / `a-verifier`, `tags_source: auto`; what is written by hand is never rewritten), and the manifest written. See `INFRA.md` in soqa-ai.
- Config: `backgroundMode: "library"`, `libraryUrl`, `libraryCollections` (ids such as `artiste:van-gogh`; none = all), `libraryMatch: "any" | "cross"`, `libraryOrder: "shuffle" | "order"`, `libraryRotate: "power" | "manual" | 15 | 30 | 60 | 120`. The cache is in `/var/lib/lightkeeper/library/`.
- On the Home: the next background's key or tile goes to the next picture; a long press of the key, or the tile *Collections*, chooses the collections. Code: `app/service/bibliotheque.js`.
- Offline: the Home shows the pictures kept on the TV (four, with their slots for the time of day).
- **Back**: *Choice of background* → *By time of day* (or another). Removing the library: empty the address.

## Settings on the TV (perso.9)

The gear and the tile *Controls* open the TV's own settings (`app/reglages.js`), all with the remote, in tabs and sub-tabs like the Controls panel (perso.10); the settings page stays for what needs text (System shows its address and a QR code). Changes go through `/api/home/config` (Home only; the fields in `HOME_FIELDS` of `server.js`). Tiles can be hidden on the Home (`"hidden": true`).

