<div align="center">

# 🏝️ Islet

**A Dynamic-Island-style notch for Windows 11**

Music · Claude Code and Codex · notifications · battery · weather, all in one small black pill at the top of your screen.

<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge"></a>
<img alt="Windows 10 / 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=for-the-badge&logo=windows11&logoColor=white">
<img alt="Electron 37" src="https://img.shields.io/badge/Electron-37-47848f?style=for-the-badge&logo=electron&logoColor=white">
<img alt="43 tests passing" src="https://img.shields.io/badge/tests-43%20passing-34c759?style=for-the-badge">

<br><br>

<img src="docs/open.png" alt="Islet open: Codex and Claude sessions on the left, Spotify in the middle, time and battery on the right" width="820">

<br>

<table>
  <tr>
    <td align="center"><img src="docs/pill.png" alt="Closed pill with album art, Claude dot and audio wave" width="220"><br><sub><b>Pill</b></sub></td>
    <td align="center"><img src="docs/toast.png" alt="A WhatsApp message shown as a notch pop-up" width="280"><br><sub><b>Notification</b></sub></td>
    <td align="center"><img src="docs/album.png" alt="Enlarged album art over a blurred backdrop" width="340"><br><sub><b>Album view</b></sub></td>
  </tr>
</table>

[**Features**](#-features) · [**Install**](#-install) · [**Usage**](#-usage) · [**Claude Code & Codex**](#-claude-code-and-codex) · [**Settings**](#%EF%B8%8F-settings) · [**How it works**](#-how-it-works) · [**📘 Full guide (PDF)**](Islet-Guide.pdf)

</div>

---

Islet sits at the top centre of your screen. **Hover to open it, click anywhere else to close it.** When nothing is happening it shrinks to a plain black pill with one dot.

The open notch, left to right: **agent sessions** → **music** → **time and battery** → **tools**.

## ✨ What's new

- 🌌 **Black hole charger animation:** an Interstellar-style black hole plays when the charger goes in (*CHARGING INITIATED*) or out (*RUNNING ON BATTERY*). You can pick Cinematic or Subtle, or turn it off.
- 💬 **Full notification text:** pop-ups are wider, grow up to about 7 lines and stay on screen longer for long messages.
- 🔒 **Lock screen:** Windows' own banners come back while the PC is locked, so you still see messages there.
- 🛡️ **Sturdier:** Alt+F4 no longer kills the notch, and a broken `config.json` is never overwritten. This round also fixed calendar exceptions, shelf duplicates, banner recovery, UTF-8 output and more.

## 🚀 Features

<table>
<tr>
<td width="50%" valign="top">

### 🎵 Music
- Spotify, or any player using Windows media controls (YouTube in a browser, VLC…)
- Album art, title and artist; the accent colour is taken from the art
- Prev / play-pause / next, click to seek, scroll to change Spotify's own volume
- Like the song (`Alt+Shift+B`)
- A live wave drawn from **Spotify's audio only** (24 FFT bands)
- Timed lyrics from lrclib.net and an enlarged album view

</td>
<td width="50%" valign="top">

### 🤖 Claude Code and Codex
- Both agents in one column, newest first
- Each session shows **working**, **needs you** or **done**
- The last 3 actions: your prompt, tools used, edited files
- **Allow / Deny** Claude Code permission requests right in the notch
- Click a project to open its folder

</td>
</tr>
<tr>
<td valign="top">

### 🔔 Notifications
- Every Windows toast becomes a notch pop-up with the **real app logo**
- Full message text, sized to fit
- Windows' bottom-right banners are off while Islet runs and restored on quit
- Do Not Disturb, with an optional daily schedule

</td>
<td valign="top">

### 🔋 Battery and system
- 🌌 Black hole animation when the charger goes in or out
- A green edge glow and a light streak along the bottom while charging
- A one-time low-battery warning
- Mic, camera and screen-capture dots
- Hides behind fullscreen apps

</td>
</tr>
<tr>
<td valign="top">

### 🌤️ Info
- Weather by city (Open-Meteo, no API key)
- The next event from a private calendar (ICS) link
- Browser download progress
- A timer, started from the tray

</td>
<td valign="top">

### 🧰 Tools
- Clipboard history: the last 5 texts, kept in memory only
- File shelf: drop files in, drag them out
- `Ctrl+Alt+N` cycles pill / open / hidden
- `Ctrl+Alt+M` moves Islet to the next monitor

</td>
</tr>
</table>

## 📦 Install

**You need:** Windows 10 1903+ or 11 · Node.js 20+ · Git · Windows PowerShell 5.1 (built into Windows)

```powershell
git clone https://github.com/goprocker/Islet.git
cd Islet
npm install
```

| | Run from the folder | Install as an app |
|---|---|---|
| **Command** | `npm start` | `npm run dist`, then run `dist\Islet Setup <version>.exe` |
| **Best for** | Development: code changes apply on restart | Daily use: Start menu entry, installs to `%LOCALAPPDATA%\Programs\islet` |
| **Updating** | Restart it | Rebuild and run the new setup |

> [!TIP]
> Run `npm run dist` from **PowerShell**. It fails under Git Bash.

> [!NOTE]
> The installer is unsigned. If **Smart App Control** blocks it, use `npm start` instead. Only one copy of Islet runs at a time, so quit the `npm start` copy before installing.

On first run, Islet adds itself to **Start with Windows**. Right-click the tray icon for the menu.

## 🖱️ Usage

| Action | How |
|---|---|
| Open / close | Hover the notch / move away or click elsewhere |
| Cycle pill → open → hidden | `Ctrl+Alt+N` |
| Next monitor | `Ctrl+Alt+M`, or tray → **Show on screen** |
| Volume / seek | Scroll over the music side / click the progress bar |
| Album view | Click the album art |
| Like | Heart button, or `Alt+Shift+B` |
| Clipboard / shelf / DND | Buttons in the tools column |
| Timer / settings | Tray → **Timer** / **Settings…** |
| Quit | Tray → **Quit** (Alt+F4 is ignored on purpose) |

## 🤖 Claude Code and Codex

Tray → **Connect to Claude Code and Codex** installs the hooks. Untick it to remove them. A backup is saved next to each file, and only Islet's own handlers are ever removed.

| Hook event | Notch shows |
|---|---|
| `UserPromptSubmit`, `PostToolUse` | 🟣 Working, plus the latest actions |
| `Notification`, `PermissionRequest` | 🟠 Needs you; Claude Code requests get **Allow / Deny** |
| `Stop`, `SessionEnd` | ✅ Done |
| `SessionStart` (Codex) | A new session chip |

<details>
<summary><b>More details</b></summary>

- **Claude Code:** hooks go into `~/.claude/settings.json` (backup: `settings.json.islet-backup`). `hooks/islet-hook.js` POSTs each event to `127.0.0.1:47321/claude`.
- **Codex:** if `~/.codex` exists, hooks are also added to `~/.codex/hooks.json` (backup: `hooks.json.islet-backup`). Codex asks you to trust new hooks, so approve Islet's once, through the prompt Codex shows or `/hooks`.
- A Claude Code permission request is held for `permissionWaitSeconds` (default 8). If you don't answer in the notch, the terminal asks as usual. Set it to `0` to never hold.
- Codex permission requests show "Needs you", but you answer them in Codex.
- With both agents running, the status line says `Claude ·` or `Codex ·`, and Codex chips have a blue dot.
- Without hooks, Islet guesses the status from the newest transcript in `~/.claude/projects`.

</details>

## ⚙️ Settings

Stored in `%APPDATA%\islet\config.json` and edited from the settings window. Hand edits are picked up within 2 s. A file that can't be read is left alone, not overwritten.

<details>
<summary><b>All 18 settings</b></summary>

| Key | Default | Meaning |
|---|---|---|
| `size` | `normal` | `compact`, `normal` or `large` |
| `accent` | `album` | `album` (colour from the art) or `#rrggbb` |
| `idleHide` | `false` | Shrink to a thin line when nothing is happening |
| `powerAnim` | `true` | Black hole animation when the charger goes in or out |
| `powerAnimStyle` | `cinematic` | `cinematic` or `subtle` |
| `hideInFullscreen` | `true` | Hide while a fullscreen app is in front |
| `notifications` | `true` | Show Windows notifications in the notch |
| `hideWindowsBanners` | `true` | Turn off Windows' banners while Islet runs (they come back on the lock screen) |
| `dnd`, `dndFrom`, `dndTo` | off | Do Not Disturb, with an optional daily `HH:MM` window |
| `permissionWaitSeconds` | `8` | How long to hold a permission request for Allow / Deny (0–24) |
| `lyrics` | `true` | Fetch lyrics from lrclib.net |
| `weatherCity` | `""` | e.g. `Chennai`; empty turns weather off |
| `weatherUnit` | `C` | `C` or `F` |
| `calendarIcsUrl` | `""` | Private iCal link |
| `downloadsFolder` | `""` | Empty means your Downloads folder |
| `clipboardHistory` | `true` | Keep the last 5 copied texts in memory |
| `displayId` | `null` | Screen to show on (set by `Ctrl+Alt+M` or the tray) |
| `spotifyClientId` | `""` | Optional Spotify Web API (Premium only) |

</details>

## 🧠 How it works

```
main.js ── window, tray, hotkeys, powerMonitor, config, IPC
 ├─ media.ps1             Windows media session → JSON every second; play/seek/next
 ├─ spotify-audio.ps1/.cs process-loopback capture of Spotify → 24 FFT bands, volume
 ├─ system.ps1            mic / camera / screen use, fullscreen detection
 ├─ notifications.js      reads wpndatabase.db (node:sqlite, read-only); toggles banners
 ├─ icons.js              real app logos (Store manifests, shortcuts, exe icons)
 ├─ claude-bridge.js      HTTP server for Claude Code + Codex hooks; installs/removes them
 ├─ calendar.js  weather.js  lyrics.js  downloads.js  spotify-web.js
 └─ preload.js ── renderer/  (index.html, notch.css, notch.js, blackhole.js)
                  settings/  (settings window)
```

<details>
<summary><b>Design notes</b></summary>

- The window is frameless, transparent and always on top. It ignores the mouse except while the pointer is over the notch.
- Notch states are CSS classes on `#notch`: `open`, `toast`, `hidden`, `quiet`, `idle`, `charging`. With reduced motion on, the animations stay still.
- The black hole is drawn with Canvas 2D (`renderer/blackhole.js`) and driven by Electron `powerMonitor` events, with no polling. It only animates while playing.
- C# runs through `Add-Type` inside PowerShell, so no unsigned exe ships, which keeps it working with Smart App Control on.
- Windows has no notification-listener API for unpackaged apps, so Islet reads the notification database read-only.
- To hide Windows' banners, Islet sets `ShowBanner = 0` under `HKCU\…\Notifications\Settings\<app id>`. The previous values are saved in `%APPDATA%\islet\banners.json` and put back on quit or at the lock screen.

</details>

### 🛠️ Develop

```powershell
npm test     # 8 test files, node --test
node_modules\electron\dist\electron.exe . --remote-debugging-port=9333   # then chrome://inspect
```

Useful page globals: `setOpen(true)`, `render()`.

## 🔐 Privacy

Everything runs on your PC. Network calls go only to lrclib.net (title and artist, when lyrics are on), Open-Meteo (the city name), your ICS link, and Spotify if you connect it. Clipboard history never touches disk, and the shelf stores file paths only. The hook server listens on `127.0.0.1` only.

## 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| Banners still bottom-right | Start Islet normally, not from a sandboxed shell, which can't write the registry. Sign out and in once if needed. |
| Banners stay off after a crash | Start Islet and quit it from the tray, or turn off the setting. |
| Codex column is empty | Approve Islet's hooks in Codex (`/hooks`). |
| `npm run dist` fails | Run it from PowerShell, not Git Bash. |
| Installer blocked | Smart App Control; use `npm start`. |
| Installed app ignores code changes | Rebuild with `npm run dist` and reinstall. |
| Second launch does nothing | Only one copy runs; the second launch opens the running copy's settings. |

## 🗑️ Uninstall

1. Tray → untick **Connect to Claude Code and Codex** and **Start with Windows**.
2. Tray → **Quit** (puts Windows banners back).
3. Installed app: **Settings → Apps → Islet → Uninstall**. From source: delete the folder.
4. Delete `%APPDATA%\islet`.

## 🤝 Contributing

Issues and pull requests are welcome. Keep changes small, use [Conventional Commits](https://www.conventionalcommits.org/), and say how you tested.

<div align="center">

---

**Islet** · Made by Gopinath · Code under [MIT](LICENSE) · Guide PDF © 2026 Gopinath, all rights reserved

</div>
