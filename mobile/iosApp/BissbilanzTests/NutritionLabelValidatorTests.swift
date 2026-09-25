@testable import Bissbilanz
import Testing

/// The Foundation Models call itself can't run in CI (no device, no Apple
/// Intelligence session) — see `MealEstimator`, which has no test coverage of
/// its own model call for the same reason. `NutritionLabelValidator` is a
/// pure function over plain `ParsedNutrition` values, so its merge/validation
/// logic is fully testable without the model: these tests stand in a
/// `ParsedNutrition` for what a `NutritionLabelExtraction` would have mapped
/// to, and exercise `merge(model:fallback:computedFromServing:)` directly.
@Suite("Nutrition label validator")
struct NutritionLabelValidatorTests {
    // MARK: - Happy path

    @Test("Prefers coherent model values over the fallback")
    func prefersModelValues() {
        let model = coherentCandidate()
        let fallback = ParsedNutrition(
            calories: 100,
            protein: 1,
            carbs: 1,
            fat: 1,
            fiber: 1,
            sugar: 1,
            saturatedFat: 1,
            salt: 1,
            sodium: 1
        )

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.calories == model.calories)
        #expect(merged.protein == model.protein)
        #expect(merged.carbs == model.carbs)
        #expect(merged.fat == model.fat)
    }

    @Test("Backfills a field the model left nil from the fallback")
    func backfillsMissingCoreField() {
        var model = coherentCandidate()
        model.fiber = nil
        let fallback = ParsedNutrition(fiber: 2.5)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.fiber == 2.5)
        #expect(merged.protein == model.protein) // untouched fields stay the model's
    }

    @Test("Keeps a per-100 ml basis found by either side")
    func keepsVolumeBasisFromEitherSide() {
        var fallback = ParsedNutrition()
        fallback.isVolume = true

        let merged = NutritionLabelValidator.merge(
            model: coherentCandidate(),
            fallback: fallback,
            computedFromServing: false
        )

        #expect(merged.isVolume)
    }

    @Test("Backfills salt/sodium independently of the core-macro coherence check")
    func backfillsSaltAndSodium() {
        var model = coherentCandidate()
        model.salt = nil
        model.sodium = nil
        let fallback = ParsedNutrition(salt: 1.28, sodium: 512)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.salt == 1.28)
        #expect(merged.sodium == 512)
    }

    // MARK: - Per-field range checks

    @Test("Drops a macro over 100 g per 100 g and backfills it")
    func dropsOutOfRangeGramValue() {
        var model = coherentCandidate()
        model.protein = 150 // OCR/model garbage — can't exceed the 100 g basis
        let fallback = ParsedNutrition(protein: 9.7)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.protein == 9.7)
    }

    @Test("Drops a negative value and backfills it")
    func dropsNegativeValue() {
        var model = coherentCandidate()
        model.fat = -4
        let fallback = ParsedNutrition(fat: 4.5)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.fat == 4.5)
    }

    @Test("Drops a calorie figure over the plausible per-100g ceiling")
    func dropsImplausibleCalories() {
        var model = coherentCandidate()
        model.calories = 5000
        let fallback = ParsedNutrition(calories: 375)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.calories == 375)
    }

    @Test("Extended fields pass through independently, with their own range check")
    func extendedFieldsPassThroughIndependently() {
        var model = coherentCandidate()
        model.cholesterol = 45
        model.potassium = 300
        model.transFat = -1 // garbage — dropped, fallback has nothing to offer

        let merged = NutritionLabelValidator.merge(
            model: model,
            fallback: ParsedNutrition(),
            computedFromServing: false
        )

        #expect(merged.cholesterol == 45)
        #expect(merged.potassium == 300)
        #expect(merged.transFat == nil)
    }

    @Test("Barcode passes through untouched — the fallback never has one")
    func barcodePassesThrough() {
        var model = coherentCandidate()
        model.barcode = "4006381333931"

        let merged = NutritionLabelValidator.merge(
            model: model,
            fallback: ParsedNutrition(),
            computedFromServing: false
        )

        #expect(merged.barcode == "4006381333931")
    }

    // MARK: - Cross-field coherence

    @Test("Wipes all core macros when energy is wildly inconsistent with them")
    func wipesCoreMacrosOnEnergyMismatch() {
        // 10 g protein + 10 g carbs + 10 g fat ≈ 170 kcal by Atwater factors —
        // 900 kcal is nowhere close, even with a generous tolerance.
        let model = ParsedNutrition(
            calories: 900,
            protein: 10,
            carbs: 10,
            fat: 10,
            fiber: 2,
            sugar: 5,
            saturatedFat: 3,
            salt: 1,
            sodium: 400
        )
        let fallback = ParsedNutrition(calories: 170, protein: 10, carbs: 10, fat: 10, fiber: 2)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.calories == 170)
        #expect(merged.protein == 10)
        #expect(merged.fiber == 2)
        // Salt/sodium are unrelated to the energy equation and are kept.
        #expect(merged.salt == 1)
        #expect(merged.sodium == 400)
    }

    @Test("Accepts energy within the ordinary rounding tolerance")
    func acceptsCloseEnergy() {
        // Expected ≈ 9.7*4 + 71.4*4 + 4.5*9 = 364.9; label prints 375 kcal.
        let model = ParsedNutrition(
            calories: 375,
            protein: 9.7,
            carbs: 71.4,
            fat: 4.5,
            fiber: 2,
            sugar: 14,
            saturatedFat: 1.2,
            salt: 1.28,
            sodium: 512
        )

        let merged = NutritionLabelValidator.merge(
            model: model,
            fallback: ParsedNutrition(),
            computedFromServing: false
        )

        #expect(merged.calories == 375)
        #expect(merged.protein == 9.7)
    }

    @Test("A serving-derived conversion gets a wider energy tolerance than a direct per-100 reading")
    func relaxedToleranceForServingConversion() {
        // Expected ≈ 170 kcal; 220 is outside the strict tolerance (60 kcal)
        // but inside the relaxed one used when the model converted from a
        // per-serving-only column (max(170*0.35, 60) = 60 vs the gap of 50).
        let model = ParsedNutrition(calories: 220, protein: 10, carbs: 10, fat: 10)
        let fallback = ParsedNutrition(calories: 999) // must NOT win if the model is trusted

        let strict = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)
        let relaxed = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: true)

        #expect(strict.calories == 999) // rejected, falls back
        #expect(relaxed.calories == 220) // accepted under the wider tolerance
    }

    @Test("Wipes core macros when sugar exceeds total carbohydrate")
    func wipesOnSugarExceedingCarbs() {
        var model = coherentCandidate()
        model.carbs = 10
        model.sugar = 20
        let fallback = ParsedNutrition(carbs: 10, sugar: 8)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.carbs == 10)
        #expect(merged.sugar == 8)
    }

    @Test("Wipes core macros when saturated fat exceeds total fat")
    func wipesOnSaturatedFatExceedingFat() {
        var model = coherentCandidate()
        model.fat = 5
        model.saturatedFat = 12
        let fallback = ParsedNutrition(fat: 5, saturatedFat: 3)

        let merged = NutritionLabelValidator.merge(model: model, fallback: fallback, computedFromServing: false)

        #expect(merged.fat == 5)
        #expect(merged.saturatedFat == 3)
    }

    // MARK: - Helpers

    /// A complete, internally-consistent candidate matching the German panel
    /// used in `NutritionLabelParserTests` (Atwater-consistent energy).
    private func coherentCandidate() -> ParsedNutrition {
        ParsedNutrition(
            calories: 375,
            protein: 9.7,
            carbs: 71.4,
            fat: 4.5,
            fiber: 2,
            sugar: 14,
            saturatedFat: 1.2,
            salt: 1.28,
            sodium: 512
        )
    }
}
