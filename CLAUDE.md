# Islet: notes for Claude

Islet is a Dynamic-Island-style notch for Windows 10/11, built with Electron. The folder is still called `notch`. Repo: https://github.com/goprocker/Islet (branch `main`). Website: https://islet.loopfound.in (from `landing/`, deployed by Netlify). The full session history is in `SESSION_HANDOFF.md` (gitignored); read its section 0 first.

- Run: `npm start`. Test: `npm test` (`node --test test/*.test.js`, 293 passing in 37 files on 2026-11-04).
- Commits: Conventional Commit subject plus a specific body; push straight to `main`, with no PR. Another session (co-author "Jarvis") also pushes to `main`, so `git fetch` before starting.
- Line endings: most files are CRLF. Scripted edits must keep `\r\n`, or the replacements silently miss.
- Installer: per machine (admin). `build/installer.nsh` adds/removes the "Islet Phone drop" firewall rule (private profile, program-based).
- Packaging: `package.json` `build.files` lists every module and `.ps1` file by name. Add new ones there, or the installer crashes.
- Ask before launching a separate Electron window for screenshots: the user rejected that several times. Instead, take them from the running app over its debug port (see below).

## Where things are

- **Dock and tools** (`renderer/index.html` `#dock`, `renderer/notch.js` `showPanel(id, toggle)` and `OPENED[panelId]`): Home, Phone drop (`phone-drop.js`), Links (`links.js`), World clock, Clipboard, Notes, Timer, Shelf, Weather (`weather.js` `forecast()`), Units (`renderer/units.js`), System (IPC `sysStats`), AI coding, and `+` for Settings. In the tall view, `.notch.dash .panel` is `position: fixed; inset: 0 0 56px`.
- **Pet** (`renderer/pet.js`): `pick()` chooses the mood in this order: sick, alert, ask, plant, work, code, dance, sleep, idle. It talks in the closed pill through `petSay()` in `notch.js` (`#pillSay`, class `.talking`). The plant count lives in `localStorage.petPlant`.
- **Custom pets** (`pet-pack.js`): Codex Pets packs (pet.json plus a 192x208-frame sheet, 1536x1872 for v1 or 1536x2288 for v2), stored in `userData/pets/<id>/`, chosen with `config.customPet`, and sent to the notch in the theme as `petPack`. `Pet.paint(els, mood, pack)` and `Pet.tick()` play them at 8 fps; the mood-to-row mapping is `MOOD_ROW`. Never ship pets from codex-pets.net: they have no license, and many are real people.
- **Guide:** `docs/guide/guide.html` is the source of `Islet-Guide.pdf`. Print it with `node_modules\electron\dist\electron.exe docs\guide\gprint.js`, which writes `docs/guide/out.pdf` and reports free space per page (negative means overflow); copy the result to `Islet-Guide.pdf`. Screenshots are in `docs/tools/`.
- **Screenshots from the real app:** start Islet with `electron.exe . --remote-debugging-port=9333`, run `node docs/guide/liveshot.js docs/tools`, then restart Islet normally.
- **Website:** every page uses `landing/chrome.css` for its top bar and footer (`.top` / `.foot` / `.sbar`; not `.bar`, which the home page already uses). Every deployed file must be listed in the `cp` list in `landing/netlify.toml`.

## Open tasks (asked by the user)

1. Website screenshots: replace the mock-ups in `landing/features.html` and refresh `landing/shots/` and `open.png` with `docs/tools/*.png`.
4. SmartScreen: only code signing fixes it (Azure Trusted Signing or a certificate). The user hasn't chosen one yet. Never try to get around SmartScreen.
6. Optional: retake the guide screenshots after the user sets their name and plays music. The current Home screenshot says "Still up, Gopin" and its sliders show 0.
