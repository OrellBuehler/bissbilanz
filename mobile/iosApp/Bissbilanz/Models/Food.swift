import Foundation

struct Food: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let name: String
    let brand: String?
    let servingSize: Double
    let servingUnit: ServingUnit
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let saturatedFat: Double?
    let monounsaturatedFat: Double?
    let polyunsaturatedFat: Double?
    let transFat: Double?
    let cholesterol: Double?
    let omega3: Double?
    let omega6: Double?
    let sugar: Double?
    let addedSugars: Double?
    let sugarAlcohols: Double?
    let starch: Double?
    let sodium: Double?
    let potassium: Double?
    let calcium: Double?
    let iron: Double?
    let magnesium: Double?
    let phosphorus: Double?
    let zinc: Double?
    let copper: Double?
    let manganese: Double?
    let selenium: Double?
    let iodine: Double?
    let fluoride: Double?
    let chromium: Double?
    let molybdenum: Double?
    let chloride: Double?
    let vitaminA: Double?
    let vitaminC: Double?
    let vitaminD: Double?
    let vitaminE: Double?
    let vitaminK: Double?
    let vitaminB1: Double?
    let vitaminB2: Double?
    let vitaminB3: Double?
    let vitaminB5: Double?
    let vitaminB6: Double?
    let vitaminB7: Double?
    let vitaminB9: Double?
    let vitaminB12: Double?
    let caffeine: Double?
    let alcohol: Double?
    let water: Double?
    let salt: Double?
    let barcode: String?
    let isFavorite: Bool
    let nutriScore: String?
    let novaGroup: Int?
    let additives: [String]?
    let ingredientsText: String?
    let imageUrl: String?
    let createdAt: String?
    let updatedAt: String?

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Food, rhs: Food) -> Bool {
        lhs.id == rhs.id
    }

    var fatBreakdownNutrients: [(String, Double, String)] {
        [
            ("Saturated Fat", saturatedFat, "g"),
            ("Monounsaturated Fat", monounsaturatedFat, "g"),
            ("Polyunsaturated Fat", polyunsaturatedFat, "g"),
            ("Trans Fat", transFat, "g"),
            ("Cholesterol", cholesterol, "mg"),
            ("Omega-3", omega3, "g"),
            ("Omega-6", omega6, "g"),
        ].compactMap { name, val_, unit in
            guard let v = val_ else { return nil }
            return (name, v, unit)
        }
    }

    var sugarCarbNutrients: [(String, Double, String)] {
        [
            ("Sugar", sugar, "g"),
            ("Added Sugars", addedSugars, "g"),
            ("Sugar Alcohols", sugarAlcohols, "g"),
            ("Starch", starch, "g"),
        ].compactMap { name, val_, unit in
            guard let v = val_ else { return nil }
            return (name, v, unit)
        }
    }

    var mineralNutrients: [(String, Double, String)] {
        [
            ("Sodium", sodium, "mg"),
            ("Potassium", potassium, "mg"),
            ("Calcium", calcium, "mg"),
            ("Iron", iron, "mg"),
            ("Magnesium", magnesium, "mg"),
            ("Phosphorus", phosphorus, "mg"),
            ("Zinc", zinc, "mg"),
            ("Copper", copper, "mg"),
            ("Manganese", manganese, "mg"),
            ("Selenium", selenium, "\u{00B5}g"),
            ("Iodine", iodine, "\u{00B5}g"),
            ("Fluoride", fluoride, "mg"),
            ("Chromium", chromium, "\u{00B5}g"),
            ("Molybdenum", molybdenum, "\u{00B5}g"),
            ("Chloride", chloride, "mg"),
        ].compactMap { name, val_, unit in
            guard let v = val_ else { return nil }
            return (name, v, unit)
        }
    }

    var vitaminNutrients: [(String, Double, String)] {
        [
            ("Vitamin A", vitaminA, "\u{00B5}g"),
            ("Vitamin C", vitaminC, "mg"),
            ("Vitamin D", vitaminD, "\u{00B5}g"),
            ("Vitamin E", vitaminE, "mg"),
            ("Vitamin K", vitaminK, "\u{00B5}g"),
            ("Vitamin B1", vitaminB1, "mg"),
            ("Vitamin B2", vitaminB2, "mg"),
            ("Vitamin B3", vitaminB3, "mg"),
            ("Vitamin B5", vitaminB5, "mg"),
            ("Vitamin B6", vitaminB6, "mg"),
            ("Vitamin B7", vitaminB7, "\u{00B5}g"),
            ("Vitamin B9", vitaminB9, "\u{00B5}g"),
            ("Vitamin B12", vitaminB12, "\u{00B5}g"),
        ].compactMap { name, val_, unit in
            guard let v = val_ else { return nil }
            return (name, v, unit)
        }
    }

    var otherNutrients: [(String, Double, String)] {
        [
            ("Caffeine", caffeine, "mg"),
            ("Alcohol", alcohol, "g"),
            ("Water", water, "g"),
            ("Salt", salt, "g"),
        ].compactMap { name, val_, unit in
            guard let v = val_ else { return nil }
            return (name, v, unit)
        }
    }
}

struct FoodCreate: Codable {
    let name: String
    var brand: String?
    let servingSize: Double
    let servingUnit: ServingUnit
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    var saturatedFat: Double?
    var monounsaturatedFat: Double?
    var polyunsaturatedFat: Double?
    var transFat: Double?
    var cholesterol: Double?
    var omega3: Double?
    var omega6: Double?
    var sugar: Double?
    var addedSugars: Double?
    var sugarAlcohols: Double?
    var starch: Double?
    var sodium: Double?
    var potassium: Double?
    var calcium: Double?
    var iron: Double?
    var magnesium: Double?
    var phosphorus: Double?
    var zinc: Double?
    var copper: Double?
    var manganese: Double?
    var selenium: Double?
    var iodine: Double?
    var fluoride: Double?
    var chromium: Double?
    var molybdenum: Double?
    var chloride: Double?
    var vitaminA: Double?
    var vitaminC: Double?
    var vitaminD: Double?
    var vitaminE: Double?
    var vitaminK: Double?
    var vitaminB1: Double?
    var vitaminB2: Double?
    var vitaminB3: Double?
    var vitaminB5: Double?
    var vitaminB6: Double?
    var vitaminB7: Double?
    var vitaminB9: Double?
    var vitaminB12: Double?
    var caffeine: Double?
    var alcohol: Double?
    var water: Double?
    var salt: Double?
    var barcode: String?
    var isFavorite: Bool?
    var nutriScore: String?
    var novaGroup: Int?
    var additives: [String]?
    var ingredientsText: String?
    var imageUrl: String?
}

struct FoodsResponse: Codable {
    let foods: [Food]
}

struct FoodResponse: Codable {
    let food: Food
}

struct FavoritesResponse: Codable {
    let foods: [Food]
    let recipes: [Recipe]?
}
