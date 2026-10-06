import Foundation

/// Swift port of the food package format — `src/lib/server/food-package/format.ts`,
/// `filename.ts` and the manifest schema in `src/lib/server/validation/food-package.ts`.
/// A package written here is read by the server and the other apps, and the other
/// way round, so limits, identity rules and names must stay in step with those files.
enum FoodPackageFormat {
    static let format = "bissbilanz.food-package"
    static let version = 1
    static let manifestName = "bissbilanz-foods.json"
    static let fileExtension = "bissbilanz"

    static let maxPackageBytes = 50 * 1024 * 1024
    static let maxFoods = 5000
    static let maxRecipes = 1000
    static let maxRecipeIngredients = 100
    static let maxManifestBytes = 10 * 1024 * 1024
    static let maxImageEntryBytes = 5 * 1024 * 1024
    static let maxTotalInflatedBytes = 150 * 1024 * 1024
    static let maxZipEntries = maxFoods + maxRecipes + 16
    static let maxPreviewThumbnails = 300
    static let maxIssues = 100
    static let maxLabelsPerFood = LabelNormalizer.maxLabelsPerFood

    /// Limits of the bulk import (`BulkPackageImporter`), which takes the packages the
    /// limits above turn away: a crawled catalog of tens of thousands of foods with a
    /// photo each. The package is mapped and its manifest streamed, so these are about
    /// what a phone can sensibly keep, not about memory.
    static let bulkMaxBytes = 4 * 1024 * 1024 * 1024
    static let bulkMaxFoods = 250_000
    static let bulkMaxManifestBytes = 1024 * 1024 * 1024
    static let bulkMaxZipEntries = bulkMaxFoods * 2 + 16
    static let bulkBatchSize = 500

    /// The 43 extended nutrients, in `ALL_NUTRIENT_KEYS` order (`src/lib/nutrients.ts`).
    static let nutrientKeys: [String] = [
        "saturatedFat", "monounsaturatedFat", "polyunsaturatedFat", "transFat", "cholesterol", "omega3", "omega6",
        "sugar", "addedSugars", "sugarAlcohols", "starch",
        "sodium", "potassium", "calcium", "iron", "magnesium", "phosphorus", "zinc", "copper", "manganese",
        "selenium", "iodine", "fluoride", "chromium", "molybdenum", "chloride",
        "vitaminA", "vitaminC", "vitaminD", "vitaminE", "vitaminK", "vitaminB1", "vitaminB2", "vitaminB3",
        "vitaminB5", "vitaminB6", "vitaminB7", "vitaminB9", "vitaminB12",
        "caffeine", "alcohol", "water", "salt",
    ]

    static let readme = """
    Bissbilanz food package
    =======================

    A collection of foods and recipes to share with other Bissbilanz users.
    Import it in Bissbilanz under Foods -> Import -> Food package.

    bissbilanz-foods.json   Foods, recipes and their ingredients.
    images/                 Photos of the foods and recipes.

    """
}

enum FoodPackageError: Error, Equatable {
    case empty
    case tooLarge
    case tooManyFiles
    case damaged
    case notAPackage
    case accountExport
    case newerVersion
    case missingManifest
    case invalid(String)
    case stalePreview
    case packageChanged
    case badRequest(String)
    case nothingToExport
    case exportTooLarge
    case tooManyFoods
    case tooManyRecipes
}

/// The text rules the server's matcher and file-name builder use, ported
/// character for character so the same two foods conflict on every platform.
enum FoodPackageText {
    /// What `\s` and `String.prototype.trim` treat as white space in JavaScript.
    private static let whitespace: Set<Unicode.Scalar> = {
        let ranges: [ClosedRange<UInt32>] = [
            0x09 ... 0x0D, 0x20 ... 0x20, 0xA0 ... 0xA0, 0x1680 ... 0x1680, 0x2000 ... 0x200A,
            0x2028 ... 0x2029, 0x202F ... 0x202F, 0x205F ... 0x205F, 0x3000 ... 0x3000, 0xFEFF ... 0xFEFF,
        ]
        return Set(ranges.flatMap { $0 }.compactMap { Unicode.Scalar($0) })
    }()

    static func isWhitespace(_ scalar: Unicode.Scalar) -> Bool {
        whitespace.contains(scalar)
    }

    /// `value.trim()`
    static func trimmed(_ value: String) -> String {
        var scalars = Substring(value).unicodeScalars[...]
        while let first = scalars.first, isWhitespace(first) { scalars.removeFirst() }
        while let last = scalars.last, isWhitespace(last) { scalars.removeLast() }
        var result = String.UnicodeScalarView()
        result.append(contentsOf: scalars)
        return String(result)
    }

    /// `normalize()` in `food-duplicates.ts`: lowercase, trim, collapse white
    /// space, strip diacritics. Punctuation is kept.
    static func normalize(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "" }
        var collapsed = String.UnicodeScalarView()
        var pendingSpace = false
        for scalar in trimmed(value.lowercased()).unicodeScalars {
            if isWhitespace(scalar) {
                pendingSpace = true
            } else {
                if pendingSpace { collapsed.append(" ") }
                pendingSpace = false
                collapsed.append(scalar)
            }
        }
        var stripped = String.UnicodeScalarView()
        for scalar in String(collapsed).decomposedStringWithCanonicalMapping.unicodeScalars
            where !(0x0300 ... 0x036F).contains(scalar.value)
        {
            stripped.append(scalar)
        }
        return String(stripped)
    }

    static func foodKey(name: String, brand: String?) -> String {
        "\(normalize(name))\u{0}\(normalize(brand))"
    }

    static func recipeKey(_ name: String) -> String {
        normalize(name)
    }

    /// `trimBarcode()`: nil for a missing or blank barcode.
    static func trimBarcode(_ barcode: String?) -> String? {
        guard let barcode else { return nil }
        let value = trimmed(barcode)
        return value.isEmpty ? nil : value
    }
}

/// Port of `filename.ts`: the download name of a package.
enum FoodPackageFilename {
    private static let maxNameLength = 80
    private static let forbidden: Set<Unicode.Scalar> = Set("/\\<>:\"|?*'`´‘’“”„".unicodeScalars)
    private static let windowsReserved: Set<String> = [
        "con", "prn", "aux", "nul",
        "com0", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt0", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ]

    /// Control and format characters and line or paragraph separators (`\p{Cc}\p{Cf}\p{Zl}\p{Zp}`).
    private static func isInvisible(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .control, .format, .lineSeparator, .paragraphSeparator: true
        default: false
        }
    }

    /// Makes a food or recipe name safe as a file name on every OS; empty if nothing is left.
    static func sanitizeBase(_ name: String) -> String {
        var cleaned = String.UnicodeScalarView()
        var pendingSpace = false
        for scalar in name.unicodeScalars {
            let blank = isInvisible(scalar) || forbidden.contains(scalar) || FoodPackageText.isWhitespace(scalar)
            if blank {
                pendingSpace = true
            } else {
                if pendingSpace { cleaned.append(" ") }
                pendingSpace = false
                cleaned.append(scalar)
            }
        }
        if pendingSpace { cleaned.append(" ") }

        var limited = String.UnicodeScalarView()
        limited.append(contentsOf: String(cleaned).unicodeScalars.prefix(maxNameLength))
        var scalars = FoodPackageText.trimmed(String(limited)).unicodeScalars[...]
        while let first = scalars.first, first == "." || first == " " { scalars.removeFirst() }
        while let last = scalars.last, last == "." || last == " " { scalars.removeLast() }
        var result = String.UnicodeScalarView()
        result.append(contentsOf: scalars)
        let base = String(result)
        return windowsReserved.contains(base.lowercased()) ? "\(base)_" : base
    }

    static func genericBase(date: Date) -> String {
        "bissbilanz-foods-\(isoDay(date))"
    }

    /// The recipe or food when the package is about exactly one of them,
    /// otherwise a generic dated name.
    static func packageFilename(recipes: [String], foods: [String], date: Date = Date()) -> String {
        let single: String? = if recipes.count == 1, foods.isEmpty {
            recipes[0]
        } else if recipes.isEmpty, foods.count == 1 {
            foods[0]
        } else {
            nil
        }
        let base = single.map(sanitizeBase) ?? ""
        return "\(base.isEmpty ? genericBase(date: date) : base).\(FoodPackageFormat.fileExtension)"
    }

    /// The name from a `Content-Disposition` header: the RFC 5987 `filename*`
    /// when present, else the plain `filename`. Made safe to write into the
    /// temporary directory, whatever the server sent.
    static func filename(fromContentDisposition header: String?) -> String? {
        guard let header else { return nil }
        let parameters = header.split(separator: ";").dropFirst().map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        var plain: String?
        var extended: String?
        for parameter in parameters {
            guard let equals = parameter.firstIndex(of: "=") else { continue }
            let key = parameter[..<equals].lowercased()
            var value = String(parameter[parameter.index(after: equals)...])
            if key == "filename*" {
                if let quote = value.range(of: "''") {
                    value = String(value[quote.upperBound...])
                }
                extended = value.removingPercentEncoding
            } else if key == "filename" {
                if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
                    value = String(value.dropFirst().dropLast())
                }
                plain = value
            }
        }
        return (extended ?? plain).flatMap(safeFileName)
    }

    /// Last path component without control characters; nil if nothing usable is left.
    static func safeFileName(_ name: String) -> String? {
        let component = name.replacingOccurrences(of: "\\", with: "/")
            .split(separator: "/", omittingEmptySubsequences: true).last.map(String.init) ?? ""
        var cleaned = String.UnicodeScalarView()
        for scalar in component.unicodeScalars where !isInvisible(scalar) {
            cleaned.append(scalar)
        }
        let result = FoodPackageText.trimmed(String(cleaned))
        guard !result.isEmpty, result != ".", result != ".." else { return nil }
        return result
    }

    /// `date.toISOString().slice(0, 10)`
    private static func isoDay(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
    }
}

// MARK: - Manifest

struct PackageFood: Equatable {
    enum Role: String {
        case selected
        case ingredient
    }

    var ref: String
    var role: Role = .selected
    var name: String
    var brand: String?
    var servingSize: Double
    var servingUnit: ServingUnit
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double
    /// Only the extended nutrients the food actually has a value for.
    var nutrients: [String: Double] = [:]
    var barcode: String?
    var nutriScore: String?
    var novaGroup: Int?
    var additives: [String]?
    var ingredientsText: String?
    var labels: [String] = []
    var image: String?
    var imageUrl: String?
}

struct PackageIngredient: Equatable {
    var food: String
    var quantity: Double
    var servingUnit: ServingUnit
}

struct PackageRecipe: Equatable {
    var ref: String
    var name: String
    var totalServings: Double
    var cookedWeight: Double?
    var image: String?
    var ingredients: [PackageIngredient]
}

struct PackageManifest: Equatable {
    var formatVersion: Int = FoodPackageFormat.version
    var exportedAt: String?
    var foods: [PackageFood]
    var recipes: [PackageRecipe]
}

/// Manifest reading and writing. Reading validates exactly what
/// `foodPackageManifestSchema` does, so a file this app accepts is one the
/// server accepts, and reports the first problem with the same `path — message`
/// shape.
enum PackageManifestCoding {
    static func parse(_ data: Data) throws -> PackageManifest {
        var text = String(data: data, encoding: .utf8) ?? ""
        if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
        guard let raw = try? JSONSerialization.jsonObject(with: Data(text.utf8)),
              let root = raw as? [String: Any]
        else { throw FoodPackageError.notAPackage }

        if root["format"] as? String != FoodPackageFormat.format {
            if root["foods"] != nil, root["formatVersion"] != nil, root["format"] == nil {
                throw FoodPackageError.accountExport
            }
            throw FoodPackageError.notAPackage
        }
        if let version = number(root["formatVersion"]), version > Double(FoodPackageFormat.version) {
            throw FoodPackageError.newerVersion
        }
        return try validate(root)
    }

    static func validate(_ root: [String: Any]) throws -> PackageManifest {
        guard let version = number(root["formatVersion"]), version == version.rounded(), version >= 1 else {
            throw invalid("formatVersion", "expected an integer of at least 1")
        }
        let exportedAt = try optionalString(root, "exportedAt", path: "exportedAt", max: 64)
        guard let rawFoods = root["foods"] as? [Any] else { throw invalid("foods", "expected an array") }
        guard rawFoods.count <= FoodPackageFormat.maxFoods else {
            throw invalid("foods", "too many foods")
        }
        var rawRecipes: [Any] = []
        if let value = root["recipes"], !(value is NSNull) {
            guard let array = value as? [Any] else { throw invalid("recipes", "expected an array") }
            rawRecipes = array
        }
        guard rawRecipes.count <= FoodPackageFormat.maxRecipes else {
            throw invalid("recipes", "too many recipes")
        }

        var foods: [PackageFood] = []
        var seenFoods = Set<String>()
        for (index, item) in rawFoods.enumerated() {
            let food = try parseFood(item, path: "foods.\(index)")
            guard seenFoods.insert(food.ref).inserted else { throw invalid("foods.\(index).ref", "Duplicate ref") }
            foods.append(food)
        }
        var recipes: [PackageRecipe] = []
        var seenRecipes = Set<String>()
        for (index, item) in rawRecipes.enumerated() {
            let recipe = try parseRecipe(item, path: "recipes.\(index)")
            guard seenRecipes.insert(recipe.ref).inserted else {
                throw invalid("recipes.\(index).ref", "Duplicate ref")
            }
            recipes.append(recipe)
        }
        return PackageManifest(formatVersion: Int(version), exportedAt: exportedAt, foods: foods, recipes: recipes)
    }

    static func parseFood(_ item: Any, path: String) throws -> PackageFood {
        guard let object = item as? [String: Any] else { throw invalid(path, "expected an object") }
        let ref = try requiredString(object, "ref", path: path, max: 10)
        guard isRef(ref, prefix: "f") else { throw invalid("\(path).ref", "Invalid string") }
        var role = PackageFood.Role.selected
        if let raw = object["role"], !(raw is NSNull) {
            guard let text = raw as? String, let parsed = PackageFood.Role(rawValue: text) else {
                throw invalid("\(path).role", "Invalid option")
            }
            role = parsed
        }
        let unit = try servingUnit(object, path: path)
        var food = PackageFood(
            ref: ref,
            role: role,
            name: try trimmedName(object, path: path),
            brand: try optionalString(object, "brand", path: path, max: 200),
            servingSize: try positive(object, "servingSize", path: path),
            servingUnit: unit,
            calories: try nonNegative(object, "calories", path: path),
            protein: try nonNegative(object, "protein", path: path),
            carbs: try nonNegative(object, "carbs", path: path),
            fat: try nonNegative(object, "fat", path: path),
            fiber: try nonNegative(object, "fiber", path: path)
        )
        for key in FoodPackageFormat.nutrientKeys {
            if let value = try optionalNumber(object, key, path: path) {
                guard value >= 0 else { throw invalid("\(path).\(key)", "Too small") }
                food.nutrients[key] = value
            }
        }
        food.barcode = try optionalString(object, "barcode", path: path, max: 64)
        if let score = try optionalString(object, "nutriScore", path: path, max: 1) {
            guard ["a", "b", "c", "d", "e"].contains(score) else {
                throw invalid("\(path).nutriScore", "Invalid option")
            }
            food.nutriScore = score
        }
        if let nova = try optionalNumber(object, "novaGroup", path: path) {
            guard nova == nova.rounded(), (1 ... 4).contains(nova) else {
                throw invalid("\(path).novaGroup", "Invalid value")
            }
            food.novaGroup = Int(nova)
        }
        food.additives = try optionalStrings(object, "additives", path: path, maxItems: 100, maxLength: 100)
        food.ingredientsText = try optionalString(object, "ingredientsText", path: path, max: 10000)
        food.labels = try optionalStrings(
            object, "labels", path: path, maxItems: FoodPackageFormat.maxLabelsPerFood * 2, maxLength: 120
        ) ?? []
        food.image = try optionalImagePath(object, "image", path: path)
        food.imageUrl = try optionalString(object, "imageUrl", path: path, max: 2048)
        return food
    }

    private static func parseRecipe(_ item: Any, path: String) throws -> PackageRecipe {
        guard let object = item as? [String: Any] else { throw invalid(path, "expected an object") }
        let ref = try requiredString(object, "ref", path: path, max: 10)
        guard isRef(ref, prefix: "r") else { throw invalid("\(path).ref", "Invalid string") }
        guard let rawIngredients = object["ingredients"] as? [Any] else {
            throw invalid("\(path).ingredients", "expected an array")
        }
        guard rawIngredients.count <= FoodPackageFormat.maxRecipeIngredients else {
            throw invalid("\(path).ingredients", "Too big")
        }
        var ingredients: [PackageIngredient] = []
        for (index, raw) in rawIngredients.enumerated() {
            let ingredientPath = "\(path).ingredients.\(index)"
            guard let entry = raw as? [String: Any] else { throw invalid(ingredientPath, "expected an object") }
            let food = try requiredString(entry, "food", path: ingredientPath, max: 10)
            guard isRef(food, prefix: "f") else { throw invalid("\(ingredientPath).food", "Invalid string") }
            ingredients.append(PackageIngredient(
                food: food,
                quantity: try positive(entry, "quantity", path: ingredientPath),
                servingUnit: try servingUnit(entry, path: ingredientPath)
            ))
        }
        var cooked: Double?
        if let value = try optionalNumber(object, "cookedWeight", path: path) {
            guard value > 0 else { throw invalid("\(path).cookedWeight", "Too small") }
            cooked = value
        }
        return PackageRecipe(
            ref: ref,
            name: try trimmedName(object, path: path),
            totalServings: try positive(object, "totalServings", path: path),
            cookedWeight: cooked,
            image: try optionalImagePath(object, "image", path: path),
            ingredients: ingredients
        )
    }

    // MARK: Writing

    /// The manifest JSON exactly as `export.ts` shapes it: every extended
    /// nutrient present (null when unknown), `role`, `image` and `imageUrl`
    /// always written.
    static func encode(_ manifest: PackageManifest) throws -> Data {
        var foods: [[String: Any]] = []
        for food in manifest.foods {
            var entry: [String: Any] = [:]
            entry["ref"] = food.ref
            entry["role"] = food.role.rawValue
            entry["name"] = food.name
            entry["brand"] = nullable(food.brand)
            entry["servingSize"] = food.servingSize
            entry["servingUnit"] = food.servingUnit.rawValue
            entry["calories"] = food.calories
            entry["protein"] = food.protein
            entry["carbs"] = food.carbs
            entry["fat"] = food.fat
            entry["fiber"] = food.fiber
            for key in FoodPackageFormat.nutrientKeys {
                entry[key] = nullable(food.nutrients[key])
            }
            entry["barcode"] = nullable(food.barcode)
            entry["nutriScore"] = nullable(food.nutriScore)
            entry["novaGroup"] = nullable(food.novaGroup)
            entry["additives"] = nullable(food.additives)
            entry["ingredientsText"] = nullable(food.ingredientsText)
            entry["labels"] = food.labels
            entry["image"] = nullable(food.image)
            entry["imageUrl"] = nullable(food.imageUrl)
            foods.append(entry)
        }
        var recipes: [[String: Any]] = []
        for recipe in manifest.recipes {
            var ingredients: [[String: Any]] = []
            for ingredient in recipe.ingredients {
                var item: [String: Any] = [:]
                item["food"] = ingredient.food
                item["quantity"] = ingredient.quantity
                item["servingUnit"] = ingredient.servingUnit.rawValue
                ingredients.append(item)
            }
            var entry: [String: Any] = [:]
            entry["ref"] = recipe.ref
            entry["name"] = recipe.name
            entry["totalServings"] = recipe.totalServings
            entry["cookedWeight"] = nullable(recipe.cookedWeight)
            entry["image"] = nullable(recipe.image)
            entry["ingredients"] = ingredients
            recipes.append(entry)
        }
        var root: [String: Any] = [:]
        root["format"] = FoodPackageFormat.format
        root["formatVersion"] = manifest.formatVersion
        root["exportedAt"] = nullable(manifest.exportedAt)
        root["foods"] = foods
        root["recipes"] = recipes
        return try JSONSerialization.data(
            withJSONObject: root, options: [.sortedKeys, .withoutEscapingSlashes, .prettyPrinted]
        )
    }

    // MARK: Field readers

    private static func nullable(_ value: Any?) -> Any {
        value ?? NSNull()
    }

    private static func invalid(_ path: String, _ message: String) -> FoodPackageError {
        .invalid("\(path) — \(message)")
    }

    static func isImagePath(_ value: String) -> Bool {
        guard value.hasPrefix("images/") else { return false }
        let name = value.dropFirst("images/".count)
        guard let dot = name.lastIndex(of: ".") else { return false }
        let stem = name[..<dot]
        let ext = name[name.index(after: dot)...]
        guard !stem.isEmpty, stem.allSatisfy({ $0.isASCII && ($0.isLowercase || $0.isNumber) }) else {
            return false
        }
        return ["webp", "jpg", "jpeg", "png"].contains(String(ext))
    }

    private static func isRef(_ value: String, prefix: Character) -> Bool {
        guard value.first == prefix else { return false }
        let digits = value.dropFirst()
        return (1 ... 6).contains(digits.count) && digits.allSatisfy { $0.isASCII && $0.isNumber }
    }

    static func number(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let result = number.doubleValue
        return result.isFinite ? result : nil
    }

    private static func requiredString(_ object: [String: Any], _ key: String, path: String, max: Int) throws -> String {
        guard let value = object[key] as? String else { throw invalid("\(path).\(key)", "expected a string") }
        guard value.utf16.count <= max else { throw invalid("\(path).\(key)", "Too big") }
        return value
    }

    private static func optionalString(
        _ object: [String: Any], _ key: String, path: String, max: Int
    ) throws -> String? {
        guard let raw = object[key], !(raw is NSNull) else { return nil }
        guard let value = raw as? String else { throw invalid("\(path).\(key)", "expected a string") }
        guard value.utf16.count <= max else { throw invalid("\(path).\(key)", "Too big") }
        return value
    }

    private static func optionalStrings(
        _ object: [String: Any], _ key: String, path: String, maxItems: Int, maxLength: Int
    ) throws -> [String]? {
        guard let raw = object[key], !(raw is NSNull) else { return nil }
        guard let array = raw as? [Any], array.count <= maxItems else { throw invalid("\(path).\(key)", "Too big") }
        var result: [String] = []
        for item in array {
            guard let value = item as? String, value.utf16.count <= maxLength else {
                throw invalid("\(path).\(key)", "Invalid entry")
            }
            result.append(value)
        }
        return result
    }

    private static func optionalImagePath(_ object: [String: Any], _ key: String, path: String) throws -> String? {
        guard let value = try optionalString(object, key, path: path, max: 512) else { return nil }
        guard isImagePath(value) else { throw invalid("\(path).\(key)", "Invalid string") }
        return value
    }

    private static func trimmedName(_ object: [String: Any], path: String) throws -> String {
        guard let raw = object["name"] as? String else { throw invalid("\(path).name", "expected a string") }
        let value = FoodPackageText.trimmed(raw)
        guard !value.isEmpty else { throw invalid("\(path).name", "Too small") }
        guard value.utf16.count <= 200 else { throw invalid("\(path).name", "Too big") }
        return value
    }

    private static func servingUnit(_ object: [String: Any], path: String) throws -> ServingUnit {
        guard let raw = object["servingUnit"] as? String, let unit = ServingUnit(rawValue: raw) else {
            throw invalid("\(path).servingUnit", "Invalid option")
        }
        return unit
    }

    private static func optionalNumber(_ object: [String: Any], _ key: String, path: String) throws -> Double? {
        guard let raw = object[key], !(raw is NSNull) else { return nil }
        guard let value = number(raw) else { throw invalid("\(path).\(key)", "expected a number") }
        return value
    }

    private static func positive(_ object: [String: Any], _ key: String, path: String) throws -> Double {
        guard let value = number(object[key]) else { throw invalid("\(path).\(key)", "expected a number") }
        guard value > 0 else { throw invalid("\(path).\(key)", "Too small") }
        return value
    }

    private static func nonNegative(_ object: [String: Any], _ key: String, path: String) throws -> Double {
        guard let value = number(object[key]) else { throw invalid("\(path).\(key)", "expected a number") }
        guard value >= 0 else { throw invalid("\(path).\(key)", "Too small") }
        return value
    }
}
