# Tauri changeover plan

**Status:** not started. Islet launches on Electron on Nov 3, 2026. This plan starts only after launch, and only if the go/no-go check below passes.

## Why consider it

- Lower RAM use, because Tauri doesn't ship its own Chromium and Node.js.
- A much smaller installer. The v2.0.0 installer is about 94 MB; Tauri could plausibly reach 10-20 MB.
- Possibly faster startup.

UI and animation speed probably won't change much, because WebView2 is also Chromium-based. The PowerShell helpers would use the same RAM as they do now. All the Tauri figures here are estimates until step 2 measures them.

## Go/no-go check

### 1. Measure Electron

Record these on the release build, with Spotify playing and the notch idle, then open:

- RAM across all Electron processes
- RAM across the PowerShell helpers
- CPU use
- Time from launch to the notch appearing
- Installer size

### 2. Build a small Tauri test

Build only the notch window from the existing `renderer/` files and take the same measurements. Include its WebView2 processes in the RAM total.

The test must also prove these work on Windows 10 1903+ and Windows 11:

- Transparent, frameless window with no taskbar entry
- Always on top, including at the level Electron's `screen-saver` setting gives
- Click-through outside the notch, with hover still detected
- Tray menu and the `Ctrl+Alt+N` and `Ctrl+Alt+M` hotkeys
- File drag and drop onto the notch and out of the shelf, including the file's icon during the drag

### 3. Decide

Switch only if all of these are true:

- Total RAM, including helpers, drops by at least 40%. Adjust this target before measuring if needed, not after.
- Every window behaviour above works.
- User feedback or the numbers show that size or RAM is a real problem.

Otherwise stay on Electron and keep the test build for reference.

## Migration steps

Keep this work on a `tauri` branch. Electron stays the shipping version until step 7 passes.

1. **Project setup:** add `src-tauri/` and load `renderer/` and `settings/` unchanged where possible.
2. **Bridges:** keep the `window.bridge` and `window.settings` APIs the same and reimplement `preload.js` and `settings/preload.js` on Tauri's `invoke` and events, so `notch.js` and `settings.js` barely change.
3. **Window and tray:** port these from `main.js`:
   - Window placement, click-through and fullscreen hiding
   - Tray, hotkeys, single instance and auto-start
   - Clipboard history
   - Power and lock-screen events (`powerMonitor`)
   - File icons and drag-out (`getFileIcon`, `startDrag`), also used by `icons.js`
4. **Helpers:** start `media.ps1`, `system.ps1` and `spotify-audio.ps1` from Rust, keeping the current JSON and stdin formats.
5. **Node modules:** port these to Rust one at a time, moving their tests with them:
   - Config and validation: `config-check.js`
   - Network: `weather.js`, `lyrics.js`, `calendar.js`, `spotify-web.js`
   - Files: `downloads.js`, `shelf-file.js`, `icons.js`
   - Notifications: `notifications.js`, replacing `node:sqlite` with a Rust SQLite library
   - Agent hooks: `claude-bridge.js`, keeping `127.0.0.1` only, the hook authentication and the locked-down secret file
6. **Packaging:** build an installer and handle the WebView2 runtime for machines that don't have it. Sign it if a certificate is available.
7. **Testing:** port the current test suite so it covers the same behaviour, then manually check every feature in the README against the Electron build.

## Moving existing users

- Islet doesn't update itself, so users must install the new version by hand. Announce this in the release notes.
- Keep user data working: read the existing `%APPDATA%\islet\` files, or migrate them on first run.
- Check how the new installer treats the old Electron install, and don't leave two copies running or both set to start with Windows.
- Reinstall the Claude Code and Codex hooks so they point at the new app. Only Islet's own handlers may be changed.
- The hook scripts in `hooks/` run with `node` today, so users still need Node.js on PATH unless the hooks are also rewritten. Decide this during step 5.
- Remove the old auto-start entry.

## Risks

| Risk | Plan |
|---|---|
| WebView2 behaves differently from Electron's Chromium, especially transparency and click-through | Prove it in the test build before any migration |
| The hook authentication security fixes regress in the rewrite | Port their tests first and review this code separately |
| Notifications break, since they read a Windows database directly | Test with real toasts on Windows 10 and 11 |
| Keeping Node as a sidecar process cancels the RAM savings | Port to Rust and avoid a Node sidecar |
| The team has to maintain Rust | Confirm someone can own it before deciding to switch |

## Rollback

Keep the last Electron release available on GitHub and keep its code tagged. If a serious problem appears after the switch, point users back to that release until it's fixed.

## Rough effort

These are estimates, to revisit after the test build:

- Measurement and test build: 2-4 days
- Full migration and testing: 3-6 weeks

## Not part of this plan

Code signing is separate and shouldn't wait for Tauri. Tauri won't remove the SmartScreen warning, but a certificate can help.
