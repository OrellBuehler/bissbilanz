# Release process

Cutting a release publishes a Docker image (deployed to production automatically) and,
in the same run, kicks off the Android and iOS store submissions. There is no dry-run —
publishing the GitHub release is the trigger for all three.

## Pre-flight

Before tagging, confirm `main` is actually green:

```bash
gh run list --branch main --limit 10
```

Look for: Quality, Security Scans, CodeQL, CodeQL (Mobile), CodeQL (Swift). CodeQL (Swift)
is flaky infra (see the project notes) — a red run there is not a release blocker by
itself, but check it isn't hiding a real Swift compile failure.

Then locally, from a clean `main`:

```bash
bun install --frozen-lockfile
bun run check                 # svelte-check + prettier, must end "0 ERRORS"
bun run test                  # unit tests
bun run test:integration-db   # Testcontainers, needs Docker
bun run security              # Semgrep + bun audit + Trivy — fix CRITICAL/HIGH
bun run api:check             # fails if the OpenAPI spec/clients are stale
```

```bash
cd mobile
./gradlew :shared:ktlintCheck :androidApp:ktlintCheck
./gradlew androidApp:testDebugUnitTest :shared:testDebugUnitTest
```

iOS unit tests run in CI (`mobile-ios.yml`) and are blocking there; there is no practical
way to run the full suite outside macOS CI.

### On-device QA

CI does not exercise these paths end-to-end — check the ones touched by the release on a
real device before or shortly after shipping:

- **iOS fasting Live Activity** — Dynamic Island / lock screen countdown, ~8h refresh cap
- **AI task background upload** — iOS WorkManager-equivalent / Android WorkManager, blind
  spots around large photo uploads and retry
- **Label editors** (Android + iOS food label pickers) — no on-device QA since merge
- **Widgets** (iOS home screen + Apple Watch, Android Glance) — App Group / staging paths
- **Wear OS app** — health sync, complications

If a release doesn't touch these areas, skip the ones that are clearly unaffected — but
default to checking rather than assuming.

## Tagging and versioning

The git tag is the single source of truth for the version everywhere:

- **`package.json` `version` stays `0.0.1`** — it is not read anywhere at build or deploy
  time. Do not bump it.
- **Docker image**: `docker.yml`'s build job passes `APP_VERSION=${{ github.ref_name }}`
  as a build arg, baked into the client bundle (`VITE_APP_VERSION`) and the runtime
  container (`APP_VERSION` env, read by `GET /api/health`).
- **Android `versionName`** = the tag with a leading `v` stripped (`v1.44.0` → `1.44.0`).
  **`versionCode`** = `(major*10000 + minor*100 + patch) * 1000 + BUILD_NUMBER`, where
  `BUILD_NUMBER` is `github.run_number` — folded in so a re-dispatched build for the same
  tag still gets a strictly increasing `versionCode` (Play rejects a repeat). See
  `mobile/androidApp/build.gradle.kts`.
- **iOS `MARKETING_VERSION`** = the tag with a leading `v` stripped.
  **`CURRENT_PROJECT_VERSION`** (build number) = `github.run_number`, same rationale as
  Android. See `.github/workflows/mobile-release.yml` (the `version` step in each job) and
  `mobile/iosApp/project.yml`.

Tag format is `vX.Y.Z` (semver, no pre-release suffix — a suffix makes
`docker/metadata-action` skip the `latest` tag on the image, which the deployed compose
service tracks).

## Cutting the release

```bash
gh release create v1.45.0 \
  --target main \
  --title v1.45.0 \
  --notes "..."
```

`--target` takes a branch, not a commit SHA — pass `main` (or the release branch), not a
short hash. Publishing the release is what fires both `docker.yml` and
`mobile-release.yml` (both listen for `release: [published]`); creating a draft does not.

## What happens after publish

- **`docker.yml`**: builds the image tagged with the exact version, the `major.minor`
  prefix, the commit sha, and (via `docker/metadata-action`'s default `latest=auto`
  flavor) `:latest`; pushes all tags to GHCR; then SSHes to the server over a WireGuard
  tunnel (routed through the home network so the Infomaniak firewall sees the
  whitelisted home IP) and runs the restricted `deploy bissbilanz` command, which does
  `docker compose pull bissbilanz && docker compose up -d bissbilanz` on the server. A
  "Verify production deployment" step then polls `https://bissbilanz.orellbuehler.ch/api/health`
  directly from the runner (no tunnel needed — it's the public site) for up to 3 minutes,
  failing the job if the reported `version` never matches the release tag.
- **`mobile-release.yml`**: builds and signs the Android AAB and uploads it to Play
  (internal track by default), and archives/exports/uploads the iOS IPA to TestFlight, in
  parallel.
- Even without any of this, `docker-server`'s `reconcile.sh` timer polls GHCR for a new
  `:latest` every two minutes and would converge on its own — the SSH deploy step just
  makes it immediate.

## Reading a failed mobile-release run

- **Android upload rejected citing the "Actions on Google" terms of service** — this is a
  Play Console policy gate, not a code problem; it has to be accepted in the console
  (Play Console → Setup → App content, or wherever Google currently surfaces it) before
  any upload succeeds. Re-dispatch once accepted.
- **iOS "Export IPA" fails with `doesn't include the <entitlement> entitlement`** — a
  capability was added to the App ID (Sign In with Apple, iCloud, App Groups, ...) since
  the provisioning profiles in secrets were generated, invalidating them. Regenerate:

  ```bash
  ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_PRIVATE_KEY_PATH=... \
    node scripts/ios/refresh-provisioning-profiles.mjs --apply
  ```

  The job's first step diffs each profile against its target's entitlements, so this
  surfaces in about a minute rather than after the ~25 minute archive.

- **Transient iOS Archive failure** ("data couldn't be read", single-target flake) — just
  re-dispatch: `gh workflow run mobile-release.yml -f platforms=ios`. `platforms` also
  accepts `android` to retry just that side. A re-dispatch reuses the same tag's version
  string but gets a fresh `BUILD_NUMBER` (`github.run_number`), so it never collides with
  the failed attempt.
- **iOS release certificate cap** — signing fails outright once too many distribution
  certs exist. Revoke old ones with `scripts/ios/revoke-ci-certs.mjs` (a human has to run
  it; it touches an Apple credential the CI classifier blocks).

## Rollback

The deployed `bissbilanz` service always runs whatever `ghcr.io/orellbuehler/bissbilanz:latest`
currently points to — `docker-compose.yaml` on the server is not pinned to a release tag,
and re-running the release workflow doesn't help because `docker/metadata-action` always
repoints `:latest` at the _newest_ build, never an older one.

To roll back, retag the last known-good image as `:latest` and push it, then trigger the
same restricted deploy command (from the home network directly, or from anywhere via the
`docker.yml` WireGuard path):

```bash
docker pull ghcr.io/orellbuehler/bissbilanz:v1.44.0        # the previous good tag
docker tag ghcr.io/orellbuehler/bissbilanz:v1.44.0 ghcr.io/orellbuehler/bissbilanz:latest
docker push ghcr.io/orellbuehler/bissbilanz:latest
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" 'deploy bissbilanz'
```

The SSH step needs a source IP the Infomaniak firewall allows (home network, or the CI
WireGuard tunnel) — the restricted `deploy` command only accepts `deploy <service>`, so
there's no way to run this over an ad-hoc GitHub Actions job without adding one. Even
without the manual SSH step, `docker-server`'s `reconcile.sh` timer will pick up the
repointed `:latest` on its own within two minutes.

There is no database rollback story here — migrations are forward-only. A release whose
migration needs reverting requires a hand-written down-migration, not this procedure.

## Post-release checklist

- Watch Sentry for new issues tagged with the release version (`bissbilanz` project,
  `de.sentry.io` org `orells-organization`) for the first hour or so.
- Check TestFlight feedback and crash reports once the iOS build clears review.
- Check Play Console vitals (crash rate, ANR rate) once the Android rollout starts
  serving traffic.
- Confirm the "Verify production deployment" step in `docker.yml` actually went green —
  a silent SSH failure with no smoke-check would otherwise ship a build that never
  deployed.
