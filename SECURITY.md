# Security policy

## Supported versions

Security fixes go into the [latest release](https://github.com/goprocker/Islet/releases/latest) only. Islet doesn't update itself, so install the new version to get a fix.

## Report a vulnerability

Please don't open a public issue. [Report it privately on GitHub](https://github.com/goprocker/Islet/security/advisories/new) and include:

- what the problem is and what an attacker could do with it
- steps to reproduce it
- your Islet and Windows versions

## What's in scope

Examples include:

- the local hook server on `127.0.0.1:47321`, including the Allow / Deny flow for Claude Code permission requests
- changes Islet makes to `~/.claude/settings.json`, `~/.codex/hooks.json` or the Windows registry
- exposure of notification, clipboard, calendar or Spotify data

Problems in Electron, Claude Code, Codex or Windows themselves should go to those projects, unless Islet's use of them causes the problem.

## Windows release signing

Installers are currently unsigned: signing waits on a code-signing certificate. Once the SignPath secrets are set, the release workflow signs the installer and fails before publishing if signing fails or the certificate subject is not `SignPath Foundation`. Pinning that publisher for updates (`win.publisherName` in `package.json`) should be added only after a signed release has shipped, so users on unsigned builds can still update.

For a planned certificate rotation, update the workflow subject check (and the pinned `win.publisherName`, once added) in the same reviewed release, then verify an upgrade from the last trusted version before publishing. For an emergency rollback, remove the affected GitHub release, restore the last trusted signed artifacts and `latest.yml`, and do not weaken or remove publisher verification to make a replacement install.
