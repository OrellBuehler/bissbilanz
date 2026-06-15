import Foundation

/// Nutrition values extracted from an OCR'd nutrition-facts panel, normalized
/// to a per-100 g / per-100 ml basis. Every field is optional — OCR is
/// best-effort, so the user always confirms and edits the result in
/// `FoodEditSheet` before it is saved.
///
/// Units follow the `FoodCreate` convention: macros and `salt` in grams,
/// `sodium` in milligrams.
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
    }

    /// True when at least one of the headline values (calories + the four
    /// macros) was found — used to decide whether the iOS 26 document path
    /// produced a good-enough result or should fall back to the line path.
    var hasCoreMacros: Bool {
        calories != nil || protein != nil || carbs != nil || fat != nil
    }
}
