import Foundation
import SwiftData

#if DEBUG

/// Invented demo data for the store screenshots. The screenshot workflow
/// (`.github/workflows/store-screenshots-ios.yml`) launches a Debug simulator
/// build with `-store_screenshots YES`; `BissbilanzApp.init` then swaps in an
/// in-memory store and fills it here, so no real diary ever ends up in a
/// screenshot. The numbers vary by day through a fixed formula rather than a
/// random generator, so two runs produce the same pictures.
@MainActor
enum StoreScreenshotSeed {
    /// `UserDefaults` key, set from the launch arguments.
    nonisolated static let launchKey = "store_screenshots"
    static let bowlRecipeId = "demo-recipe-bowl"
    static let oatsRecipeId = "demo-recipe-oats"

    nonisolated static var isRequested: Bool {
        UserDefaults.standard.bool(forKey: launchKey)
    }

    private struct DemoFood {
        let key: String
        let en: String
        let de: String
        let brand: String?
        let size: Double
        let unit: String
        let calories: Double
        let protein: Double
        let carbs: Double
        let fat: Double
        let fiber: Double
        let favorite: Bool

        var id: String {
            "demo-food-\(key)"
        }

        var name: String {
            L10n.currentLocale == .de ? de : en
        }
    }

    private struct DemoPortion {
        let meal: String
        let hour: Int
        let food: String
        let servings: Double
    }

    private static let foods: [DemoFood] = [
        food("oats", "Rolled oats", "Haferflocken", nil, 50, "g", [187, 6.8, 29.5, 3.5, 5], true),
        food("yogurt", "Greek yogurt", "Griechischer Joghurt", "Alpenhof", 150, "g", [146, 13.5, 6, 7.5, 0], true),
        food("blueberries", "Blueberries", "Heidelbeeren", nil, 100, "g", [57, 0.7, 12, 0.3, 2.4], false),
        food("shake", "Whey protein shake", "Whey-Proteinshake", "Nordpeak", 30, "g", [114, 24, 1.8, 1.2, 0.3], true),
        food("chicken", "Chicken breast", "Pouletbrust", nil, 150, "g", [165, 34.5, 0, 2.7, 0], true),
        food("rice", "Basmati rice", "Basmatireis", nil, 75, "g", [263, 6, 58, 0.5, 1], false),
        food("broccoli", "Broccoli", "Brokkoli", nil, 150, "g", [51, 4.2, 6, 0.6, 3.9], false),
        food("oil", "Olive oil", "Olivenöl", nil, 10, "ml", [82, 0, 0, 9.2, 0], false),
        food("banana", "Banana", "Banane", nil, 120, "g", [107, 1.3, 24.4, 0.4, 3.1], true),
        food("almonds", "Almonds", "Mandeln", nil, 30, "g", [174, 6.3, 2, 15, 3.6], false),
        food("salmon", "Salmon fillet", "Lachsfilet", nil, 125, "g", [260, 25, 0, 17.5, 0], false),
        food("potatoes", "Potatoes", "Kartoffeln", nil, 200, "g", [154, 4, 31, 0.2, 4.2], false),
        food("avocado", "Avocado", "Avocado", nil, 80, "g", [128, 1.6, 1.5, 12, 5.4], false),
        food("bread", "Wholegrain bread", "Vollkornbrot", "Kornhaus", 60, "g", [140, 5.4, 24, 1.8, 4.2], false),
        food("eggs", "Egg", "Ei", nil, 60, "g", [86, 7.5, 0.4, 6, 0], false),
        food("pasta", "Wholegrain pasta", "Vollkornpasta", nil, 80, "g", [278, 10.4, 52, 2, 6.4], false),
        food("sauce", "Tomato sauce", "Tomatensauce", "Kornhaus", 125, "g", [50, 1.9, 8, 0.6, 2], false),
        food("cottage", "Cottage cheese", "Hüttenkäse", "Alpenhof", 200, "g", [196, 25, 5, 8.6, 0], false),
        food("apple", "Apple", "Apfel", nil, 150, "g", [78, 0.4, 17, 0.3, 3.6], false),
        food("chocolate", "Dark chocolate", "Dunkle Schokolade", nil, 20, "g", [115, 1.8, 6.5, 8.6, 2.2], false),
    ]

    private static let dayPlans: [[DemoPortion]] = [
        [
            portion("Breakfast", 7, "oats", 1.2), portion("Breakfast", 7, "yogurt", 1),
            portion("Breakfast", 7, "blueberries", 1), portion("Breakfast", 7, "shake", 1),
            portion("Lunch", 12, "chicken", 1), portion("Lunch", 12, "rice", 1),
            portion("Lunch", 12, "broccoli", 1), portion("Lunch", 12, "oil", 1),
            portion("Snacks", 16, "banana", 1), portion("Snacks", 16, "almonds", 1),
            portion("Dinner", 19, "salmon", 1), portion("Dinner", 19, "potatoes", 1),
            portion("Dinner", 19, "avocado", 0.5), portion("Dinner", 19, "bread", 1),
        ],
        [
            portion("Breakfast", 8, "eggs", 3), portion("Breakfast", 8, "bread", 2),
            portion("Breakfast", 8, "avocado", 1),
            portion("Lunch", 13, "pasta", 1.25), portion("Lunch", 13, "sauce", 1.5),
            portion("Lunch", 13, "chicken", 1),
            portion("Snacks", 16, "cottage", 1), portion("Snacks", 16, "apple", 1),
            portion("Dinner", 19, "salmon", 1), portion("Dinner", 19, "rice", 1),
            portion("Dinner", 19, "broccoli", 1.5), portion("Dinner", 20, "chocolate", 1),
        ],
        [
            portion("Breakfast", 7, "oats", 1.5), portion("Breakfast", 7, "banana", 1),
            portion("Breakfast", 7, "shake", 1), portion("Breakfast", 7, "almonds", 0.5),
            portion("Lunch", 12, "chicken", 1.2), portion("Lunch", 12, "potatoes", 1.5),
            portion("Lunch", 12, "broccoli", 1), portion("Lunch", 12, "oil", 1),
            portion("Snacks", 15, "yogurt", 1), portion("Snacks", 15, "blueberries", 1),
            portion("Dinner", 19, "pasta", 1), portion("Dinner", 19, "sauce", 1),
            portion("Dinner", 19, "cottage", 0.5), portion("Dinner", 20, "apple", 1),
        ],
    ]

    private static func food(
        _ key: String, _ en: String, _ de: String, _ brand: String?, _ size: Double, _ unit: String,
        _ macros: [Double], _ favorite: Bool
    ) -> DemoFood {
        DemoFood(
            key: key, en: en, de: de, brand: brand, size: size, unit: unit,
            calories: macros[0], protein: macros[1], carbs: macros[2], fat: macros[3], fiber: macros[4],
            favorite: favorite
        )
    }

    private static func portion(_ meal: String, _ hour: Int, _ food: String, _ servings: Double) -> DemoPortion {
        DemoPortion(meal: meal, hour: hour, food: food, servings: servings)
    }

    static func seed(container: ModelContainer) throws {
        let context = container.mainContext
        let byKey = Dictionary(uniqueKeysWithValues: foods.map { ($0.key, $0) })

        for demo in foods {
            try context.insert(LocalFood(food: JSONPatch.decode(Food.self, from: foodJSON(demo))))
        }
        try context.insert(LocalRecipe(recipe: recipe(
            id: bowlRecipeId,
            name: L10n.currentLocale == .de ? "Poulet-Reis-Bowl" : "Chicken rice bowl",
            parts: [("chicken", 300), ("rice", 150), ("broccoli", 300), ("oil", 20)],
            steps: L10n.currentLocale == .de
                ? ["Reis nach Packungsangabe kochen.", "Poulet würfeln und in Olivenöl goldbraun braten.",
                   "Brokkoli fünf Minuten dämpfen.", "Alles in zwei Schalen anrichten."]
                : ["Cook the rice as the packet says.", "Dice the chicken and fry it in olive oil until golden.",
                   "Steam the broccoli for five minutes.", "Divide everything between two bowls."],
            byKey: byKey
        )))
        try context.insert(LocalRecipe(recipe: recipe(
            id: oatsRecipeId,
            name: "Overnight Oats",
            parts: [("oats", 100), ("yogurt", 300), ("blueberries", 200), ("almonds", 30)],
            steps: L10n.currentLocale == .de
                ? ["Haferflocken und Joghurt verrühren.", "Über Nacht kalt stellen.",
                   "Mit Heidelbeeren und Mandeln servieren."]
                : ["Stir the oats into the yogurt.", "Chill overnight.", "Top with blueberries and almonds."],
            byKey: byKey
        )))
        context.insert(LocalGoals(goals: Goals(
            calorieGoal: 2200, proteinGoal: 150, carbGoal: 240, fatGoal: 70, fiberGoal: 30,
            sodiumGoal: nil, sugarGoal: nil, targetWeightKg: 75
        )))

        for offset in 0 ..< 35 {
            let day = Calendar.current.date(byAdding: .day, value: -offset, to: Date()) ?? Date()
            let date = dayString(day)
            try seedEntries(offset: offset, day: day, date: date, byKey: byKey, context: context)
            try seedBody(offset: offset, date: date, context: context)
        }
        try context.save()
    }

    private static func seedEntries(
        offset: Int, day: Date, date: String, byKey: [String: DemoFood], context: ModelContext
    ) throws {
        // Today always uses the first plan at full size; earlier days rotate
        // the plans and scale them a little so the charts are not flat.
        let plan = dayPlans[offset % dayPlans.count]
        let wobble: Double = 0.12 * sin(Double(offset) * 1.7)
        let scale: Double = offset == 0 ? 1 : 1 + wobble
        for (index, item) in plan.enumerated() {
            guard let demo = byKey[item.food] else { continue }
            let eaten = Calendar.current.date(bySettingHour: item.hour, minute: 10 + index, second: 0, of: day) ?? day
            let stamp = ISO8601DateFormatter().string(from: eaten)
            let servings: Double = (item.servings * scale * 10).rounded() / 10
            var json: [String: Any] = [:]
            json["id"] = "demo-entry-\(offset)-\(index)"
            json["mealType"] = item.meal
            json["servings"] = servings
            json["foodId"] = demo.id
            json["foodName"] = demo.name
            json["calories"] = demo.calories
            json["protein"] = demo.protein
            json["carbs"] = demo.carbs
            json["fat"] = demo.fat
            json["fiber"] = demo.fiber
            json["servingSize"] = demo.size
            json["servingUnit"] = demo.unit
            json["date"] = date
            json["eatenAt"] = stamp
            json["createdAt"] = stamp
            let entry = try JSONPatch.decode(Entry.self, from: json)
            context.insert(LocalEntry(entry: entry, date: date))
        }
    }

    private static func seedBody(offset: Int, date: String, context: ModelContext) throws {
        let rawWeight: Double = 76.8 + Double(offset) * 0.05 + 0.25 * sin(Double(offset) * 1.3)
        var weight: [String: Any] = [:]
        weight["id"] = "demo-weight-\(offset)"
        weight["userId"] = "demo"
        weight["weightKg"] = (rawWeight * 10).rounded() / 10
        weight["entryDate"] = date
        try context.insert(LocalWeightEntry(entry: JSONPatch.decode(WeightEntry.self, from: weight)))

        let minutes: Int = 435 + Int(35 * sin(Double(offset) * 2.1))
        let quality: Int = 7 + Int((1.4 * sin(Double(offset) * 0.9)).rounded())
        var sleep: [String: Any] = [:]
        sleep["id"] = "demo-sleep-\(offset)"
        sleep["userId"] = "demo"
        sleep["entryDate"] = date
        sleep["durationMinutes"] = minutes
        sleep["quality"] = quality
        try context.insert(LocalSleepEntry(entry: JSONPatch.decode(SleepEntry.self, from: sleep)))
    }

    private static func foodJSON(_ demo: DemoFood) -> [String: Any] {
        var json: [String: Any] = [:]
        json["id"] = demo.id
        json["userId"] = "demo"
        json["name"] = demo.name
        json["servingSize"] = demo.size
        json["servingUnit"] = demo.unit
        json["calories"] = demo.calories
        json["protein"] = demo.protein
        json["carbs"] = demo.carbs
        json["fat"] = demo.fat
        json["fiber"] = demo.fiber
        json["isFavorite"] = demo.favorite
        // Rough, plausible values so the nutrient views are not empty.
        let sugar: Double = (demo.carbs * 2.5).rounded() / 10
        let saturatedFat: Double = (demo.fat * 3).rounded() / 10
        let sodium: Double = (20 + demo.protein * 6).rounded()
        let potassium: Double = (120 + demo.fiber * 60 + demo.protein * 8).rounded()
        let calcium: Double = (15 + demo.protein * 5).rounded()
        let magnesium: Double = (10 + demo.fiber * 9).rounded()
        let iron: Double = (3 + demo.fiber * 3.5).rounded() / 10
        let vitaminC: Double = (demo.fiber * 6).rounded()
        json["sugar"] = sugar
        json["saturatedFat"] = saturatedFat
        json["sodium"] = sodium
        json["potassium"] = potassium
        json["calcium"] = calcium
        json["magnesium"] = magnesium
        json["iron"] = iron
        json["vitaminC"] = vitaminC
        if let brand = demo.brand {
            json["brand"] = brand
        }
        return json
    }

    private static func recipe(
        id: String, name: String, parts: [(String, Double)], steps: [String], byKey: [String: DemoFood]
    ) throws -> Recipe {
        var totals = [0.0, 0.0, 0.0, 0.0, 0.0]
        var ingredients: [[String: Any]] = []
        for (index, part) in parts.enumerated() {
            guard let demo = byKey[part.0] else { continue }
            let factor = part.1 / demo.size
            totals[0] += demo.calories * factor
            totals[1] += demo.protein * factor
            totals[2] += demo.carbs * factor
            totals[3] += demo.fat * factor
            totals[4] += demo.fiber * factor
            var ingredient: [String: Any] = [:]
            ingredient["id"] = "\(id)-ingredient-\(index)"
            ingredient["recipeId"] = id
            ingredient["foodId"] = demo.id
            ingredient["quantity"] = part.1
            ingredient["servingUnit"] = demo.unit
            ingredient["sortOrder"] = index
            ingredient["food"] = foodJSON(demo)
            ingredients.append(ingredient)
        }
        let stepRows: [[String: Any]] = steps.enumerated().map { index, text in
            ["id": "\(id)-step-\(index)", "sortOrder": index, "text": text]
        }
        var json: [String: Any] = [:]
        json["id"] = id
        json["userId"] = "demo"
        json["name"] = name
        json["totalServings"] = 2
        json["isFavorite"] = true
        json["calories"] = totals[0].rounded()
        json["protein"] = totals[1].rounded()
        json["carbs"] = totals[2].rounded()
        json["fat"] = totals[3].rounded()
        json["fiber"] = totals[4].rounded()
        json["ingredients"] = ingredients
        json["steps"] = stepRows
        json["stepCount"] = stepRows.count
        return try JSONPatch.decode(Recipe.self, from: json)
    }

    private static func dayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

#endif
