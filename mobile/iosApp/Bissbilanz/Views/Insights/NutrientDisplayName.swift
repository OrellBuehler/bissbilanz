import Foundation

/// Localized display name for a nutrient key.
///
/// The shared analytics return nutrient *keys* (`"vitaminC"`, `"omega3"`), never
/// display text, so each platform maps them itself — this mirrors Android's
/// `NutrientDisplay.kt` case for case, including its fallback of capitalising an
/// unmapped key rather than showing nothing.
///
/// Note this deliberately ignores `RdaEntry.label`, which is hardcoded English in
/// the generated analytics constants.
func nutrientDisplayName(_ key: String) -> String {
    switch key {
    case "calories": L10n.macroCalories
    case "protein": L10n.macroProtein
    case "carbs": L10n.macroCarbs
    case "fat": L10n.macroFat
    case "fiber": L10n.macroFiber
    case "saturatedFat": L10n.nutrientSaturatedFat
    case "monounsaturatedFat": L10n.nutrientMonounsaturatedFatFull
    case "polyunsaturatedFat": L10n.nutrientPolyunsaturatedFatFull
    case "transFat": L10n.nutrientTransFat
    case "cholesterol": L10n.nutrientCholesterol
    case "omega3": L10n.nutrientOmega3
    case "omega6": L10n.nutrientOmega6
    case "sugar": L10n.nutrientSugar
    case "addedSugars": L10n.nutrientAddedSugars
    case "sugarAlcohols": L10n.nutrientSugarAlcohols
    case "starch": L10n.nutrientStarch
    case "sodium": L10n.nutrientSodium
    case "potassium": L10n.nutrientPotassium
    case "calcium": L10n.nutrientCalcium
    case "iron": L10n.nutrientIron
    case "magnesium": L10n.nutrientMagnesium
    case "phosphorus": L10n.nutrientPhosphorus
    case "zinc": L10n.nutrientZinc
    case "copper": L10n.nutrientCopper
    case "manganese": L10n.nutrientManganese
    case "selenium": L10n.nutrientSelenium
    case "iodine": L10n.nutrientIodine
    case "fluoride": L10n.nutrientFluoride
    case "chromium": L10n.nutrientChromium
    case "molybdenum": L10n.nutrientMolybdenum
    case "chloride": L10n.nutrientChloride
    case "vitaminA": L10n.nutrientVitaminA
    case "vitaminC": L10n.nutrientVitaminC
    case "vitaminD": L10n.nutrientVitaminD
    case "vitaminE": L10n.nutrientVitaminE
    case "vitaminK": L10n.nutrientVitaminK
    case "vitaminB1": L10n.nutrientVitaminB1
    case "vitaminB2": L10n.nutrientVitaminB2
    case "vitaminB3": L10n.nutrientVitaminB3
    case "vitaminB5": L10n.nutrientVitaminB5
    case "vitaminB6": L10n.nutrientVitaminB6
    case "vitaminB7": L10n.nutrientVitaminB7
    case "vitaminB9": L10n.nutrientVitaminB9
    case "vitaminB12": L10n.nutrientVitaminB12
    case "caffeine": L10n.nutrientCaffeine
    case "alcohol": L10n.nutrientAlcohol
    case "water": L10n.nutrientWater
    case "salt": L10n.nutrientSalt
    default: key.prefix(1).uppercased() + key.dropFirst()
    }
}
