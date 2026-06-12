import Foundation
import HealthKit

@MainActor
@Observable
final class HealthKitService {
    static let shared = HealthKitService()

    /// Health integration on/off (read + import).
    static let syncEnabledKey = "healthkit_sync_enabled"
    /// Opt-in write-back of app-logged weights to Health. Off by default —
    /// users whose scale already syncs to Health would get duplicates.
    static let writeWeightEnabledKey = "healthkit_write_weight_enabled"
    /// Opt-in import of Apple Health sleep into the app (Watch users). Off by
    /// default and independent of the weight integration above.
    static let readSleepEnabledKey = "healthkit_read_sleep_enabled"
    /// Opt-in write-back of app-logged sleep to Health (manual-entry users).
    /// Off by default — users whose Watch already records sleep would get
    /// duplicates.
    static let writeSleepEnabledKey = "healthkit_write_sleep_enabled"

    private let healthStore = HKHealthStore()
    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    var isAuthorized = false

    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(weight)
        }
        return types
    }()

    /// Weight only — nutrition types are authorized per type via
    /// `requestNutritionWriteAuthorization` so permissions stay lazy.
    private let writeTypes: Set<HKSampleType> = {
        var types = Set<HKSampleType>()
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(weight)
        }
        return types
    }()

    /// Read-only authorization — enough to import weights from Health.
    /// Write access is requested separately so users whose scale already
    /// syncs to Health never grant (or get asked to keep) write permission.
    func requestReadAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
            return true
        } catch {
            return false
        }
    }

    func requestWriteAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await healthStore.requestAuthorization(toShare: writeTypes, read: readTypes)
            isAuthorized = true
            return true
        } catch {
            return false
        }
    }

    // MARK: - Sleep authorization

    /// Sleep permissions are requested per direction and separately from the
    /// weight/nutrition types: each toggle is independently optional and only
    /// the direction the user opted into is ever requested.
    func requestSleepReadAuthorization() async -> Bool {
        guard isAvailable, let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            return false
        }
        do {
            try await healthStore.requestAuthorization(toShare: [], read: [sleep])
            return true
        } catch {
            return false
        }
    }

    func requestSleepWriteAuthorization() async -> Bool {
        guard isAvailable, let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            return false
        }
        do {
            try await healthStore.requestAuthorization(toShare: [sleep], read: [])
            return true
        } catch {
            return false
        }
    }

    func saveWeight(_ weightKg: Double, date: Date) async throws {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return }
        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: weightKg)
        let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
        try await healthStore.save(sample)
        Self.markSynced(Self.weightWriteSyncKind)
    }

    // MARK: - Nutrition

    /// Requests share access for the given nutrient types only — permissions
    /// stay lazy: nothing is asked for until the user enables a type.
    func requestNutritionWriteAuthorization(_ nutrients: [HealthNutrient]) async -> Bool {
        guard isAvailable else { return false }
        var types = Set<HKSampleType>()
        for nutrient in nutrients {
            if let type = nutrient.quantityType {
                types.insert(type)
            }
        }
        guard !types.isEmpty else { return false }
        do {
            try await healthStore.requestAuthorization(toShare: types, read: [])
            return true
        } catch {
            return false
        }
    }

    /// Replaces the app's dietary samples for one day with fresh daily totals
    /// for every enabled nutrient type. Delete-then-rewrite keeps Health
    /// consistent through edits, deletes and copies without tracking sample
    /// ids. Failures stay silent, matching the weight and sleep write-backs.
    func syncNutrition(date: String, entries: [Entry], foods: [String: Food]) async {
        guard isAvailable else { return }
        let enabled = HealthNutrient.all.filter(\.isEnabled)
        guard !enabled.isEmpty, let day = DateFormatting.date(from: date) else { return }

        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: day)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return }
        // Daily totals carry no meal times — noon is a neutral anchor.
        let sampleDate = dayStart.addingTimeInterval(12 * 60 * 60)

        let totals = Self.nutrientTotals(entries: entries, foods: foods, nutrients: enabled)
        let dayPredicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: .strictStartDate)

        var samples: [HKQuantitySample] = []
        var syncedKeys: [String] = []
        for nutrient in enabled {
            guard let type = nutrient.quantityType else { continue }
            // Clear the app's own samples first (other apps' data can't be
            // deleted anyway) so re-syncs replace instead of accumulate.
            _ = try? await healthStore.deleteObjects(of: type, predicate: dayPredicate)
            guard let value = totals[nutrient.key], value > 0 else { continue }
            samples.append(HKQuantitySample(
                type: type,
                quantity: HKQuantity(unit: nutrient.unit.hkUnit, doubleValue: value),
                start: sampleDate,
                end: sampleDate
            ))
            syncedKeys.append(nutrient.key)
        }

        guard !samples.isEmpty else { return }
        do {
            try await healthStore.save(samples)
            for key in syncedKeys {
                Self.markSynced(Self.nutrientWriteSyncKind(key))
            }
        } catch {
            // Permission denied or Health unavailable — silent by design.
        }
    }

    /// Day totals per nutrient key. Food-backed entries use the food's full
    /// nutrient data; recipe and quick entries only carry resolved macros and
    /// contribute nothing beyond the five core macros.
    nonisolated static func nutrientTotals(
        entries: [Entry],
        foods: [String: Food],
        nutrients: [HealthNutrient]
    ) -> [String: Double] {
        let requestedKeys = Set(nutrients.map(\.key))
        var totals: [String: Double] = [:]
        for entry in entries {
            if let foodId = entry.foodId, let food = foods[foodId] {
                for nutrient in nutrients {
                    guard let perServing = nutrient.amount(food), perServing > 0 else { continue }
                    totals[nutrient.key, default: 0] += perServing * entry.servings
                }
            } else {
                let macros = [
                    ("calories", entry.totalCalories),
                    ("protein", entry.totalProtein),
                    ("carbs", entry.totalCarbs),
                    ("fat", entry.totalFat),
                    ("fiber", entry.totalFiber),
                ]
                for (key, total) in macros where requestedKeys.contains(key) && total > 0 {
                    totals[key, default: 0] += total
                }
            }
        }
        return totals
    }

    struct WeightSample {
        let date: Date
        let weightKg: Double
    }

    /// All body-mass samples since the given date, newest first.
    /// Samples written by this app are excluded so write-back can never
    /// echo our own entries back into the app as imports.
    func fetchWeights(since startDate: Date) async throws -> [WeightSample] {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: nil, options: .strictStartDate)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let ownBundleId = Bundle.main.bundleIdentifier

        let weights: [WeightSample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let weights = (samples ?? [])
                    .compactMap { $0 as? HKQuantitySample }
                    .filter { $0.sourceRevision.source.bundleIdentifier != ownBundleId }
                    .map { WeightSample(
                        date: $0.startDate,
                        weightKg: $0.quantity.doubleValue(for: .gramUnit(with: .kilo))
                    ) }
                continuation.resume(returning: weights)
            }
            self.healthStore.execute(query)
        }
        Self.markSynced(Self.weightReadSyncKind)
        return weights
    }

    // MARK: - Sleep

    enum SleepStage {
        case inBed
        case asleep
        case awake
    }

    struct SleepSample {
        let start: Date
        let end: Date
        let stage: SleepStage
    }

    /// One aggregated night of sleep, derived from raw Health samples.
    struct SleepNight {
        /// The wake day (yyyy-MM-dd) — the app keys sleep entries by the
        /// morning the night ends on.
        let entryDate: String
        let bedtime: Date
        let wakeTime: Date
        let asleepMinutes: Int
        let wakeUps: Int
    }

    /// Writes one sleep session to Health. Only called for entries with known
    /// bed and wake times — duration-only entries have no real interval and
    /// fabricating one would pollute Health.
    func saveSleep(bedtime: Date, wakeTime: Date) async throws {
        guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis),
              bedtime < wakeTime
        else { return }
        let sample = HKCategorySample(
            type: type,
            value: HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
            start: bedtime,
            end: wakeTime
        )
        try await healthStore.save(sample)
        Self.markSynced(Self.sleepWriteSyncKind)
    }

    /// All sleep-analysis samples overlapping the window, oldest first.
    /// Samples written by this app are excluded so write-back can never echo
    /// our own entries back into the app as imports.
    func fetchSleepSamples(since startDate: Date) async throws -> [SleepSample] {
        guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else { return [] }
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: nil)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let ownBundleId = Bundle.main.bundleIdentifier

        let sleepSamples: [SleepSample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let mapped = (samples ?? [])
                    .compactMap { $0 as? HKCategorySample }
                    .filter { $0.sourceRevision.source.bundleIdentifier != ownBundleId }
                    .compactMap { sample -> SleepSample? in
                        guard let stage = Self.stage(for: sample.value) else { return nil }
                        return SleepSample(start: sample.startDate, end: sample.endDate, stage: stage)
                    }
                continuation.resume(returning: mapped)
            }
            self.healthStore.execute(query)
        }
        Self.markSynced(Self.sleepReadSyncKind)
        return sleepSamples
    }

    private nonisolated static func stage(for rawValue: Int) -> SleepStage? {
        guard let value = HKCategoryValueSleepAnalysis(rawValue: rawValue) else { return nil }
        switch value {
        case .inBed:
            return .inBed
        case .awake:
            return .awake
        case .asleepUnspecified, .asleepCore, .asleepDeep, .asleepREM:
            return .asleep
        @unknown default:
            return nil
        }
    }

    /// Sleep sessions are split where samples are more than this far apart —
    /// far larger than the gaps inside a recorded night, far smaller than the
    /// distance between a night and an afternoon nap.
    nonisolated static let sessionGapSeconds: TimeInterval = 2 * 60 * 60

    /// Sessions shorter than this are ignored — micro-naps aren't a night.
    nonisolated static let minimumNightMinutes = 30

    /// Groups raw samples into per-night aggregates: samples closer than
    /// `sessionGapSeconds` form a session; each session is keyed by the day it
    /// ends on (the wake day) and the longest session per day wins (the main
    /// night beats naps). Overlapping samples (iPhone + Watch both recording)
    /// are unioned so duration is never double-counted; stage samples count as
    /// asleep while in-bed-only recordings fall back to the in-bed time.
    nonisolated static func nights(from samples: [SleepSample]) -> [SleepNight] {
        let sorted = samples.sorted { $0.start < $1.start }
        var sessions: [[SleepSample]] = []
        for sample in sorted {
            if var current = sessions.last,
               let sessionEnd = current.map(\.end).max(),
               sample.start.timeIntervalSince(sessionEnd) <= sessionGapSeconds
            {
                current.append(sample)
                sessions[sessions.count - 1] = current
            } else {
                sessions.append([sample])
            }
        }

        var bestPerDay: [String: SleepNight] = [:]
        for session in sessions {
            guard let bedtime = session.map(\.start).min(),
                  let wakeTime = session.map(\.end).max()
            else { continue }

            let asleep = mergedIntervals(session.filter { $0.stage == .asleep })
            let inBed = mergedIntervals(session.filter { $0.stage == .inBed })
            let awake = mergedIntervals(session.filter { $0.stage == .awake })
            let asleepMinutes = asleep.isEmpty ? totalMinutes(of: inBed) : totalMinutes(of: asleep)
            guard asleepMinutes >= minimumNightMinutes else { continue }

            let night = SleepNight(
                entryDate: DateFormatting.isoString(from: wakeTime),
                bedtime: bedtime,
                wakeTime: wakeTime,
                asleepMinutes: min(asleepMinutes, 1440),
                wakeUps: awake.count
            )
            if let existing = bestPerDay[night.entryDate], existing.asleepMinutes >= night.asleepMinutes {
                continue
            }
            bestPerDay[night.entryDate] = night
        }
        return bestPerDay.values.sorted { $0.wakeTime < $1.wakeTime }
    }

    /// Overlapping or touching intervals merged into disjoint ones.
    private nonisolated static func mergedIntervals(_ samples: [SleepSample]) -> [(start: Date, end: Date)] {
        let sorted = samples.sorted { $0.start < $1.start }
        var merged: [(start: Date, end: Date)] = []
        for sample in sorted {
            if let last = merged.last, sample.start <= last.end {
                if sample.end > last.end {
                    merged[merged.count - 1].end = sample.end
                }
            } else {
                merged.append((sample.start, sample.end))
            }
        }
        return merged
    }

    private nonisolated static func totalMinutes(of intervals: [(start: Date, end: Date)]) -> Int {
        let seconds = intervals.reduce(0.0) { $0 + $1.end.timeIntervalSince($1.start) }
        return Int((seconds / 60).rounded())
    }

    func fetchLatestWeight() async throws -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return nil }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: nil,
                limit: 1,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: nil)
                    return
                }
                let kg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
                continuation.resume(returning: kg)
            }
            self.healthStore.execute(query)
        }
    }

    // MARK: - Last-synced timestamps

    /// Timestamp kinds — one per data type and direction, shown on the Apple
    /// Health settings page.
    static let weightReadSyncKind = "read_bodyMass"
    static let weightWriteSyncKind = "write_bodyMass"
    static let sleepReadSyncKind = "read_sleepAnalysis"
    static let sleepWriteSyncKind = "write_sleepAnalysis"

    static func nutrientWriteSyncKind(_ key: String) -> String {
        "write_\(key)"
    }

    /// When the given data type last synced successfully, or nil if it never
    /// has.
    static func lastSync(_ kind: String) -> Date? {
        let timestamp = UserDefaults.standard.double(forKey: "healthkit_last_sync_\(kind)")
        guard timestamp > 0 else { return nil }
        return Date(timeIntervalSince1970: timestamp)
    }

    static func markSynced(_ kind: String) {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "healthkit_last_sync_\(kind)")
    }

    /// True when any Health sync toggle (weight, sleep or a nutrient) is on —
    /// the app-side definition of "connected".
    static var isAnySyncEnabled: Bool {
        let defaults = UserDefaults.standard
        return defaults.bool(forKey: syncEnabledKey)
            || defaults.bool(forKey: writeWeightEnabledKey)
            || defaults.bool(forKey: readSleepEnabledKey)
            || defaults.bool(forKey: writeSleepEnabledKey)
            || HealthNutrient.anyEnabled
    }
}
