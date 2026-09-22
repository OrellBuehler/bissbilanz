# Store release runbook

How a GitHub release fans out, and how builds reach testers/users on each store.

## What happens on `release: published`

| Target  | Workflow           | Result                                                                                                |
| ------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Web     | deploy workflow    | Deployed to bissbilanz.orellbuehler.ch                                                                |
| Android | mobile-release.yml | Signed AAB uploaded to Play's **internal** track, fully rolled out (`status: completed`, not a draft) |
| iOS     | mobile-release.yml | Build uploaded to TestFlight (processing → VALID)                                                     |

## Android promotion path (manual, by design)

The workflow only ever touches the **internal** track — everything past that
is a conscious, manual act in the Play Console. The tester track in current
use is a custom **closed track named "beta-track"**, not Play's standard
"Open testing" track (that one exists but is unused):

1. Play Console → Testing → Internal testing: the new release is live for
   internal testers immediately after CI (no draft step to publish).
2. Verify the build (install via the internal-testers link).
3. **Promote → beta-track** (the closed testing track testers are actually on)
   — reuses the same AAB, no rebuild.
4. On promotion Play asks for release notes; copy from the GitHub release.
5. Full production: **Promote → Production** from the beta-track release.

Rationale for not automating: a bad web deploy is fixable in minutes; a bad
Play promotion is user-visible for hours (review + rollout).

versionCode is `(major*10000 + minor*100 + patch) * 1000 + BUILD_NUMBER`
(`BUILD_NUMBER` is the GitHub Actions run number), computed in
`mobile/androidApp/build.gradle.kts` — see `docs/release.md` for the full
formula. Re-running a failed release job gets a fresh, strictly higher
`BUILD_NUMBER`, so there's no duplicate-code rejection.

## iOS path

1. Build lands in TestFlight automatically; internal group sees it immediately.
2. For the first public release: create a version in App Store Connect, attach
   the build, fill metadata from `store/metadata/ios/app-store.md`, and submit
   for App Review.
3. (Pre-production only, for reference: the external group "Bissbilanz
   Testers" needed **Beta App Review** (~1 day) the first time it was used,
   submitted from TestFlight → the external group; its public link is
   currently disabled.)

## Store assets still needed (manual)

- [ ] Play: 1024×500 feature graphic, 512×512 icon export, ≥2 phone
      screenshots per locale (en-US, de-DE) — source from real device or
      emulator, dark + light.
- [ ] App Store (production release): 6.7" and 6.1" screenshots per locale.
- [ ] Demo account for review (see `store/review-notes.md`).

## Console state to verify manually (not visible from the repo)

- [ ] Play: **en-US store listing does not exist yet** — as of 2026-09-22 the
      Play Console only has a de-DE listing (`defaultLanguage: de-DE`); add an
      en-US listing (title/short/full description ready in
      `store/metadata/android/en-US/`) before launch, or English-speaking
      users on non-German devices will see the German listing.
- [ ] Play: store listing images, Data Safety and Content rating filled for
      every listed locale? (Answers prepared in `store/play-data-safety.md`.)
- [ ] Play: developer account type — personal accounts created after Nov 2023
      need a 14-day / 12-tester **closed** test before production. The
      existing closed "beta-track" (not the standard "Open testing" track,
      which is unused) may already satisfy this — verify tester count and
      duration in the Console before requesting production access.
- [ ] Play: a stale `alpha` track draft (1.35.0) exists — confirm whether it
      still needs cleaning up before the first production release.
- [ ] App Store: has Beta App Review ever passed for the external group?
- [ ] App Store: App Privacy labels filled? (Prepared in
      `store/metadata/ios/app-store.md`.)
- [ ] App Store: `PrivacyInfo.xcprivacy` in `mobile/iosApp/Bissbilanz/` and
      `mobile/iosApp/BissbilanzWidgets/` currently declare an **empty**
      `NSPrivacyCollectedDataTypes` array, which does not match the data the
      app actually collects (Health & Fitness, User Content, Photos,
      identifiers) — this should be reconciled before submission or App
      Review may flag it.

(Export compliance is already handled: `ITSAppUsesNonExemptEncryption: false`
is set in `mobile/iosApp/project.yml`.)

## Play target-API deadline

Play requires targetSdk 36 for updates from **31 Aug 2026** (extension to
1 Nov available in the Console). Handled: targetSdk is 36 since PR #441.
