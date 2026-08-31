# Security policy

Bissbilanz is a food tracking app built by a single hobbyist developer. It holds people's food,
weight and sleep logs, so security reports are taken seriously even though this is a side project.

## Supported versions

Only the latest release is supported. The web app at `bissbilanz.orellbuehler.ch` always runs the
newest release; for the Android and iOS apps, please check that the problem still happens on the
current version from the Play Store or the App Store before reporting it.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through GitHub's private vulnerability reporting instead:

- [Open a draft security advisory](https://github.com/OrellBuehler/bissbilanz/security/advisories/new)

If you would rather not use GitHub, email <me@orellbuehler.ch> with `SECURITY` in the subject.

Please include:

- Which part is affected — web app, HTTP API, MCP server, Android app, iOS app or the watch apps
- The version or commit you tested against
- Steps to reproduce, ideally with a minimal proof of concept
- What an attacker could reach with it (whose data, and what they could read or change)

## What to expect

- An acknowledgement within a few days, usually sooner
- An assessment and a rough fix timeline once the report is confirmed
- A fix in the next release, or a faster one if the impact warrants it
- Credit in the published advisory if you want it

This is an unpaid hobby project: there is no bug bounty.

## Testing ground rules

The production instance serves real people's data, so when you look for problems:

- Use your own account, and only your own data
- Do not run load, stress or denial-of-service tests against `bissbilanz.orellbuehler.ch`
- Do not run automated scanners against the production host — run the app locally instead
  (`bun install && bun run dev`, see [CLAUDE.md](CLAUDE.md) for the setup)
- Do not access, modify or delete anyone else's account, and stop as soon as you can tell a finding
  is real

## Scope

In scope: this repository, the web app, the HTTP API, the MCP server, and the Android, iOS, Wear OS
and Apple Watch apps.

Out of scope:

- Third-party services the app talks to — Infomaniak, Google, Apple, Open Food Facts,
  Sentry. Report those to the provider.
- Scanner output with no demonstrated impact
- Missing hardening headers or best practices without a concrete attack
- Social engineering, physical attacks, and anything requiring a compromised device or a
  self-installed malicious app

## Disclosure

Coordinated disclosure, please: give the fix time to ship before publishing. The advisory is
published on GitHub once the fix is released.
