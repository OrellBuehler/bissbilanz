import Foundation

/// Direct Open Food Facts v2 client used in Local mode, where there is no
/// backend to proxy barcode lookups through. Replicates the field selection
/// and mapping of the server proxy (`src/lib/server/openfoodfacts.ts`) and the
/// Android shared `OpenFoodFactsClient`, returning the `Food` prefill shape
/// the barcode scanner uses.
struct OpenFoodFactsClient {
    private let session: URLSession

    private static let apiBase = "https://world.openfoodfacts.org/api/v2/product"
    private static let searchBase = "https://world.openfoodfacts.org/cgi/search.pl"
    private static let userAgent = "Bissbilanz/1.0 (https://bissbilanz.orellbuehler.ch)"
    private static let fields = [
        "product_name", "brands", "nutriscore_grade", "nova_group",
        "additives_tags", "ingredients_text", "image_front_url", "nutriments",
    ].joined(separator: ",")

    private static let gToMg = 1000.0
    private static let gToUg = 1_000_000.0

    /// (Food key, OFF nutriments key, unit conversion) for the optional
    /// extended nutrients — mirrors the Android client's mapping.
    private static let extendedNutrients: [(String, String, Double)] = [
        ("saturatedFat", "saturated-fat_100g", 1), ("monounsaturatedFat", "monounsaturated-fat_100g", 1),
        ("polyunsaturatedFat", "polyunsaturated-fat_100g", 1), ("transFat", "trans-fat_100g", 1),
        ("cholesterol", "cholesterol_100g", gToMg), ("omega3", "omega-3-fat_100g", 1),
        ("omega6", "omega-6-fat_100g", 1), ("sugar", "sugars_100g", 1),
        ("addedSugars", "added-sugars_100g", 1), ("sugarAlcohols", "sugar-alcohols_100g", 1),
        ("starch", "starch_100g", 1), ("sodium", "sodium_100g", gToMg),
        ("potassium", "potassium_100g", gToMg), ("calcium", "calcium_100g", gToMg),
        ("iron", "iron_100g", gToMg), ("magnesium", "magnesium_100g", gToMg),
        ("phosphorus", "phosphorus_100g", gToMg), ("zinc", "zinc_100g", gToMg),
        ("copper", "copper_100g", gToMg), ("manganese", "manganese_100g", gToMg),
        ("selenium", "selenium_100g", gToUg), ("iodine", "iodine_100g", gToUg),
        ("fluoride", "fluoride_100g", gToMg), ("chromium", "chromium_100g", gToUg),
        ("molybdenum", "molybdenum_100g", gToUg), ("chloride", "chloride_100g", gToMg),
        ("vitaminA", "vitamin-a_100g", gToUg), ("vitaminC", "vitamin-c_100g", gToMg),
        ("vitaminD", "vitamin-d_100g", gToUg), ("vitaminE", "vitamin-e_100g", gToMg),
        ("vitaminK", "vitamin-k_100g", gToUg), ("vitaminB1", "vitamin-b1_100g", gToMg),
        ("vitaminB2", "vitamin-b2_100g", gToMg), ("vitaminB3", "vitamin-b3_100g", gToMg),
        ("vitaminB5", "vitamin-b5_100g", gToMg), ("vitaminB6", "vitamin-b6_100g", gToMg),
        ("vitaminB7", "vitamin-b7_100g", gToUg), ("vitaminB9", "vitamin-b9_100g", gToUg),
        ("vitaminB12", "vitamin-b12_100g", gToUg), ("caffeine", "caffeine_100g", gToMg),
        ("alcohol", "alcohol_100g", 1), ("water", "water_100g", 1), ("salt", "salt_100g", 1),
    ]

    init(session: URLSession = .shared) {
        self.session = session
    }

    /// Looks the barcode up on Open Food Facts. Returns nil for unknown
    /// products or unparseable responses; throws on transport errors.
    func lookupBarcode(_ barcode: String) async throws -> Food? {
        // Untrusted scanner input — see the twin in `BissbilanzAPI.lookupBarcode`.
        guard let encoded = barcode.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              var components = URLComponents(string: "\(Self.apiBase)/\(encoded).json")
        else { return nil }
        components.queryItems = [URLQueryItem(name: "fields", value: Self.fields)]
        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            return nil
        }
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              Self.number(root["status"]) == 1,
              let product = root["product"] as? [String: Any]
        else {
            return nil
        }
        return Self.mapProduct(product, barcode: barcode)
    }

    /// Free-text product search (`/cgi/search.pl`), mirroring the server
    /// proxy's `searchProducts`. Only products with a name and a barcode are
    /// returned so every hit can be instantiated by barcode later.
    func searchProducts(query: String, limit: Int = 10) async throws -> [Food] {
        guard var components = URLComponents(string: Self.searchBase) else { return [] }
        components.queryItems = [
            URLQueryItem(name: "search_terms", value: query),
            URLQueryItem(name: "search_simple", value: "1"),
            URLQueryItem(name: "action", value: "process"),
            URLQueryItem(name: "json", value: "1"),
            URLQueryItem(name: "page_size", value: String(min(max(limit, 1), 20))),
            URLQueryItem(name: "fields", value: "code,\(Self.fields)"),
        ]
        guard let url = components.url else { return [] }
        var request = URLRequest(url: url)
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            return []
        }
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let products = root["products"] as? [[String: Any]]
        else {
            return []
        }
        return products.compactMap { product in
            guard let code = product["code"] as? String, !code.isEmpty else { return nil }
            guard let food = Self.mapProduct(product, barcode: code), !food.name.isEmpty else { return nil }
            return food
        }
    }

    /// Maps an OFF product onto the `Food` prefill shape (per-100g values,
    /// like the server proxy). Internal for tests.
    static func mapProduct(_ product: [String: Any], barcode: String) -> Food? {
        let nutriments = product["nutriments"] as? [String: Any] ?? [:]

        var dict: [String: Any] = [
            // The proxy has no separate id; the barcode identifies the product.
            "id": barcode,
            "userId": "",
            "name": (product["product_name"] as? String) ?? "",
            "servingSize": 100,
            "servingUnit": "g",
            "calories": number(nutriments["energy-kcal_100g"]) ?? 0,
            "protein": number(nutriments["proteins_100g"]) ?? 0,
            "carbs": number(nutriments["carbohydrates_100g"]) ?? 0,
            "fat": number(nutriments["fat_100g"]) ?? 0,
            "fiber": number(nutriments["fiber_100g"]) ?? 0,
            "barcode": barcode,
            "isFavorite": false,
        ]
        if let brand = product["brands"] as? String, !brand.isEmpty {
            dict["brand"] = brand
        }
        if let grade = product["nutriscore_grade"] as? String,
           ["a", "b", "c", "d", "e"].contains(grade)
        {
            dict["nutriScore"] = grade
        }
        if let novaGroup = number(product["nova_group"]), (1.0 ... 4.0).contains(novaGroup) {
            dict["novaGroup"] = Int(novaGroup)
        }
        if let additives = product["additives_tags"] as? [String] {
            dict["additives"] = additives
        }
        if let ingredientsText = product["ingredients_text"] as? String {
            dict["ingredientsText"] = ingredientsText
        }
        if let imageUrl = product["image_front_url"] as? String {
            dict["imageUrl"] = imageUrl
        }
        for (foodKey, offKey, conversion) in extendedNutrients {
            if let value = extractNutrient(nutriments[offKey], conversion: conversion) {
                dict[foodKey] = value
            }
        }
        return try? JSONPatch.decode(Food.self, from: dict)
    }

    /// Mirrors the proxy's `extractNutrient`: optional unit conversion and
    /// rounding to 2 decimal places, nil when missing or not numeric.
    private static func extractNutrient(_ value: Any?, conversion: Double) -> Double? {
        guard let raw = number(value) else { return nil }
        return (raw * conversion * 100).rounded() / 100
    }

    /// OFF nutriment values may be numbers or numeric strings.
    private static func number(_ value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue.isNaN ? nil : number.doubleValue
        }
        if let string = value as? String {
            return Double(string)
        }
        return nil
    }
}
