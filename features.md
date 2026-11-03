# Islet feature roadmap

Status as of 2026-11-03 (Islet 2.1, plus the work below, committed on `main` locally and not yet pushed past `bff9d3b`). Each feature follows the same recipe, so they can ship one by one.

## Built

| Feature | Commit | Notes |
|---|---|---|
| Pomodoro + stopwatch | `e0e4b2e` | Tray Timer submenu: 25 min focus, 5 min break, 15 min long break after every 4th focus. Pill and toast show the phase name. Tray stopwatch counts up in the same slot. Logic in `pomodoro.js`. |
| Clipboard v2 | `ddd125e` | 20 items (was 5), right-click to pin, pins survive Clear and restarts (`userData/clip-pins.json`), search box. Logic in `clip-history.js`. |
| Quick notes panel | `0f09f94` | Fourth tools button, text saved to `userData/notes.txt` half a second after typing stops. Logic in `notes.js`. |
| Volume, brightness and mic HUD | `4d6757f`, `5698c7e`, `85d7ab8` | Notch toast with level bar and SVG icons when volume, mute, mic mute or laptop brightness changes. Logic in `volume-hud.js`, watcher `volume-hud.ps1`. The Windows overlay is not hidden yet. |
| Focus mode | `14bf79e` | Do Not Disturb follows Pomodoro focus phases (`focusDnd` setting). |
| Universal search (Alt+Space) | `a0dd8fb`, `2fea1b2` | Apps (Store apps too), files and folders, Wi-Fi / Bluetooth switches, Sound and Display settings, clipboard, notes. Logic in `search.js`, radios in `radios.ps1`. |
| Meeting Join button | `5132004` | Zoom / Meet / Teams / Webex links from the calendar event, shown 10 minutes ahead. |

All pass `npm test` (269 tests). Tried in the running app: HUD, search, Join (with a fake event). Not tried: real volume / brightness keys, Wi-Fi switching, Bluetooth (this PC has no radio), the tray Pomodoro flow, a real calendar feed.

## Next up

- **System stats widget** (CPU / RAM / GPU / network) via `system.ps1`: the last open Wave 1 item.
- **Hide the Windows volume overlay** so the notch HUD really replaces it.

## Quick wins (hours each)

- Caps/Num lock and keyboard-layout indicator toasts (mic and speaker mute are done)
- Weather cache across restarts, and a "lyrics unavailable" state (known gaps)
- Per-app notification mute / priority list

## Medium (about a day each)

- Calendar: multiple ICS feeds (the join button is done)
- System stats widget (CPU / RAM / GPU / network) via `system.ps1`
- Bluetooth / AirPods connect and battery popup
- Quick-launch row for apps and URLs
- Themes, accent presets and custom pill shapes
- Agent upgrades: Claude / Codex cost and token readout, reply or cancel from the notch, Gemini / Cursor sessions
- Shelf: send a file to a phone, or upload for a share link

## Bigger bets

- Plugin / widget API for user-made widgets
- Phone notification mirroring
- Tauri changeover (see `tauri-changeover.md`, post-launch)
- Live activities for calls, deliveries and flights, parsed from notifications

## Sprint plan

1. **Wave 1:** Pomodoro, Notes, Clipboard v2, Volume HUD, meeting join button (all done), system stats (open).
2. **Wave 2:** Themes, per-app notification rules, Bluetooth battery, agent cost readout.
3. **Wave 3:** Plugin API.

Merge smallest first. Conflicts concentrate in `main.js` `DEFAULTS`, `preload.js`, the `render()` slot order and `settings.html`.

## Recipe for a new feature

1. Main module `x.js` (pattern: `weather.js`, `downloads.js`). Require it in `main.js`, start it in the services block, restart it in `applyServices`.
2. Config key in three places: `DEFAULTS` (`main.js`), `CHECKS` (`config-check.js`), and the sanitiser in the `settings:save` handler. Missing one silently drops the setting.
3. `preload.js`: add `onX` / `doX`.
4. Renderer: markup in `renderer/index.html`, style in `notch.css`, logic in `notch.js`. The right-of-controls slot priority in `render()` is timer, stopwatch, download, meeting, weather. Keep the marker comments, because tests slice on them.
5. Settings row in `settings/settings.html` (`settings.js` is generic).
6. Test in `test/x.test.js` (`node:test`, `vm` for renderer code). Update the README counts.

## Verification

- `npm test` per feature.
- Manual: `electron.exe . --remote-debugging-port=9333` and take CDP screenshots.
- Real-mouse check for hover and click features (a known unverified area).
