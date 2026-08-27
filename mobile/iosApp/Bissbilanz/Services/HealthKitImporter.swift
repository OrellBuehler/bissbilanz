import Foundation

/// Imports Apple Health weight and sleep data the app doesn't have yet
/// (read-only — never writes back to Health from here). Shared by the app's
/// foreground activation (`BissbilanzApp`) and the Weight/Sleep pages, so a
/// synced night or scale reading reaches the local store — and, through the
/// repositories' queued uploads, the backend — as soon as the app opens, not
/// only when its page is visited.
@MainActor
enum HealthKitImporter {
    /// Posted after any import created entries, so live views (e.g. the
    /// dashboard cards) can re-read the local store.
    static let didImportNotification = Notification.Name("HealthKitImporterDidImport")

    /// How far back an import looks when nothing has been imported yet.
    static let importWindowDays = -90

    /// How far back past the last import a steady-state import still reaches.
    /// HealthKit samples can arrive retroactively — a scale syncing late, a
    /// sleep session finalized after the fact — so starting exactly at the
    /// last-sync timestamp would miss them.
    static let incrementalOverlapDays = -3

    /// Start date for an import of `kind`.
    ///
    /// Ninety days of Apple Watch sleep analysis is thousands of category
    /// samples (every stage transition is its own sample), all aggregated on
    /// the main actor before anything is compared against existing entries —
    /// and `importAllIfEnabled` runs on every foreground activation.
    /// `HealthKitService` already records a last-sync timestamp on every
    /// fetch; reading it back makes the steady-state import nearly free, while
    /// a first run (or one after a long gap) still gets the full window.
    static func importStart(kind: String, now: Date = Date()) -> Date {
        let fullWindow = now.adding(days: importWindowDays)
        guard let lastSync = HealthKitService.lastSync(kind) else { return fullWindow }
        return max(fullWindow, lastSync.adding(days: incrementalOverlapDays))
    }

    static func importAllIfEnabled(
        weightRepository: WeightRepository,
        sleepRepository: SleepRepository
    ) async {
        let importedWeights = await importWeightsIfEnabled(into: weightRepository)
        let importedSleep = await importSleepIfEnabled(into: sleepRepository)
        if importedWeights || importedSleep {
            NotificationCenter.default.post(name: didImportNotification, object: nil)
        }
    }

    /// Imports weights from Apple Health, skipping days that already have an
    /// entry (latest sample per day wins). Returns whether anything was created.
    @discardableResult
    static func importWeightsIfEnabled(into repository: WeightRepository) async -> Bool {
        guard UserDefaults.standard.bool(forKey: HealthKitService.syncEnabledKey) else { return false }
        let healthKit = HealthKitService.shared
        guard healthKit.isAvailable else { return false }
        let since = importStart(kind: HealthKitService.weightReadSyncKind)
        guard let samples = try? await healthKit.fetchWeights(since: since), !samples.isEmpty else { return false }

        let existingDates = repository.entryDates()
        // Latest sample per day wins
        var latestPerDay: [String: HealthKitService.WeightSample] = [:]
        for sample in samples {
            let day = DateFormatting.isoString(from: sample.date)
            if let current = latestPerDay[day], current.date > sample.date { continue }
            latestPerDay[day] = sample
        }

        let newDays = Set(latestPerDay.keys).subtracting(existingDates)
        var imported = false
        // Suppressed write-back: these values came out of Health, and the
        // repository now pushes every save back to it. Without this each import
        // would duplicate the scale's own sample with an app-authored copy.
        await repository.withHealthImportInProgress(dates: newDays) {
            for day in newDays {
                guard let sample = latestPerDay[day] else { continue }
                let kg = (sample.weightKg * 100).rounded() / 100
                let create = WeightCreate(weightKg: kg, entryDate: day, notes: nil)
                if await (try? repository.createEntry(create)) != nil {
                    imported = true
                }
            }
        }
        return imported
    }

    /// Imports nights from Apple Health, skipping dates that already have an
    /// entry. Each night carries a quality estimated from its duration,
    /// bedtime consistency and awakenings (`HealthKitService.derivedQuality`),
    /// since Apple's Sleep Score isn't exposed through public HealthKit; the
    /// value stays editable afterwards. Returns whether anything was created.
    @discardableResult
    static func importSleepIfEnabled(into repository: SleepRepository) async -> Bool {
        guard UserDefaults.standard.bool(forKey: HealthKitService.readSleepEnabledKey) else { return false }
        let healthKit = HealthKitService.shared
        guard healthKit.isAvailable else { return false }
        let since = importStart(kind: HealthKitService.sleepReadSyncKind)
        guard let samples = try? await healthKit.fetchSleepSamples(since: since), !samples.isEmpty else { return false }

        let existingDates = repository.entryDates()
        let newNights = HealthKitService.nights(from: samples)
            .filter { !existingDates.contains($0.entryDate) }
        var imported = false
        // Suppressed write-back — see the weight import above.
        await repository.withHealthImportInProgress(dates: Set(newNights.map(\.entryDate))) {
            for night in newNights {
                let create = SleepCreate(
                    durationMinutes: night.asleepMinutes,
                    quality: night.quality,
                    entryDate: night.entryDate,
                    bedtime: DateFormatting.isoDateTimeString(from: night.bedtime),
                    wakeTime: DateFormatting.isoDateTimeString(from: night.wakeTime),
                    wakeUps: night.wakeUps,
                    notes: nil
                )
                if await (try? repository.createEntry(create)) != nil {
                    imported = true
                }
            }
        }
        return imported
    }

    /// Rewrites nights that were already imported with freshly derived values,
    /// which the normal import can't do because it skips any date that already
    /// has an entry. Needed after the quality estimate changes: without it an
    /// old score sits there for 90 days looking like the new one is wrong.
    /// Destructive by design — it overwrites hand-edited nights too, so it is
    /// only ever reached through an explicit, confirmed action. Returns how
    /// many entries actually changed.
    @discardableResult
    static func reimportSleep(into repository: SleepRepository) async -> Int {
        let healthKit = HealthKitService.shared
        guard healthKit.isAvailable else { return 0 }
        let since = Date().adding(days: importWindowDays)
        guard let samples = try? await healthKit.fetchSleepSamples(since: since), !samples.isEmpty else { return 0 }

        let existing = Dictionary(
            repository.entries().map { ($0.entryDate, $0) },
            uniquingKeysWith: { first, _ in first }
        )

        let nights = HealthKitService.nights(from: samples)
        var updated = 0
        // Suppressed write-back — every value here was just read out of Health.
        await repository.withHealthImportInProgress(dates: Set(nights.map(\.entryDate))) {
            for night in nights {
                let bedtime = DateFormatting.isoDateTimeString(from: night.bedtime)
                let wakeTime = DateFormatting.isoDateTimeString(from: night.wakeTime)
                guard let entry = existing[night.entryDate] else {
                    let create = SleepCreate(
                        durationMinutes: night.asleepMinutes,
                        quality: night.quality,
                        entryDate: night.entryDate,
                        bedtime: bedtime,
                        wakeTime: wakeTime,
                        wakeUps: night.wakeUps,
                        notes: nil
                    )
                    if await (try? repository.createEntry(create)) != nil {
                        updated += 1
                    }
                    continue
                }

                // Skip untouched nights so an unchanged re-import doesn't queue 90
                // pointless uploads.
                guard entry.durationMinutes != night.asleepMinutes
                    || entry.quality != night.quality
                    || entry.wakeUps != night.wakeUps
                else { continue }

                let update = SleepUpdate(
                    durationMinutes: night.asleepMinutes,
                    quality: night.quality,
                    bedtime: bedtime,
                    wakeTime: wakeTime,
                    wakeUps: night.wakeUps
                )
                if await (try? repository.updateEntry(id: entry.id, update)) != nil {
                    updated += 1
                }
            }
        }
        if updated > 0 {
            NotificationCenter.default.post(name: didImportNotification, object: nil)
        }
        return updated
    }
}
