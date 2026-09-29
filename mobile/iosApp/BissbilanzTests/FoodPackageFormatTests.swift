@testable import Bissbilanz
import Foundation
import Testing

@Suite("Food package text rules")
struct FoodPackageTextTests {
    @Test("normalize matches the server: case, accents and white space")
    func normalize() {
        #expect(FoodPackageText.normalize("Müsli  Crunchy") == "musli crunchy")
        #expect(FoodPackageText.normalize("  MIGROS ") == "migros")
        #expect(FoodPackageText.normalize("Crème\tbrûlée\n") == "creme brulee")
        #expect(FoodPackageText.normalize("Käse (mild)") == "kase (mild)")
        #expect(FoodPackageText.normalize(nil) == "")
        #expect(FoodPackageText.normalize("") == "")
    }

    @Test("Non-breaking and ideographic spaces collapse like JavaScript's \\s")
    func unicodeWhitespace() {
        #expect(FoodPackageText.normalize("a\u{00A0}\u{3000}b") == "a b")
        #expect(FoodPackageText.trimmed("\u{FEFF} x \u{2003}") == "x")
    }

    @Test("A food's identity is name and brand together")
    func foodKey() {
        #expect(FoodPackageText.foodKey(name: "Milk", brand: nil) == "milk\u{0}")
        #expect(FoodPackageText.foodKey(name: "MILK", brand: " Coop ") == FoodPackageText.foodKey(name: "milk", brand: "coop"))
        #expect(FoodPackageText.foodKey(name: "Milk", brand: "Coop") != FoodPackageText.foodKey(name: "Milk", brand: "Migros"))
    }

    @Test("A blank barcode is no barcode")
    func barcode() {
        #expect(FoodPackageText.trimBarcode(" 42 ") == "42")
        #expect(FoodPackageText.trimBarcode("   ") == nil)
        #expect(FoodPackageText.trimBarcode(nil) == nil)
    }
}

@Suite("Food package file names")
struct FoodPackageFilenameTests {
    private let date = Date(timeIntervalSince1970: 1_790_589_600) // 2026-09-28T10:00:00Z
    private let generic = "bissbilanz-foods-2026-09-28.bissbilanz"

    @Test("A single recipe or food names the file")
    func singleItem() {
        #expect(FoodPackageFilename.packageFilename(recipes: ["Lasagne"], foods: [], date: date) == "Lasagne.bissbilanz")
        #expect(FoodPackageFilename.packageFilename(recipes: [], foods: ["Vollmilch"], date: date) == "Vollmilch.bissbilanz")
        #expect(FoodPackageFilename.packageFilename(recipes: ["Käsespätzle"], foods: [], date: date) == "Käsespätzle.bissbilanz")
    }

    @Test("Anything else gets the generic dated name")
    func genericName() {
        let name = generic
        #expect(FoodPackageFilename.packageFilename(recipes: [], foods: [], date: date) == name)
        #expect(FoodPackageFilename.packageFilename(recipes: ["A", "B"], foods: [], date: date) == name)
        #expect(FoodPackageFilename.packageFilename(recipes: [], foods: ["A", "B"], date: date) == name)
        #expect(FoodPackageFilename.packageFilename(recipes: ["A"], foods: ["B"], date: date) == name)
    }

    @Test("A name with nothing usable left falls back to the generic name")
    func unusableName() {
        #expect(FoodPackageFilename.packageFilename(recipes: ["///"], foods: [], date: date) == generic)
        #expect(FoodPackageFilename.packageFilename(recipes: ["  ...  "], foods: [], date: date) == generic)
    }

    @Test("Separators, quotes, reserved and control characters go")
    func sanitizes() {
        #expect(FoodPackageFilename.sanitizeBase("a/b\\c:d*e?f\"g<h>i|j\u{0}k\nl") == "a b c d e f g h i j k l")
        #expect(FoodPackageFilename.sanitizeBase("Oma's \"Kuchen\"") == "Oma s Kuchen")
    }

    @Test("A name cannot escape the directory or hide the file")
    func cannotEscape() {
        #expect(FoodPackageFilename.sanitizeBase("../../etc/passwd") == "etc passwd")
        #expect(FoodPackageFilename.sanitizeBase(".hidden") == "hidden")
        #expect(FoodPackageFilename.sanitizeBase("name. ") == "name")
    }

    @Test("Windows device names get an underscore")
    func windowsNames() {
        #expect(FoodPackageFilename.sanitizeBase("CON") == "CON_")
        #expect(FoodPackageFilename.sanitizeBase("com1") == "com1_")
        #expect(FoodPackageFilename.sanitizeBase("Console") == "Console")
    }

    @Test("The length is capped at 80 characters")
    func capsLength() {
        #expect(FoodPackageFilename.sanitizeBase(String(repeating: "x", count: 200)).count == 80)
        #expect(FoodPackageFilename.sanitizeBase(String(repeating: "ä", count: 200)).unicodeScalars.count == 80)
    }

    @Test("Uses the UTF-8 name of the server's Content-Disposition when there is one")
    func contentDisposition() {
        let header = "attachment; filename=\"Kaesespaetzle.bissbilanz\"; "
            + "filename*=UTF-8''K%C3%A4sesp%C3%A4tzle.bissbilanz"
        #expect(FoodPackageFilename.filename(fromContentDisposition: header) == "Käsespätzle.bissbilanz")
    }

    @Test("Falls back to the plain filename, and to nothing")
    func contentDispositionFallbacks() {
        #expect(FoodPackageFilename.filename(fromContentDisposition: "attachment; filename=\"Lasagne.bissbilanz\"") == "Lasagne.bissbilanz")
        #expect(FoodPackageFilename.filename(fromContentDisposition: "attachment") == nil)
        #expect(FoodPackageFilename.filename(fromContentDisposition: nil) == nil)
    }

    @Test("Decodes the characters encodeURIComponent leaves alone")
    func contentDispositionEscapes() {
        let header = "attachment; filename=\"Oma (1) best.bissbilanz\"; "
            + "filename*=UTF-8''Oma%20%281%29%20%2Abest%2A.bissbilanz"
        #expect(FoodPackageFilename.filename(fromContentDisposition: header) == "Oma (1) *best*.bissbilanz")
    }

    @Test("A path in the header is cut down to its file name")
    func contentDispositionCannotEscape() {
        #expect(FoodPackageFilename.filename(fromContentDisposition: "attachment; filename=\"../../evil.bissbilanz\"") == "evil.bissbilanz")
        #expect(FoodPackageFilename.filename(fromContentDisposition: "attachment; filename=\"..\"") == nil)
        #expect(FoodPackageFilename.safeFileName("a\u{0}b.bissbilanz") == "ab.bissbilanz")
    }
}

@Suite("Food package manifest")
struct PackageManifestTests {
    private func manifestJSON(_ mutate: (inout [String: Any]) -> Void = { _ in }) -> Data {
        var food: [String: Any] = [
            "ref": "f1", "role": "selected", "name": " Oats ", "brand": NSNull(),
            "servingSize": 100, "servingUnit": "g", "calories": 380, "protein": 13,
            "carbs": 67, "fat": 7, "fiber": 10, "sodium": 5, "iron": NSNull(),
            "labels": ["oat"], "image": "images/f1.webp",
        ]
        mutate(&food)
        let root: [String: Any] = [
            "format": "bissbilanz.food-package", "formatVersion": 1, "foods": [food], "recipes": [],
        ]
        return try! JSONSerialization.data(withJSONObject: root)
    }

    private func parse(_ mutate: (inout [String: Any]) -> Void = { _ in }) throws -> PackageManifest {
        try PackageManifestCoding.parse(manifestJSON(mutate))
    }

    private func expectInvalid(_ path: String, _ mutate: (inout [String: Any]) -> Void) {
        do {
            _ = try parse(mutate)
            Issue.record("expected \(path) to be rejected")
        } catch let FoodPackageError.invalid(detail) {
            #expect(detail.hasPrefix("foods.0.\(path) —"), "got \(detail)")
        } catch {
            Issue.record("unexpected error \(error)")
        }
    }

    @Test("Reads a food, trimming its name and keeping only the nutrients it has")
    func readsFood() throws {
        let manifest = try parse()
        let food = try #require(manifest.foods.first)
        #expect(food.name == "Oats")
        #expect(food.brand == nil)
        #expect(food.servingUnit == .g)
        #expect(food.nutrients == ["sodium": 5])
        #expect(food.image == "images/f1.webp")
        #expect(food.labels == ["oat"])
        #expect(manifest.recipes.isEmpty)
    }

    @Test("Role defaults to selected")
    func defaultRole() throws {
        #expect(try parse { $0["role"] = nil }.foods[0].role == .selected)
        #expect(try parse { $0["role"] = "ingredient" }.foods[0].role == .ingredient)
    }

    @Test("Rejects what the server's schema rejects")
    func rejectsInvalid() {
        expectInvalid("ref") { $0["ref"] = "food1" }
        expectInvalid("ref") { $0["ref"] = "f1234567" }
        expectInvalid("name") { $0["name"] = "   " }
        expectInvalid("name") { $0["name"] = String(repeating: "x", count: 201) }
        expectInvalid("servingSize") { $0["servingSize"] = 0 }
        expectInvalid("servingUnit") { $0["servingUnit"] = "pinch" }
        expectInvalid("calories") { $0["calories"] = -1 }
        expectInvalid("protein") { $0["protein"] = "13" }
        expectInvalid("sodium") { $0["sodium"] = -0.5 }
        expectInvalid("nutriScore") { $0["nutriScore"] = "f" }
        expectInvalid("novaGroup") { $0["novaGroup"] = 5 }
        expectInvalid("novaGroup") { $0["novaGroup"] = 2.5 }
        expectInvalid("image") { $0["image"] = "../evil.webp" }
        expectInvalid("image") { $0["image"] = "images/sub/f1.webp" }
        expectInvalid("image") { $0["image"] = "images/F1.webp" }
        expectInvalid("image") { $0["image"] = "images/f1.gif" }
        expectInvalid("role") { $0["role"] = "boss" }
        expectInvalid("barcode") { $0["barcode"] = String(repeating: "1", count: 65) }
        expectInvalid("labels") { $0["labels"] = Array(repeating: "x", count: 41) }
    }

    @Test("Accepts jpg, jpeg, png and webp images")
    func imagePaths() {
        for path in ["images/f1.webp", "images/f1.jpg", "images/f2.jpeg", "images/r3.png"] {
            #expect(PackageManifestCoding.isImagePath(path))
        }
        for path in ["images/.webp", "images/f1", "f1.webp", "images/a-b.webp", "images/f1.webp/x"] {
            #expect(!PackageManifestCoding.isImagePath(path))
        }
    }

    @Test("Rejects duplicate refs and dangling recipe shapes")
    func duplicates() throws {
        let food = ["ref": "f1", "name": "A", "servingSize": 1, "servingUnit": "g", "calories": 1,
                    "protein": 0, "carbs": 0, "fat": 0, "fiber": 0] as [String: Any]
        let root: [String: Any] = ["format": "bissbilanz.food-package", "formatVersion": 1, "foods": [food, food]]
        #expect(throws: FoodPackageError.invalid("foods.1.ref — Duplicate ref")) {
            try PackageManifestCoding.parse(JSONSerialization.data(withJSONObject: root))
        }
    }

    @Test("Reads recipes with their ingredients")
    func recipes() throws {
        let food = ["ref": "f1", "name": "Flour", "servingSize": 100, "servingUnit": "g", "calories": 350,
                    "protein": 10, "carbs": 70, "fat": 1, "fiber": 3] as [String: Any]
        let recipe: [String: Any] = [
            "ref": "r1", "name": " Bread ", "totalServings": 4, "cookedWeight": 800,
            "ingredients": [["food": "f1", "quantity": 500, "servingUnit": "g"]],
        ]
        let root: [String: Any] = [
            "format": "bissbilanz.food-package", "formatVersion": 1, "foods": [food], "recipes": [recipe],
        ]
        let manifest = try PackageManifestCoding.parse(JSONSerialization.data(withJSONObject: root))
        let parsed = try #require(manifest.recipes.first)
        #expect(parsed.name == "Bread")
        #expect(parsed.cookedWeight == 800)
        #expect(parsed.ingredients == [PackageIngredient(food: "f1", quantity: 500, servingUnit: .g)])
    }

    @Test("Rejects a recipe ingredient with a bad quantity")
    func badIngredient() {
        let recipe: [String: Any] = [
            "ref": "r1", "name": "Bread", "totalServings": 4,
            "ingredients": [["food": "f1", "quantity": 0, "servingUnit": "g"]],
        ]
        let root: [String: Any] = ["format": "bissbilanz.food-package", "formatVersion": 1, "foods": [], "recipes": [recipe]]
        #expect(throws: FoodPackageError.invalid("recipes.0.ingredients.0.quantity — Too small")) {
            try PackageManifestCoding.parse(JSONSerialization.data(withJSONObject: root))
        }
    }

    @Test("Tells a food package from an account export, a newer format and other JSON")
    func otherFiles() throws {
        let account = try JSONSerialization.data(withJSONObject: ["formatVersion": 1, "foods": [Any]()])
        #expect(throws: FoodPackageError.accountExport) { try PackageManifestCoding.parse(account) }

        let other = try JSONSerialization.data(withJSONObject: ["format": "something.else", "foods": [Any]()])
        #expect(throws: FoodPackageError.notAPackage) { try PackageManifestCoding.parse(other) }

        let newer = try JSONSerialization.data(withJSONObject: [
            "format": "bissbilanz.food-package", "formatVersion": 2, "foods": [Any](),
        ])
        #expect(throws: FoodPackageError.newerVersion) { try PackageManifestCoding.parse(newer) }

        #expect(throws: FoodPackageError.notAPackage) { try PackageManifestCoding.parse(Data("hello".utf8)) }
        #expect(throws: FoodPackageError.notAPackage) { try PackageManifestCoding.parse(Data("[1,2]".utf8)) }
    }

    @Test("Accepts a byte order mark before the JSON")
    func byteOrderMark() throws {
        let manifest = try PackageManifestCoding.parse(Data([0xEF, 0xBB, 0xBF]) + manifestJSON())
        #expect(manifest.foods.count == 1)
    }

    @Test("Writes every extended nutrient, with null for the ones a food lacks")
    func encodesLikeTheExporter() throws {
        let food = PackageFood(
            ref: "f1", role: .ingredient, name: "Oats", brand: nil, servingSize: 100, servingUnit: .g,
            calories: 380, protein: 13, carbs: 67, fat: 7, fiber: 10, nutrients: ["sodium": 5.5],
            labels: ["oat"], image: "images/f1.webp"
        )
        let manifest = PackageManifest(exportedAt: "2026-09-28T10:00:00Z", foods: [food], recipes: [])
        let data = try PackageManifestCoding.encode(manifest)
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(json["format"] as? String == "bissbilanz.food-package")
        #expect(json["formatVersion"] as? Int == 1)
        let foods = try #require(json["foods"] as? [[String: Any]])
        let written = try #require(foods.first)
        #expect(written["sodium"] as? Double == 5.5)
        #expect(written["iron"] is NSNull)
        #expect(written["brand"] is NSNull)
        #expect(written["role"] as? String == "ingredient")
        for key in FoodPackageFormat.nutrientKeys {
            #expect(written[key] != nil, "\(key) is missing")
        }
        // and it reads back as what was written
        #expect(try PackageManifestCoding.parse(data) == manifest)
    }

    @Test("The nutrient list matches the app's catalog")
    func nutrientKeysMatchCatalog() {
        let catalog = NutrientCatalog.categories.flatMap { $0.nutrients.map(\.key) }
        #expect(FoodPackageFormat.nutrientKeys == catalog)
        #expect(FoodPackageFormat.nutrientKeys.count == 43)
    }
}
