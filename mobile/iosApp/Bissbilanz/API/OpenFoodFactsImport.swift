import Foundation

extension FoodCreate {
    init(openFoodFacts hit: BissbilanzAPI.OpenFoodFactsHit, barcode: String) {
        let food = hit.food
        self.init(
            name: food.name,
            brand: food.brand,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            barcode: barcode,
            nutriScore: food.nutriScore,
            novaGroup: food.novaGroup,
            additives: food.additives,
            ingredientsText: food.ingredientsText,
            imageUrl: FoodEnrichmentRules.productImageUrl(food.imageUrl),
            categoriesTags: hit.categoriesTags
        )
        saturatedFat = Self.importedNutrient(food.saturatedFat)
        monounsaturatedFat = Self.importedNutrient(food.monounsaturatedFat)
        polyunsaturatedFat = Self.importedNutrient(food.polyunsaturatedFat)
        transFat = Self.importedNutrient(food.transFat)
        cholesterol = Self.importedNutrient(food.cholesterol)
        omega3 = Self.importedNutrient(food.omega3)
        omega6 = Self.importedNutrient(food.omega6)
        sugar = Self.importedNutrient(food.sugar)
        addedSugars = Self.importedNutrient(food.addedSugars)
        sugarAlcohols = Self.importedNutrient(food.sugarAlcohols)
        starch = Self.importedNutrient(food.starch)
        sodium = Self.importedNutrient(food.sodium)
        potassium = Self.importedNutrient(food.potassium)
        calcium = Self.importedNutrient(food.calcium)
        iron = Self.importedNutrient(food.iron)
        magnesium = Self.importedNutrient(food.magnesium)
        phosphorus = Self.importedNutrient(food.phosphorus)
        zinc = Self.importedNutrient(food.zinc)
        copper = Self.importedNutrient(food.copper)
        manganese = Self.importedNutrient(food.manganese)
        selenium = Self.importedNutrient(food.selenium)
        iodine = Self.importedNutrient(food.iodine)
        fluoride = Self.importedNutrient(food.fluoride)
        chromium = Self.importedNutrient(food.chromium)
        molybdenum = Self.importedNutrient(food.molybdenum)
        chloride = Self.importedNutrient(food.chloride)
        vitaminA = Self.importedNutrient(food.vitaminA)
        vitaminC = Self.importedNutrient(food.vitaminC)
        vitaminD = Self.importedNutrient(food.vitaminD)
        vitaminE = Self.importedNutrient(food.vitaminE)
        vitaminK = Self.importedNutrient(food.vitaminK)
        vitaminB1 = Self.importedNutrient(food.vitaminB1)
        vitaminB2 = Self.importedNutrient(food.vitaminB2)
        vitaminB3 = Self.importedNutrient(food.vitaminB3)
        vitaminB5 = Self.importedNutrient(food.vitaminB5)
        vitaminB6 = Self.importedNutrient(food.vitaminB6)
        vitaminB7 = Self.importedNutrient(food.vitaminB7)
        vitaminB9 = Self.importedNutrient(food.vitaminB9)
        vitaminB12 = Self.importedNutrient(food.vitaminB12)
        caffeine = Self.importedNutrient(food.caffeine)
        alcohol = Self.importedNutrient(food.alcohol)
        water = Self.importedNutrient(food.water)
        salt = Self.importedNutrient(food.salt)
    }

    private static func importedNutrient(_ value: Double?) -> Double? {
        guard let value, value.isFinite, value >= 0 else { return nil }
        return value
    }
}

enum ScannedBarcodeResolution: Equatable {
    case existing(Food)
    case imported(Food)
    case notFound
}
