# Contributing to Islet

Issues and pull requests are welcome. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, follow the [security policy](SECURITY.md) and don't open a public issue.

## Set up

You need Windows 10 1903+ or 11, Windows PowerShell 5.1, Node.js 22 or 24, and Git.

```powershell
git clone https://github.com/goprocker/Islet.git
cd Islet
npm install
npm start
```

Code changes apply on restart. Only one copy of Islet runs at a time, so quit any installed copy first.

## Test

```powershell
npm test
```

If you change the window, tray or Windows integrations, also run the app and check the change by hand.

To build an installer, run `npm run dist` from PowerShell. It fails under Git Bash.

## Pull requests

- Keep each change small and focused on one thing.
- Use [Conventional Commits](https://www.conventionalcommits.org/), such as `fix: keep shelf entries unique`.
- Add or update tests when you change behaviour they can cover.
- Update `README.md` when you change a feature or setting.
- Say how you tested the change, and add a screenshot if it changes what's on screen.
- Don't commit personal data, such as tokens, calendar links or your `config.json`.

## Where to start

Look for issues labelled [good first issue](https://github.com/goprocker/Islet/labels/good%20first%20issue). Comment on one to claim it, and ask there if anything is unclear. Questions and ideas that aren't ready to be issues belong in [Discussions](https://github.com/goprocker/Islet/discussions).

A rough map of the code:

- `main.js` is the Electron main process: window, tray, IPC and the helpers it spawns. Small modules next to it (`weather.js`, `links.js`, `notes.js`, `pomodoro.js` and so on) each own one feature.
- `renderer/` is the notch itself. `notch.js` shows the panels, `pet.js` runs the pet, and `units.js` is the unit converter.
- `settings/` is the settings window.
- `*.ps1` scripts read Windows state such as media, system stats and radios.
- `builtin-pets/` holds the pets that ship with the app, and `pet-pack.js` loads custom ones.
- `test/` has one `*.test.js` file per area. `npm test` runs them with Node's built-in test runner.

New modules and scripts must be added to `build.files` in `package.json`, or the installer will crash.

Only add pets and artwork you made or that are licensed for redistribution.
