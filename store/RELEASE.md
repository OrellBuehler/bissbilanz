# Store release runbook

How a GitHub release fans out, and how builds reach testers/users on each store.

## What happens on `release: published`

| Target  | Workflow           | Result                                                      |
| ------- | ------------------ | ----------------------------------------------------------- |
| Web     | deploy workflow    | Deployed to bissbilanz.orellbuehler.ch                      |
| Android | mobile-release.yml | Signed AAB uploaded to Play **internal** track as **draft** |
| iOS     | mobile-release.yml | Build uploaded to TestFlight (processing → VALID)           |

## Android promotion path (manual, by design)

The workflow deliberately stops at internal/draft — promotion is a conscious act:

1. Play Console → Testing → Internal testing: the draft release appears after CI.
2. Verify the build (install via internal-testers link).
3. **Promote → Open testing** (the beta track) — reuses the same AAB, no rebuild.
4. On promotion Play asks for release notes; copy from the GitHub release.
5. Full production later: Promote → Production from the open-testing release.

Rationale for not automating: a bad web deploy is fixable in minutes; a bad
Play promotion is user-visible for hours (review + rollout). Revisit once the
beta is stable.

versionCode is `semver*1000 + run_number`, so re-running a failed release job
produces a new, strictly higher code — no more duplicate-code rejections.

## iOS path

1. Build lands in TestFlight automatically; internal group sees it immediately.
2. External group ("Bissbilanz Testers"): first build needs **Beta App Review**
   (~1 day). Submit from TestFlight → the external group.
3. For a public beta, enable the group's **public link** (currently disabled).
4. Full App Store release: create a version in App Store Connect, attach the
   build, fill metadata from `store/metadata/ios/app-store.md`, submit.

## Store assets still needed (manual)

- [ ] Play: 1024×500 feature graphic, 512×512 icon export, ≥2 phone
      screenshots per locale (en-US, de-DE) — source from real device or
      emulator, dark + light.
- [ ] App Store (full release only; TestFlight needs none): 6.7" and 6.1"
      screenshots per locale.
- [ ] Demo account for review (see `store/review-notes.md`).

## Console state to verify manually (not visible from the repo)

- [ ] Play: does a store listing draft already exist? Data Safety filled?
      Content rating done? (Answers prepared in `store/play-data-safety.md`.)
- [ ] Play: developer account type — personal accounts created after
      Nov 2023 need a 14-day / 12-tester closed test before **production**
      (open testing is unaffected).
- [ ] App Store: has Beta App Review ever passed for the external group?
- [ ] App Store: App Privacy labels filled? (Prepared in
      `store/metadata/ios/app-store.md`.)

(Export compliance is already handled: `ITSAppUsesNonExemptEncryption: false`
is set in `mobile/iosApp/project.yml`.)

## Play target-API deadline

Play requires targetSdk 36 for updates from **31 Aug 2026** (extension to
1 Nov available in the Console). Handled: targetSdk is 36 since PR #441.
