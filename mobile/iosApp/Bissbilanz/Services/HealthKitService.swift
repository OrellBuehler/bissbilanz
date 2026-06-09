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

    private let healthStore = HKHealthStore()
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }
    var isAuthorized = false

    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(weight)
        }
        return types
    }()

    private let writeTypes: Set<HKSampleType> = {
        var types = Set<HKSampleType>()
        if let weight = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(weight)
        }
        if let energy = HKQuantityType.quantityType(forIdentifier: .dietaryEnergyConsumed) {
            types.insert(energy)
        }
        if let protein = HKQuantityType.quantityType(forIdentifier: .dietaryProtein) {
            types.insert(protein)
        }
        if let carbs = HKQuantityType.quantityType(forIdentifier: .dietaryCarbohydrates) {
            types.insert(carbs)
        }
        if let fat = HKQuantityType.quantityType(forIdentifier: .dietaryFatTotal) {
            types.insert(fat)
        }
        if let fiber = HKQuantityType.quantityType(forIdentifier: .dietaryFiber) {
            types.insert(fiber)
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

    func saveWeight(_ weightKg: Double, date: Date) async throws {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return }
        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: weightKg)
        let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
        try await healthStore.save(sample)
    }

    func saveNutrition(calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double, date: Date) async throws {
        var samples: [HKQuantitySample] = []

        let pairs: [(HKQuantityTypeIdentifier, Double, HKUnit)] = [
            (.dietaryEnergyConsumed, calories, .kilocalorie()),
            (.dietaryProtein, protein, .gram()),
            (.dietaryCarbohydrates, carbs, .gram()),
            (.dietaryFatTotal, fat, .gram()),
            (.dietaryFiber, fiber, .gram()),
        ]

        for (identifier, value, unit) in pairs where value > 0 {
            guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { continue }
            let quantity = HKQuantity(unit: unit, doubleValue: value)
            let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
            samples.append(sample)
        }

        guard !samples.isEmpty else { return }
        try await healthStore.save(samples)
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

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let weights = (samples ?? [])
                    .compactMap { $0 as? HKQuantitySample }
                    .filter { $0.sourceRevision.source.bundleIdentifier != ownBundleId }
                    .map { WeightSample(date: $0.startDate, weightKg: $0.quantity.doubleValue(for: .gramUnit(with: .kilo))) }
                continuation.resume(returning: weights)
            }
            self.healthStore.execute(query)
        }
    }

    func fetchLatestWeight() async throws -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else { return nil }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
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
}
