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
        // 10 min under the 470 target costs 1.08 duration points, one
        // awakening costs 4, and a lone night can't be scored for bedtime
        // consistency so it keeps all 30: 94.9 → 9.5.
        #expect(night.quality == 9.5)
    }

    @Test("Leftover seconds are dropped, matching how Health shows minutes")
    func durationTruncatesRatherThanRounds() {
        // 7h58m30s asleep. Rounding read as 479 minutes — a minute longer
        // than Health showed for the same night.
        let bedtime = date(1, 23, 0)
        let wakeTime = bedtime.addingTimeInterval(478 * 60 + 30)
        let nights = HealthKitService.nights(from: [sample(from: bedtime, to: wakeTime)])

        #expect(nights.first?.asleepMinutes == 478)
    }

    @Test("Bedtime consistency is scored once the window holds enough nights")
    func bedtimeConsistencyAppliesAcrossNights() {
        // Three nights of equal length and no awakenings, the last one two
        // hours later to bed than the other two.
        let samples = [
            sample(from: date(1, 23, 0), to: date(2, 7, 0)),
            sample(from: date(2, 23, 0), to: date(3, 7, 0)),
            sample(from: date(4, 1, 0), to: date(4, 9, 0)),
        ]

        let nights = HealthKitService.nights(from: samples)

        #expect(nights.count == 3)
        // Every night is the same length and unbroken, so only bedtime
        // consistency separates them: the two habitual nights score alike and
        // the outlier scores below them.
        #expect(nights[0].quality == nights[1].quality)
        #expect(nights[2].quality < nights[0].quality)
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

@Suite("Derived Sleep Quality Tests")
struct DerivedSleepQualityTests {
    @Test("An unbroken night at or above the target scores a perfect 10")
    func perfectNight() {
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 0) == 10.0)
        // 7h50m is exactly where Apple stops deducting duration points.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 470, wakeUps: 0) == 10.0)
        // Sleeping longer than the target is never penalised.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 700, wakeUps: 0) == 10.0)
    }

    @Test("Duration drives the score — a short night is no longer perfect")
    func shortNightIsNotPerfect() {
        // The old efficiency-only estimate scored this 10.0 because the 100
        // minutes happened to be uninterrupted.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 100, wakeUps: 0) == 6.0)
        // Two hours under the target costs Apple's published 13 points.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 350, wakeUps: 0) == 8.7)
    }

    @Test("Each awakening costs interruption points, which floor at zero")
    func wakeUpPenalty() {
        // 50 duration + 30 consistency + (20 − 2 × 4) = 92 → 9.2
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 2) == 9.2)
        // The component bottoms out rather than eating into the others.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 100) == 8.0)
    }

    @Test("Bedtime consistency only costs points past the grace window")
    func bedtimeConsistency() {
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 0, bedtimeOffsetMinutes: 20) == 10.0)
        // 20 minutes past the 30-minute grace → 10 points off consistency.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 0, bedtimeOffsetMinutes: 50) == 9.0)
        // Going to bed early is as inconsistent as going to bed late.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 0, bedtimeOffsetMinutes: -50) == 9.0)
        // An hour and a half out wipes the component but no more.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 480, wakeUps: 0, bedtimeOffsetMinutes: 300) == 7.0)
    }

    @Test("A night with nothing going for it never drops below 1")
    func floorAtOne() {
        #expect(HealthKitService.derivedQuality(asleepMinutes: 0, wakeUps: 100, bedtimeOffsetMinutes: 400) == 1.0)
    }

    @Test("A 6h58m night with one awakening lands near Apple's own score")
    func trackscoreReportedByHealth() {
        // The night behind the TestFlight report: Health scored it 88, the
        // old efficiency-only estimate scored it 9.1 off a different metric
        // entirely.
        #expect(HealthKitService.derivedQuality(asleepMinutes: 418, wakeUps: 1) == 9.0)
    }

    @Test("Imported nights carry a derived quality, not a flat placeholder")
    func nightsCarryDerivedQuality() {
        // A clean 8h night with no awakenings clears the duration target.
        let bedtime = Calendar.current.date(from: DateComponents(year: 2026, month: 6, day: 1, hour: 23))!
        let wakeTime = Calendar.current.date(from: DateComponents(year: 2026, month: 6, day: 2, hour: 7))!
        let samples = [HealthKitService.SleepSample(start: bedtime, end: wakeTime, stage: .asleep)]

        let night = HealthKitService.nights(from: samples).first
        #expect(night?.quality == 10.0)
    }
}

@Suite("Health Nutrient Catalog Tests")
struct HealthNutrientCatalogTests {
    @Test("Every catalog entry resolves to a real HealthKit quantity type")
    func identifiersResolve() {
        for nutrient in HealthNutrient.all {
            #expect(nutrient.quantityType != nil, "\(nutrient.key) should map to a HealthKit type")
        }
    }

    @Test("Catalog keys and identifiers are unique")
    func catalogUnique() {
        let keys = HealthNutrient.all.map(\.key)
        let identifiers = HealthNutrient.all.map(\.identifier.rawValue)
        #expect(Set(keys).count == keys.count)
        #expect(Set(identifiers).count == identifiers.count)
    }

    @Test("Catalog covers macros, minerals, vitamins and water")
    func catalogCoverage() {
        let keys = Set(HealthNutrient.all.map(\.key))
        let expected = [
            "calories", "protein", "carbs", "fat", "fiber", "sugar",
            "saturatedFat", "cholesterol", "sodium", "iron", "selenium",
            "vitaminA", "vitaminB12", "vitaminK", "caffeine", "water",
        ]
        for key in expected {
            #expect(keys.contains(key), "\(key) missing from catalog")
        }
    }
}

@Suite("Nutrient Totals Tests")
struct NutrientTotalsTests {
    @Test("Food-backed entries multiply nutrients by servings")
    func foodEntryTotals() {
        let food = makeNutrientFood(id: "f1", calories: 100, protein: 10, magnesium: 50, vitaminC: 20)
        let entry = makeNutrientEntry(foodId: "f1", servings: 2)

        let totals = HealthKitService.nutrientTotals(
            entries: [entry],
            foods: ["f1": food],
            nutrients: HealthNutrient.all
        )

        #expect(totals["calories"] == 200)
        #expect(totals["protein"] == 20)
        #expect(totals["magnesium"] == 100)
        #expect(totals["vitaminC"] == 40)
        #expect(totals["iron"] == nil)
    }

    @Test("Quick entries contribute resolved macros only")
    func quickEntryTotals() {
        let entry = makeNutrientEntry(foodId: nil, servings: 1, quickCalories: 250, quickProtein: 30)

        let totals = HealthKitService.nutrientTotals(
            entries: [entry],
            foods: [:],
            nutrients: HealthNutrient.all
        )

        #expect(totals["calories"] == 250)
        #expect(totals["protein"] == 30)
        #expect(totals["magnesium"] == nil)
    }

    @Test("Entries whose food is missing fall back to resolved macros")
    func missingFoodFallsBack() {
        let entry = makeNutrientEntry(foodId: "gone", servings: 2, calories: 100, protein: 5)

        let totals = HealthKitService.nutrientTotals(
            entries: [entry],
            foods: [:],
            nutrients: HealthNutrient.all
        )

        #expect(totals["calories"] == 200)
        #expect(totals["protein"] == 10)
    }

    @Test("Only requested nutrients are totalled")
    func onlyRequestedNutrients() {
        let food = makeNutrientFood(id: "f1", calories: 100, protein: 10, magnesium: 50, vitaminC: 20)
        let entry = makeNutrientEntry(foodId: "f1", servings: 1)
        let calorieOnly = HealthNutrient.all.filter { $0.key == "calories" }

        let totals = HealthKitService.nutrientTotals(entries: [entry], foods: ["f1": food], nutrients: calorieOnly)

        #expect(totals == ["calories": 100])
    }

    @Test("Multiple entries accumulate into one day total")
    func multipleEntriesAccumulate() {
        let food = makeNutrientFood(id: "f1", calories: 100, protein: 10, magnesium: 50, vitaminC: 20)
        let foodEntry = makeNutrientEntry(foodId: "f1", servings: 1)
        let quickEntry = makeNutrientEntry(foodId: nil, servings: 2, quickCalories: 50, quickProtein: 5)

        let totals = HealthKitService.nutrientTotals(
            entries: [foodEntry, quickEntry],
            foods: ["f1": food],
            nutrients: HealthNutrient.all
        )

        #expect(totals["calories"] == 200)
        #expect(totals["protein"] == 20)
        #expect(totals["magnesium"] == 50)
    }
}

// MARK: - Nutrient test helpers

private func makeNutrientFood(
    id: String,
    calories: Double,
    protein: Double,
    magnesium: Double? = nil,
    vitaminC: Double? = nil
) -> Food {
    Food(
        id: id, userId: "u1", name: "Test Food", brand: nil,
        servingSize: 100, servingUnit: .g,
        calories: calories, protein: protein, carbs: 0, fat: 0, fiber: 0,
        saturatedFat: nil, monounsaturatedFat: nil, polyunsaturatedFat: nil,
        transFat: nil, cholesterol: nil, omega3: nil, omega6: nil,
        sugar: nil, addedSugars: nil, sugarAlcohols: nil, starch: nil,
        sodium: nil, potassium: nil, calcium: nil, iron: nil,
        magnesium: magnesium, phosphorus: nil, zinc: nil, copper: nil,
        manganese: nil, selenium: nil, iodine: nil, fluoride: nil,
        chromium: nil, molybdenum: nil, chloride: nil,
        vitaminA: nil, vitaminC: vitaminC, vitaminD: nil, vitaminE: nil,
        vitaminK: nil, vitaminB1: nil, vitaminB2: nil, vitaminB3: nil,
        vitaminB5: nil, vitaminB6: nil, vitaminB7: nil, vitaminB9: nil,
        vitaminB12: nil, caffeine: nil, alcohol: nil, water: nil, salt: nil,
        barcode: nil, isFavorite: false, nutriScore: nil, novaGroup: nil,
        additives: nil, ingredientsText: nil, imageUrl: nil, labels: nil,
        createdAt: nil, updatedAt: nil
    )
}

private func makeNutrientEntry(
    foodId: String?,
    servings: Double,
    calories: Double? = nil,
    protein: Double? = nil,
    quickCalories: Double? = nil,
    quickProtein: Double? = nil
) -> Entry {
    Entry(
        id: "e1", mealType: "lunch", servings: servings, notes: nil,
        foodId: foodId, recipeId: nil,
        quickName: nil, quickCalories: quickCalories,
        quickProtein: quickProtein, quickCarbs: nil, quickFat: nil, quickFiber: nil, quickNutrients: nil,
        foodName: nil, calories: calories, protein: protein,
        carbs: nil, fat: nil, fiber: nil,
        servingSize: nil, servingUnit: nil,
        date: "2026-06-11", eatenAt: nil, createdAt: nil, updatedAt: nil
    )
}
