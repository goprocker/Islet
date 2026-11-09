# Islet: notes for Claude

Islet is a Dynamic-Island-style notch for Windows 10/11, built with Electron. The folder is still called `notch`. Repo: https://github.com/goprocker/Islet (branch `main`). Website: https://islet.loopfound.in (from `landing/`, deployed by Netlify). The full session history is in `SESSION_HANDOFF.md` (gitignored); read its section 0 first.

- Run: `npm start`. Test: `npm test` (`node --test test/*.test.js`, 323 passing on 2026-11-07, 328 with the uncommitted shape.js; current version 2.3.4).
- Commits: Conventional Commit subject plus a specific body; push straight to `main`, with no PR. Another session (co-author "Jarvis") also pushes to `main`, so `git fetch` before starting.
- Line endings: most files are CRLF. Scripted edits must keep `\r\n`, or the replacements silently miss.
- Installer: per machine (admin). `build/installer.nsh` adds/removes the "Islet Phone drop" firewall rule (private profile, program-based).
- Releasing: bump `package.json`, commit, then push a `vX` tag. `.github/workflows/release.yml` builds, signs through SignPath once `SIGNPATH_API_TOKEN` and `SIGNPATH_ORGANIZATION_ID` are set (`build/rehash.js` then redoes the hashes), and publishes the `.exe`, `.blockmap` and `latest.yml` (auto-update needs all three). Then update the version in `landing/downloads.html`, every `href="/Islet-Setup-…"` in `landing/*.html`, and both redirects in `landing/netlify.toml` (the site proxies the installer so buttons download directly).
- Packaging: App modules, `.ps1` and `.cs` files live in `src/` (`package.json` ships `src/**`; `main` is `src/main.js`). `scripts/check-build-files.js` fails CI if one is left at the root. `hooks/` stays at the root because installed Claude Code hooks point at its path.
- Ask before launching a separate Electron window for screenshots: the user rejected that several times. Instead, take them from the running app over its debug port (see below).

## Where things are

- **Dock and tools** (`renderer/index.html` `#dock`, `renderer/notch.js` `showPanel(id, toggle)` and `OPENED[panelId]`): Home, Phone drop (`src/phone-drop.js`), Links (`src/links.js`), World clock, Clipboard, Notes, Timer, Shelf, Weather (`src/weather.js` `forecast()`), Units (`renderer/units.js`), System (IPC `sysStats`), AI coding, and `+` for Settings. In the tall view, `.notch.dash .panel` is `position: fixed; inset: 0 0 56px`.
- **Pet** (`renderer/pet.js`): `pick()` chooses the mood in this order: sick, alert, ask, plant, work, code, dance, sleep, idle. It talks in the closed pill through `petSay()` in `notch.js` (`#pillSay`, class `.talking`). The plant count lives in `localStorage.petPlant`.
- **Clawd:** the user's own pet is `Pets/spritesheet.webp`, installed locally as `%APPDATA%\Islet\pets\clawd` with `customPet: "clawd"`. `Pets/` stays untracked: it's Anthropic's mascot, no license.
- **Custom pets** (`src/pet-pack.js`): Codex Pets packs (pet.json plus a 192x208-frame sheet, 1536x1872 for v1 or 1536x2288 for v2), stored in `userData/pets/<id>/`, chosen with `config.customPet`, and sent to the notch in the theme as `petPack`. `Pet.paint(els, mood, pack)` and `Pet.tick()` play them at 8 fps; the mood-to-row mapping is `MOOD_ROW`. Never ship pets from codex-pets.net: they have no license, and many are real people.
- **Guide:** `docs/guide/guide.html` is the source of `Islet-Guide.pdf`. Print it with `node_modules\electron\dist\electron.exe docs\guide\gprint.js`, which writes `docs/guide/out.pdf` and reports free space per page (negative means overflow); copy the result to `Islet-Guide.pdf`. Screenshots are in `docs/tools/`.
- **Screenshots from the real app:** start Islet with `electron.exe . --remote-debugging-port=9333`, run `node docs/guide/liveshot.js docs/tools`, then restart Islet normally.
- **Website:** every page uses `landing/chrome.css` for its top bar and footer (`.top` / `.foot` / `.sbar`; not `.bar`, which the home page already uses). Every deployed file must be listed in the `cp` list in `landing/netlify.toml`.

## Open tasks (asked by the user)

1. Website screenshots: replace the mock-ups in `landing/features.html` and refresh `landing/shots/` and `open.png` with `docs/tools/*.png`.
2. SmartScreen: only code signing fixes it. The SignPath Foundation rejected the application on 2026-11-04 (not enough public traction: stars, forks, articles, discussions); they invite reapplying once the project has more visibility, or using a paid SignPath subscription. The site now says the installer is unsigned. The signing steps in `release.yml` stay dormant until `SIGNPATH_API_TOKEN` and `SIGNPATH_ORGANIZATION_ID` are set. The user will try another route; if it is a different signer, update `release.yml`, `landing/downloads.html` and `landing/privacy.html`. Never try to get around SmartScreen.
3. Optional: retake the guide screenshots after the user sets their name and plays music. The current Home screenshot says "Still up, Gopin" and its sliders show 0. The guide still says 2.2.0.
