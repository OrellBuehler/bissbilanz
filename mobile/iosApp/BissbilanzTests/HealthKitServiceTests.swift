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
        additives: nil, ingredientsText: nil, imageUrl: nil,
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
        quickProtein: quickProtein, quickCarbs: nil, quickFat: nil, quickFiber: nil,
        foodName: nil, calories: calories, protein: protein,
        carbs: nil, fat: nil, fiber: nil,
        servingSize: nil, servingUnit: nil,
        date: "2026-06-11", eatenAt: nil, createdAt: nil, updatedAt: nil
    )
}
