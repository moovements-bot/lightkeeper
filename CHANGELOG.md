# Changelog

## 1.0.9-perso.3 (27 October 2026)

- **A more readable caption**, on the Home and with the painting alone: as big as the weather line (34 px, 40 px on the painting alone), 92% opaque, white with a soft shadow, over a dark halo that fades out at its edges, as on Apple TV; the title is a little bolder than the artist and the year. Looked at over a pale painting (La Moisson) and a dark one (La Nuit étoilée).
- Two captions corrected: *Paysage au crépuscule* is June 1890 (Van Gogh Museum, s0107V1962, F 770), and Monet's *Champs de tulipes près de La Haye* is 1886 (Van Gogh Museum, s0530N2012, *Tulip Fields near The Hague*).

## 1.0.9-perso.2 (27 October 2026)

- **Captions.** Each of your pictures can have an artist, a title and a year (*Captions of your paintings* in the settings; `bgInfo` in the config, filled for the first eighteen from `docs/art/legendes-perso.json`). *Caption on the Home* (`captions`, off until turned on) shows it small, in the top right corner, in Jost.
- **The painting alone.** After 5 minutes without a key on the Home (`idleMinutes`: never, 1, 2, 5, 10, 15, 30 or 60), the time, the weather, the tiles and the shade fade out and the picture drifts very slowly (zoom and pan, 140 s each way, a direction chosen at random each time). The caption shows 40 seconds of every five minutes, at the foot of the picture. Any key or the pointer brings the Home back and is not passed on: it opens nothing. LG's screen saver is not touched: it keeps its own timer, and covers the painting if it starts first.
- **Controls.** A tile *Controls* (Settings, Tiles, group *Lightkeeper*) opens a panel over the Home, with the remote: *Sources* (the HDMI inputs with the names and devices of the tiles, and Live TV), *Sound output* (TV speakers, optical, HDMI ARC, Bluetooth), *Picture* (the modes the TV offers), *Sleep timer* (off, 30, 60, 90, 120 min), and shortcuts to LG's own pages (Wi-Fi and network, Bluetooth and devices, picture, sound). The server reads and sets only these three LG settings, to the values of fixed lists (`/api/control`, from the Home only). Wi-Fi and Bluetooth themselves are not switched.

## 1.0.9-perso.1 (27 October 2026)

A personal version of 1.0.9, branch `perso`. See [docs/PERSO.md](docs/PERSO.md).

- **A background by the time of day.** *Choice of background* in the settings: *Fixed*, *Random at power on* (as before) or *By time of day*. Seven slots, each from its start hour to the next one's (dawn 6, morning 8, noon 11, afternoon 15, sunset 18, dusk 20, night 22, the night running on to 6), the hours changeable in the settings. Each picture is ticked for one or more slots; with several for a slot, one is drawn for each slot of each day. The Home looks at the slot every minute, at power on and on coming back, and changes the picture with a soft fade; a slot with no picture ticked keeps the one on the screen. The pictures and slots are in the config as `bgTags` (`{ "<picture id>": { "slots": [...] } }`) and `timeSlots`; each entry is an object so that seasons can be added later without breaking what is saved. The slot calculation is in `app/fondi.js`, shared by the Home, the page and the server.
- **Next background, from the Home.** A tile *Next background* (add it under Tiles, a picture-frame icon) and a colour key of the remote (*Remote key for the next background*, off until chosen). By the time of day it goes to the next picture ticked for the slot; with the random background, to the next of those ticked, kept until the TV goes off. The choice lasts until the slot changes. With a fixed background the Home says there is nothing to go through.
- **A soft fade** whenever the Home's picture changes after the first.
- **Updates are off.** The Updates section says so and has no button; the server neither looks for the project's release nor installs it (`LIGHTKEEPER_UPDATES=on` turns the machinery back on, for the checks), as an official update would put the official version over this one.
- The new lines of the settings page are in French on a French phone.
- **Logos**: Stremio (Simple Icons) and Smart IPTV (a white silhouette of the app's icon, for personal use) in the catalogue and chosen by default for their tiles (`io.strem.tv`, `siptv`); CANAL+ as white lettering with no box, like Netflix and Prime Video. Sources in `docs/art/logos-perso.tsv`, the pictures made by `docs/art/logos-perso.py`.

## 1.0.9 (26 October 2026)

- **The Magic Remote's pointer slides the row.** A pointer on a tile only selects it, so a row wider than the screen could be browsed with the arrow keys alone. While the pointer shows, an arrow at each end where there is more slides the row by most of a screen: click it, or rest the pointer on it. The wheel slides it too. The arrow keys work as before. Built on LG's documented pointer events and tried on a computer, not yet with a real Magic Remote.
- **The tile selected at start**, in the settings: the last one opened, as before, or the first. The last one opened is now kept by its id, so moving tiles in the settings no longer selects another one.
- **Hide the settings gear**, in the settings, off unless you turn it on. The settings stay at the TV's address from a phone or computer, which the settings show next to the switch. With no tiles, the gear stays.
- **Updating no longer opens Lightkeeper by itself.** The start-up hook took the first power state it read as the TV switching on, so *Update* in the settings, or the setup run again, opened Lightkeeper over what was on screen. Now only a cold start, within five minutes of the TV starting, counts as one; switching on from standby works as before.
- **Power on in the log.** `/tmp/lightkeeper.log` says how the start-up hook found the TV (a cold start or not), when the TV comes on, what is in front at each look while Lightkeeper waits for it, and when Lightkeeper opens, with the seconds since the TV started.

## 1.0.8 (26 October 2026)

- **Back from the last app, on webOS 6.** An app that closes when you leave it with Back now gives way to Lightkeeper at once, with no LG's Home in between, as tried on a C1 with the web browser. Apps such as YouTube and PlxNative hand over to LG's Home instead, which shows for about a second before Lightkeeper comes back over it, as in 1.0.7: covered sooner, LG's Home took the screen back by itself.
- **As many pictures of your own as the TV has room for.** *Add a picture* adds one more each time, and each has a small copy in the settings with a cross to take it away. Lightkeeper keeps 64 MB free where it stores them and refuses a picture that would leave less; the settings show how much your pictures take and how much room is left. The picture you had before 1.0.8 becomes the first of the list, still chosen. Choosing one of the app's backgrounds no longer deletes your picture.
- **A random background each time the TV turns on**, with *Random each time the TV turns on* under the backgrounds in the settings, off until you turn it on. Tick the pictures it may use, yours included: all of them at first. Lightkeeper picks one when the TV comes on and keeps it until it goes off, and never picks the same one twice in a row. With fewer than two ticked, the Home shows the background you chose, and the settings say so. An update of the app keeps the picture of the moment.

## 1.0.7 (25 October 2026)

- **The clock lines up with the weather** in the five styles 1.0.6 added. Each typeface puts a digit's ink at its own distance from the edge: in Digital, a "1" started 98 px to the right at the medium size, so from 10:00 to 19:59 the clock sat out of line. Lightkeeper now moves the clock by the amount measured for its first digit, which also works on older TVs, whose browsers cannot measure ink. Thin, the default, stays where it was: its digits start 4 to 14 px in.
- **Pick a tile's icon.** In the settings, the icon beside a tile opens every logo and icon Lightkeeper carries, generic ones and services, with a search and *Automatic* at the top. Each logo has its service's name under it, such as Apple Music or BET+, and the search finds it by that name or by its short one. The grid works with the remote's arrows and OK in the TV's browser too. With *Logos*, your pick replaces Lightkeeper's. With *App icons*, it shows white on a dark tile the size of the icons. *Names* stays as it is, and a tile you leave alone keeps its icon.
- **Close open apps from the Home**, with *Open apps button* in the settings. It is off until you turn it on, so the Home looks as before. Turned on, a button before the gear shows how many apps are open, with no number when none are. It lists them with their icons and names, and *Close all* at the end: OK closes one, Back returns to the Home. Lightkeeper, inputs, Live TV, LG's Home and the apps LG keeps hidden stay out of the list. Tried on a C1 with webOS 6.5.3.
- **webOS 2 and 3:** the README now gives the way round the Home key that a B7 owner found ([#3](https://github.com/chiotas/lightkeeper/issues/3)). LG's Quick Access opens Lightkeeper when you hold down a number key. lginputhook did not work on that TV.

## 1.0.6 (25 October 2026)

- **Updates from the settings.** *Updates* shows the version in use and looks for a newer one in the latest release's manifest. *Update*, behind the PIN like any other change, downloads the package only from this project's GitHub releases, checks its size and sha256 against the manifest, and installs nothing when they do not match. It never installs an older or the same version. The install runs apart from the settings server, which it restarts, and takes a few minutes; the page then shows the new version, or what went wrong.
- **Web pages as tiles.** A tile can open a web page in the TV's browser, as the gear opens the settings: give it a name and an `http://` or `https://` address of up to 500 characters, under the list of tiles in the settings. With *Logos* it shows the browser's icon; Lightkeeper fetches no site icons.
- **The clock's style and size.** Six styles, each shown in the settings with the current time: Thin, as before, Classic (Cormorant Garamond), Bold (Jost 500), Monospaced (JetBrains Mono), Rounded (Nunito) and Digital (seven segments, from DSEG7). Three sizes. Thin and medium stay the default, so the Home looks the same until you choose. The typefaces come with the app, digits only, 12 KB in all.

## 1.0.5 (24 October 2026)

- **91 more streaming services have a white logo** in *Logos*, found by the app's title on the TV: arte, Hulu, Peacock, ESPN, ITVX, Channel 4, ZDF, ARD Mediathek, Joyn, RTL+, Canal+, france.tv, La7, RTVE Play, atresplayer, SkyShowtime, Viaplay, NRK TV, Yle Areena, NPO Start, Eurosport and others. 23 come from Simple Icons (CC0) and 68 from Wikimedia Commons, all public domain there; `docs/art/logos-commons.tsv` lists each file and its licence.
- **GlassHouse's dashboard** shows GlassHouse's own mark, from its repository (MIT).
- **Cleaner white icons** for apps without a logo of their own. Lightkeeper now takes the 192 px icon an app lists (`extraLargeIcon`) before the 130 px one, which LG's own apps have at 96 px. On AccuWeather's icon, made white at the size the Home draws it, that leaves 45% fewer blurred edge pixels.

## 1.0.4 (24 October 2026)

- **Over the app left open at power on.** When the TV switches on, Lightkeeper now also opens over the app that was in front when it went off, which webOS puts back. Before, a Homebrew Channel left open stayed in front. An app that comes up with the TV still stays in front, such as Netflix from its button, a cast from a phone or an alarm. An update while you use an app does not cover it. With nothing in front at first, Lightkeeper waits a few seconds for an app that is still starting: before, switching on with the Netflix button could end on Lightkeeper.
- **The background comes in whole.** The Home puts its picture on once it has loaded. Before, an uploaded picture came in at power on in strips over the app's own one (Godrevy) underneath.
- **A real gear** for the settings, Phosphor's, in place of the drawing that looked like a small sun.
- **Back from the last app on webOS 3** ([#3](https://github.com/chiotas/lightkeeper/issues/3)). Where LG has no Home app to come up, Lightkeeper watches the app in front: when an app gives way to nothing, as Back from the last one does, Lightkeeper opens, and again if Live TV comes up right after. Picking an input or Live TV with the remote does not count. Before, on webOS 3 the start-up hook asked every five seconds for app events that TV does not have. Built from a B7's logs (webOS 3.9.3), thank you Docproc; not yet tried on a webOS 3 TV. The Home key itself stays LG's there, and the Home entry 1.0.1 and 1.0.2 wrote in GlassHouse's key map, which nothing reads on webOS 3, is taken out.

## 1.0.3 (24 October 2026)

- **TV and media player icons for inputs** ([#4](https://github.com/chiotas/lightkeeper/issues/4)). Each input's device list now has a TV and a media player besides the game console and HDMI, so Live TV can go back to its TV icon and any input can use it.
- **Automatic**, first in each input's device list, lets you go back to no device picked. Live TV then shows a TV, and other inputs show what their tile's name suggests, the same in the settings as on the TV. A new input starts as Automatic: before, Live TV was given HDMI the moment it was added.

## 1.0.2 (24 October 2026)

- **Another port.** The settings can move to another port, under *Address*, or with `setup.sh --port` over SSH. When another program already has 8090, Lightkeeper takes the next free port, says so in its log and in the settings, and the gear on the TV shows the right address.
- **webOS 2 and 3** ([#1](https://github.com/chiotas/lightkeeper/issues/1), [#3](https://github.com/chiotas/lightkeeper/issues/3)). These TVs have no key filters for GlassHouse to use, so the Home key stays LG's. The settings now say so, instead of "Active within a minute" for good, and the README shows how to map a button with lginputhook.
- **Icons in the Home** ([#2](https://github.com/chiotas/lightkeeper/issues/2)). The HDMI plug, the TV, and the icons of LG's own apps (Browser, Gallery, Apps and others) showed in the settings but not on the TV: the Home's weather icons had the same name as the logos' table and replaced it.

## 1.0.1 (23 October 2026)

- **Icons only.** With logos or app icons, the names can now show under every tile, under the selected one only (smaller), or not at all. A line still marks the selected tile, and the names stay for screen readers and in the settings.
- **Up to fifty tiles**, from twelve. The Home draws the tiles' pictures as they come into view, so a long row stays quick on older TVs, and slides with the arrows. In the settings, tiles can be dragged by a handle on phones and computers; the arrows still work everywhere.
- **Updates leave nothing behind.** When the start-up hook starts again after an update, it now stops the old start's subscriptions, which stayed open for good, two more with every update.
- The gear has a name for screen readers.

## 1.0.0 (23 October 2026)

First release.
