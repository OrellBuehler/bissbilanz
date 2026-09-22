import Foundation

/// Nutrition values extracted from a nutrition-facts panel photo, normalized
/// to a per-100 g / per-100 ml basis. Every field is optional — extraction is
/// best-effort, so the user always confirms and edits the result in
/// `FoodEditSheet` before it is saved.
///
/// Units follow the `FoodCreate` convention: macros and `salt` in grams,
/// milligram/microgram fields (`sodium`, `cholesterol`, `potassium`,
/// `calcium`, `iron`, `vitaminD`) as named.
///
/// The core fields (through `sodium`) are filled by both the Vision+parser
/// path and the Foundation Models path (see `NutritionLabelScanner`); the
/// extended fields and `barcode` are Foundation Models-only — the regex
/// parser deliberately skips fat breakdown and minerals as too ambiguous to
/// read reliably from plain OCR text (see `NutritionLabelParser`'s `.ignore`
/// cases).
struct ParsedNutrition: Equatable {
    var calories: Double?
    var protein: Double?
    var carbs: Double?
    var fat: Double?
    var fiber: Double?
    var sugar: Double?
    var saturatedFat: Double?
    var salt: Double?
    var sodium: Double?

    var monounsaturatedFat: Double?
    var polyunsaturatedFat: Double?
    var transFat: Double?
    var cholesterol: Double?
    var potassium: Double?
    var calcium: Double?
    var iron: Double?
    var vitaminD: Double?
    var addedSugars: Double?

    /// Decoded from a barcode visible in the same photo, if any.
    var barcode: String?

    /// True when nothing usable was parsed — the scan surfaces an error
    /// instead of opening an empty confirmation sheet.
    var isEmpty: Bool {
        calories == nil
            && protein == nil
            && carbs == nil
            && fat == nil
            && fiber == nil
            && sugar == nil
            && saturatedFat == nil
            && salt == nil
            && sodium == nil
            && monounsaturatedFat == nil
            && polyunsaturatedFat == nil
            && transFat == nil
            && cholesterol == nil
            && potassium == nil
            && calcium == nil
            && iron == nil
            && vitaminD == nil
            && addedSugars == nil
            && barcode == nil
    }

    /// True when at least one of the headline values (calories + the four
    /// macros) was found — used to decide whether the iOS 26 document path
    /// produced a good-enough result or should fall back to the line path.
    var hasCoreMacros: Bool {
        calories != nil || protein != nil || carbs != nil || fat != nil
    }
}
