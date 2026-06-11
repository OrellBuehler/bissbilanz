@testable import Bissbilanz
import Foundation
import HealthKit
import Testing

@Suite("HealthKit Type Configuration Tests")
struct HealthKitTypeConfigTests {
    @Test("Body mass quantity type exists")
    func bodyMassTypeExists() {
        let type = HKQuantityType.quantityType(forIdentifier: .bodyMass)
        #expect(type != nil)
    }

    @Test("Dietary energy consumed type exists")
    func dietaryEnergyType() {
        let type = HKQuantityType.quantityType(forIdentifier: .dietaryEnergyConsumed)
        #expect(type != nil)
    }

    @Test("Dietary protein type exists")
    func dietaryProteinType() {
        let type = HKQuantityType.quantityType(forIdentifier: .dietaryProtein)
        #expect(type != nil)
    }

    @Test("Dietary carbohydrates type exists")
    func dietaryCarbsType() {
        let type = HKQuantityType.quantityType(forIdentifier: .dietaryCarbohydrates)
        #expect(type != nil)
    }

    @Test("Dietary fat total type exists")
    func dietaryFatType() {
        let type = HKQuantityType.quantityType(forIdentifier: .dietaryFatTotal)
        #expect(type != nil)
    }

    @Test("Dietary fiber type exists")
    func dietaryFiberType() {
        let type = HKQuantityType.quantityType(forIdentifier: .dietaryFiber)
        #expect(type != nil)
    }
}

@Suite("HealthKit Unit Tests")
struct HealthKitUnitTests {
    @Test("Kilogram unit for weight")
    func kilogramUnit() {
        let unit = HKUnit.gramUnit(with: .kilo)
        let quantity = HKQuantity(unit: unit, doubleValue: 75.5)
        #expect(quantity.doubleValue(for: unit) == 75.5)
    }

    @Test("Kilocalorie unit for calories")
    func kilocalorieUnit() {
        let unit = HKUnit.kilocalorie()
        let quantity = HKQuantity(unit: unit, doubleValue: 2000)
        #expect(quantity.doubleValue(for: unit) == 2000)
    }

    @Test("Gram unit for macros")
    func gramUnit() {
        let unit = HKUnit.gram()
        let quantity = HKQuantity(unit: unit, doubleValue: 150)
        #expect(quantity.doubleValue(for: unit) == 150)
    }

    @Test("Weight conversion kg to grams")
    func weightConversion() {
        let kgUnit = HKUnit.gramUnit(with: .kilo)
        let gUnit = HKUnit.gram()
        let quantity = HKQuantity(unit: kgUnit, doubleValue: 75.5)
        #expect(quantity.doubleValue(for: gUnit) == 75500)
    }
}

@Suite("HealthKit Sample Construction Tests")
struct HealthKitSampleTests {
    @Test("Weight sample construction")
    func weightSample() {
        guard let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            Issue.record("Body mass type not available")
            return
        }
        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: 75.5)
        let date = Date()
        let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)

        #expect(sample.quantityType == type)
        #expect(sample.quantity.doubleValue(for: .gramUnit(with: .kilo)) == 75.5)
        #expect(sample.startDate == date)
        #expect(sample.endDate == date)
    }

    @Test("Nutrition samples construction for non-zero values only")
    func nutritionSamplesFiltering() {
        let pairs: [(HKQuantityTypeIdentifier, Double, HKUnit)] = [
            (.dietaryEnergyConsumed, 2000, .kilocalorie()),
            (.dietaryProtein, 150, .gram()),
            (.dietaryCarbohydrates, 250, .gram()),
            (.dietaryFatTotal, 0, .gram()),
            (.dietaryFiber, 30, .gram()),
        ]

        var samples: [HKQuantitySample] = []
        let date = Date()

        for (identifier, value, unit) in pairs where value > 0 {
            guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { continue }
            let quantity = HKQuantity(unit: unit, doubleValue: value)
            let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
            samples.append(sample)
        }

        // Fat was 0, so should be filtered out
        #expect(samples.count == 4)
    }

    @Test("All zero values produce no samples")
    func allZeroNutrition() {
        let pairs: [(HKQuantityTypeIdentifier, Double, HKUnit)] = [
            (.dietaryEnergyConsumed, 0, .kilocalorie()),
            (.dietaryProtein, 0, .gram()),
            (.dietaryCarbohydrates, 0, .gram()),
            (.dietaryFatTotal, 0, .gram()),
            (.dietaryFiber, 0, .gram()),
        ]

        var samples: [HKQuantitySample] = []
        let date = Date()

        for (identifier, value, unit) in pairs where value > 0 {
            guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { continue }
            let quantity = HKQuantity(unit: unit, doubleValue: value)
            let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
            samples.append(sample)
        }

        #expect(samples.isEmpty)
    }

    @Test("Negative values are filtered out")
    func negativeValuesFiltered() {
        let pairs: [(HKQuantityTypeIdentifier, Double, HKUnit)] = [
            (.dietaryEnergyConsumed, -100, .kilocalorie()),
            (.dietaryProtein, 50, .gram()),
        ]

        var samples: [HKQuantitySample] = []
        let date = Date()

        for (identifier, value, unit) in pairs where value > 0 {
            guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { continue }
            let quantity = HKQuantity(unit: unit, doubleValue: value)
            let sample = HKQuantitySample(type: type, quantity: quantity, start: date, end: date)
            samples.append(sample)
        }

        #expect(samples.count == 1)
    }
}

@Suite("HealthKit Sort Descriptor Tests")
struct HealthKitSortTests {
    @Test("Sort descriptor for latest weight query")
    func latestWeightSortDescriptor() {
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        #expect(sortDescriptor.key == HKSampleSortIdentifierStartDate)
        #expect(sortDescriptor.ascending == false)
    }
}

@Suite("Sleep Night Aggregation Tests")
struct SleepNightAggregationTests {
    @Test("Sleep analysis category type exists")
    func sleepAnalysisTypeExists() {
        let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)
        #expect(type != nil)
    }

    /// Local-calendar date builder — `entryDate` is derived in local time.
    private func date(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = day
        components.hour = hour
        components.minute = minute
        return Calendar.current.date(from: components)!
    }

    private func sample(
        from start: Date,
        to end: Date,
        stage: HealthKitService.SleepStage = .asleep
    ) -> HealthKitService.SleepSample {
        HealthKitService.SleepSample(start: start, end: end, stage: stage)
    }

    @Test("One night sums asleep stages and keys by the wake day")
    func singleNightAggregation() throws {
        let samples = [
            sample(from: date(1, 23, 0), to: date(2, 1, 0)),
            sample(from: date(2, 1, 0), to: date(2, 1, 20), stage: .awake),
            sample(from: date(2, 1, 20), to: date(2, 7, 0)),
        ]

        let nights = HealthKitService.nights(from: samples)

        #expect(nights.count == 1)
        let night = try #require(nights.first)
        #expect(night.entryDate == "2026-06-02")
        #expect(night.bedtime == date(1, 23, 0))
        #expect(night.wakeTime == date(2, 7, 0))
        // 23:00–01:00 plus 01:20–07:00 — the awake gap doesn't count.
        #expect(night.asleepMinutes == 460)
        #expect(night.wakeUps == 1)
    }

    @Test("Overlapping samples from two sources are not double-counted")
    func overlappingSamplesUnioned() {
        // Watch and iPhone both recorded the same hour.
        let samples = [
            sample(from: date(2, 0, 0), to: date(2, 6, 0)),
            sample(from: date(2, 2, 0), to: date(2, 3, 0)),
        ]

        let nights = HealthKitService.nights(from: samples)

        #expect(nights.first?.asleepMinutes == 360)
    }

    @Test("In-bed-only recordings fall back to the in-bed duration")
    func inBedFallback() {
        let samples = [
            sample(from: date(1, 23, 0), to: date(2, 7, 0), stage: .inBed),
        ]

        let nights = HealthKitService.nights(from: samples)

        #expect(nights.count == 1)
        #expect(nights.first?.asleepMinutes == 480)
    }

    @Test("A gap larger than the session threshold splits sessions")
    func gapSplitsSessions() {
        let samples = [
            sample(from: date(1, 23, 0), to: date(2, 7, 0)),
            // Afternoon nap, ends the same day — a separate session.
            sample(from: date(2, 14, 0), to: date(2, 15, 0)),
        ]

        let nights = HealthKitService.nights(from: samples)

        // Both end on day 2 — the longer night wins over the nap.
        #expect(nights.count == 1)
        #expect(nights.first?.asleepMinutes == 480)
        #expect(nights.first?.bedtime == date(1, 23, 0))
    }

    @Test("Micro-naps below the minimum are dropped")
    func microNapsDropped() {
        let samples = [
            sample(from: date(2, 14, 0), to: date(2, 14, 20)),
        ]

        #expect(HealthKitService.nights(from: samples).isEmpty)
    }

    @Test("Consecutive nights produce one entry per wake day")
    func consecutiveNights() {
        let samples = [
            sample(from: date(1, 23, 0), to: date(2, 7, 0)),
            sample(from: date(2, 22, 30), to: date(3, 6, 30)),
        ]

        let nights = HealthKitService.nights(from: samples)

        #expect(nights.map(\.entryDate) == ["2026-06-02", "2026-06-03"])
    }
}
