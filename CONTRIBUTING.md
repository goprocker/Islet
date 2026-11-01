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
