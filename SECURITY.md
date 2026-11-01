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
