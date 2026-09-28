@testable import Bissbilanz
import Foundation
import SwiftData
import Testing
import UniformTypeIdentifiers

/// Photos kept in memory: the App Group directory `LocalImageStore` writes to does
/// not exist for an unsigned test host.
final class MemoryImageStore: PackageImageStore {
    var files: [String: Data] = [:]
    var removed: [String] = []

    func data(forImageUrl imageUrl: String) -> Data? {
        files[imageUrl]
    }

    func size(forImageUrl imageUrl: String) -> Int? {
        files[imageUrl]?.count
    }

    func save(jpeg: Data) -> String? {
        let url = "file:///memory/local-\(UUID().uuidString).jpg"
        files[url] = jpeg
        return url
    }

    func remove(_ imageUrl: String) {
        files[imageUrl] = nil
        removed.append(imageUrl)
    }
}

private final class FixtureBundleToken {}

/// The 8x8 WebP inside the fixture package, as `sharp` wrote it.
private let fixtureWebP = Data(base64Encoded:
    "UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoIAAgAAoBCJaACdLoAA5gA/uuOX6FPtRTsP/nEv5I/QLtAAAA="
)!

private func fixturePackage() throws -> Data {
    let url = try #require(
        Bundle(for: FixtureBundleToken.self).url(forResource: "food-package", withExtension: "bissbilanz"),
        "Fixtures/FoodPackage/food-package.bissbilanz is missing from the test bundle"
    )
    return try Data(contentsOf: url)
}

@Suite("Local food packages")
@MainActor
struct LocalFoodPackageServiceTests {
    private let now = Date(timeIntervalSince1970: 1_790_589_600)

    @MainActor
    private struct Setup {
        let harness: RepositoryHarness
        let images: MemoryImageStore
        let service: LocalFoodPackageService

        var foods: [Food] { harness.foodRepository.allLocalFoods() }
        var recipes: [Recipe] { harness.recipeRepository.recipes() }

        func food(named name: String) -> Food? {
            foods.first { $0.name == name }
        }
    }

    private func setup(images: MemoryImageStore = MemoryImageStore()) throws -> Setup {
        let harness = try RepositoryHarness(mode: .local)
        let date = now
        return Setup(
            harness: harness,
            images: images,
            service: LocalFoodPackageService(context: harness.context, images: images, now: { date })
        )
    }

    @discardableResult
    private func addFood(
        _ setup: Setup,
        _ name: String,
        brand: String? = nil,
        unit: ServingUnit = .g,
        calories: Double = 100,
        barcode: String? = nil,
        labels: [String] = [],
        imageUrl: String? = nil
    ) async throws -> Food {
        var create = FoodCreate(
            name: name, brand: brand, servingSize: 100, servingUnit: unit,
            calories: calories, protein: 10, carbs: 20, fat: 5, fiber: 3
        )
        create.barcode = barcode
        create.imageUrl = imageUrl
        let food = try await setup.harness.foodRepository.createFood(create)
        if !labels.isEmpty {
            return try await setup.harness.foodRepository.setLabels(id: food.id, labels: labels)
        }
        return food
    }

    @discardableResult
    private func addRecipe(_ setup: Setup, _ name: String, _ ingredients: [(Food, Double, ServingUnit)]) async throws -> Recipe {
        try await setup.harness.recipeRepository.createRecipe(RecipeCreate(
            name: name, totalServings: 2,
            ingredients: ingredients.map { RecipeIngredientInput(foodId: $0.0.id, quantity: $0.1, servingUnit: $0.2) }
        ))
    }

    private func resolutions(
        _ preview: FoodPackagePreview,
        foods: [String: FoodPackageAction] = [:],
        recipes: [String: FoodPackageAction] = [:],
        mappings: [String: String] = [:]
    ) -> FoodPackageResolutions {
        FoodPackageResolutionModel.resolutions(
            for: preview,
            foods: FoodPackageResolutionModel.initial(preview.conflicts.foods.map(\.resolvable))
                .merging(foods) { _, new in new },
            recipes: FoodPackageResolutionModel.initial(preview.conflicts.recipes.map(\.resolvable))
                .merging(recipes) { _, new in new },
            mappings: mappings
        )
    }

    // MARK: - Import

    @Test("Previews the fixture against an empty store: everything is new")
    func previewsFixture() throws {
        let s = try setup()
        let preview = try s.service.preview(fixturePackage())

        #expect(preview.totals.foods == 5)
        #expect(preview.totals.recipes == 1)
        #expect(preview.totals.images == 1)
        #expect(preview.newFoods.count == 5)
        #expect(preview.newFoods.ingredientOnly == 3)
        #expect(preview.newRecipes.count == 1)
        #expect(preview.conflicts.foods.isEmpty)
        #expect(preview.conflicts.recipes.isEmpty)
        #expect(preview.issues.isEmpty)

        let items = preview.newFoods.items
        #expect(items.map(\.name) == ["Haferflocken", "Milch", "Olivenöl", "Pasta", "Tomaten"])
        #expect(items.map(\.isIngredient) == [false, false, true, true, true])
        #expect(items[0].brand == "Alnatura")
        #expect(items[0].calories == 372)
        #expect(items[2].servingUnit == "ml")
        #expect(items[4].recipes == [FoodPackageNewFoodRecipe(ref: "r1", name: "Pasta al pomodoro")])
        #expect(items[0].recipes.isEmpty)
    }

    @Test("Imports the fixture: foods, extended data, photo and recipe")
    func importsFixture() async throws {
        let s = try setup()
        let data = try fixturePackage()
        let preview = try s.service.preview(data)
        let result = try s.service.importPackage(data, resolutions: resolutions(preview))

        #expect(result.created == FoodPackageCounts(foods: 5, recipes: 1))
        #expect(result.replaced == FoodPackageCounts(foods: 0, recipes: 0))
        #expect(result.skipped == FoodPackageCounts(foods: 0, recipes: 0))
        #expect(result.images == 1)
        #expect(result.issues.isEmpty)
        #expect(s.foods.count == 5)
        #expect(s.foods.allSatisfy { LocalStore.isTempId($0.id) })

        let oats = try #require(s.food(named: "Haferflocken"))
        #expect(oats.brand == "Alnatura")
        #expect(oats.servingUnit == .g)
        #expect(oats.calories == 372)
        #expect(oats.protein == 13.5)
        #expect(oats.sodium == 5)
        #expect(oats.iron == 4.6)
        #expect(oats.magnesium == 130)
        #expect(oats.vitaminC == nil)
        #expect(oats.barcode == "4001234567890")
        #expect(oats.nutriScore == "a")
        #expect(oats.novaGroup == 1)
        #expect(oats.additives == [])
        #expect(oats.ingredientsText == "Vollkorn-Haferflocken")
        #expect(oats.labels == ["cereal", "oat"])
        #expect(oats.imageUrl == "https://images.openfoodfacts.org/images/products/400/123/456/789/0/front_de.4.400.jpg")
        #expect(oats.isFavorite == false)

        let pasta = try #require(s.food(named: "Pasta"))
        let photo = try #require(pasta.imageUrl)
        #expect(photo.hasPrefix("file://"))
        #expect(s.images.files[photo] != nil)

        let oil = try #require(s.food(named: "Olivenöl"))
        let tomatoes = try #require(s.food(named: "Tomaten"))
        let recipe = try #require(s.recipes.first)
        #expect(recipe.name == "Pasta al pomodoro")
        #expect(recipe.totalServings == 2)
        #expect(recipe.cookedWeight == 650)
        #expect(recipe.isFavorite == false)
        let ingredients = try #require(recipe.ingredients)
        #expect(ingredients.map(\.foodId) == [pasta.id, tomatoes.id, oil.id])
        #expect(ingredients.map(\.servingUnit) == [.g, .g, .tbsp])
        #expect(ingredients.map(\.sortOrder) == [0, 1, 2])
        // 200 g pasta + 400 g tomatoes + 1 tbsp (15 ml) of oil, per 100 g / 100 ml
        let expected = 350 * 2 + 18 * 4 + 884 * 0.15
        #expect(abs((recipe.calories ?? 0) - expected) < 0.001)
    }

    @Test("A second import of the same package finds everything and asks what to do")
    func secondImportConflicts() async throws {
        let s = try setup()
        let data = try fixturePackage()
        try s.service.importPackage(data, resolutions: resolutions(s.service.preview(data)))
        let again = try s.service.preview(data)

        #expect(again.newFoods.count == 0)
        #expect(again.newFoods.items.isEmpty)
        #expect(again.conflicts.foods.count == 5)
        #expect(again.conflicts.recipes.count == 1)
        let oats = try #require(again.conflicts.foods.first { $0.incoming.name == "Haferflocken" })
        #expect(oats.reason == "barcode_and_name")
        #expect(oats.allowed == [.skip, .replace, .keepBoth])

        // Skip everything: nothing changes.
        let result = try s.service.importPackage(data, resolutions: resolutions(again))
        #expect(result.skipped == FoodPackageCounts(foods: 5, recipes: 1))
        #expect(result.created == FoodPackageCounts(foods: 0, recipes: 0))
        #expect(s.foods.count == 5)
        #expect(s.recipes.count == 1)
    }

    @Test("Keep both adds copies, and a copy of a barcode food carries no barcode")
    func keepBoth() async throws {
        let s = try setup()
        let data = try fixturePackage()
        try s.service.importPackage(data, resolutions: resolutions(s.service.preview(data)))
        let again = try s.service.preview(data)
        let all = Dictionary(uniqueKeysWithValues: again.conflicts.foods.map { ($0.ref, FoodPackageAction.keepBoth) })
        let recipes = Dictionary(uniqueKeysWithValues: again.conflicts.recipes.map { ($0.ref, FoodPackageAction.keepBoth) })
        let result = try s.service.importPackage(data, resolutions: resolutions(again, foods: all, recipes: recipes))

        #expect(result.keptBoth == FoodPackageCounts(foods: 5, recipes: 1))
        #expect(s.foods.count == 10)
        #expect(s.recipes.count == 2)
        #expect(s.foods.filter { $0.barcode != nil }.count == 2)
    }

    @Test("Previews conflicts with the user's own foods, counting diary entries")
    func previewsConflicts() async throws {
        let s = try setup()
        let milk = try await addFood(s, "milch", brand: "MIGROS", unit: .ml, calories: 60)
        try s.harness.context.insert(LocalEntry(
            entry: s.harness.entry(id: "e1", date: "2026-09-27", foodId: milk.id), date: "2026-09-27"
        ))
        try s.harness.context.insert(LocalEntry(
            entry: s.harness.entry(id: "e2", date: "2026-09-28", foodId: milk.id), date: "2026-09-28"
        ))
        try s.harness.context.save()

        let preview = try s.service.preview(fixturePackage())
        #expect(preview.newFoods.count == 4)
        let conflict = try #require(preview.conflicts.foods.first)
        #expect(conflict.ref == "f2")
        #expect(conflict.reason == "name_brand")
        #expect(conflict.existing.id == milk.id)
        #expect(conflict.existing.entryCount == 2)
        #expect(conflict.existing.recipeCount == 0)
        #expect(conflict.incoming.name == "Milch")
        #expect(conflict.incoming.calories == 64)
        #expect(conflict.notes == ["replace_changes_history"])
    }

    @Test("Replace overwrites the food, keeps its identity and refreshes recipes that use it")
    func replaceRefreshesRecipes() async throws {
        let s = try setup()
        let tomatoes = try await addFood(s, "tomaten", calories: 50, labels: ["fruit"])
        let salad = try await addRecipe(s, "Salat", [(tomatoes, 100, .g)])
        #expect(salad.calories == 50)

        let data = try fixturePackage()
        let preview = try s.service.preview(data)
        let conflict = try #require(preview.conflicts.foods.first)
        #expect(conflict.incoming.name == "Tomaten")
        #expect(conflict.notes == ["replace_changes_history"])
        let result = try s.service.importPackage(
            data, resolutions: resolutions(preview, foods: [conflict.ref: .replace])
        )
        #expect(result.replaced == FoodPackageCounts(foods: 1, recipes: 0))
        #expect(result.created == FoodPackageCounts(foods: 4, recipes: 1))

        let replaced = try #require(s.harness.foodRepository.food(id: tomatoes.id))
        #expect(replaced.name == "Tomaten")
        #expect(replaced.calories == 18)
        #expect(replaced.vitaminC == 14)
        #expect(replaced.labels == ["fruit", "tomato"])
        #expect(replaced.updatedAt != nil)
        #expect(s.foods.count == 5)

        let refreshed = try #require(s.harness.recipeRepository.recipe(id: salad.id))
        #expect(abs((refreshed.calories ?? 0) - 18) < 0.001)
        #expect(refreshed.ingredients?.first?.food?.name == "Tomaten")
    }

    @Test("A new food can be swapped for one of the user's own; recipes use it")
    func mapsNewFood() async throws {
        let s = try setup()
        let mine = try await addFood(s, "Meine Nudeln", calories: 360)
        let data = try fixturePackage()
        let preview = try s.service.preview(data)
        let pasta = try #require(preview.newFoods.items.first { $0.name == "Pasta" })

        let result = try s.service.importPackage(
            data, resolutions: resolutions(preview, mappings: [pasta.ref: mine.id])
        )
        #expect(result.created == FoodPackageCounts(foods: 4, recipes: 1))
        #expect(result.skipped == FoodPackageCounts(foods: 1, recipes: 0))
        #expect(s.food(named: "Pasta") == nil)
        // the photo belonged to the mapped food, which is not created
        #expect(result.images == 0)
        #expect(s.images.files.isEmpty)

        let recipe = try #require(s.recipes.first)
        let first = try #require(recipe.ingredients?.first)
        #expect(first.foodId == mine.id)
        #expect(abs((recipe.calories ?? 0) - (360 * 2 + 18 * 4 + 884 * 0.15)) < 0.001)
    }

    @Test("A mapping onto a food of the wrong dimension is refused, and nothing is written")
    func mappingWrongDimension() async throws {
        let s = try setup()
        let water = try await addFood(s, "Wasser", unit: .ml)
        let data = try fixturePackage()
        let preview = try s.service.preview(data)
        let pasta = try #require(preview.newFoods.items.first { $0.name == "Pasta" })

        #expect(throws: FoodPackageError.self) {
            try s.service.importPackage(data, resolutions: resolutions(preview, mappings: [pasta.ref: water.id]))
        }
        #expect(s.foods.count == 1)
        #expect(s.recipes.isEmpty)
        #expect(s.images.files.isEmpty)
    }

    @Test("A preview made before the store changed is stale")
    func stalePreview() async throws {
        let s = try setup()
        let data = try fixturePackage()
        let preview = try s.service.preview(data)
        // Somebody adds "Milch" after the preview: its ref is a conflict now.
        try await addFood(s, "Milch", brand: "Migros", unit: .ml)

        #expect(throws: FoodPackageError.stalePreview) {
            try s.service.importPackage(data, resolutions: resolutions(preview))
        }
        #expect(s.foods.count == 1)
        #expect(s.recipes.isEmpty)
        #expect(s.images.files.isEmpty)
    }

    @Test("Resolutions for another file are refused")
    func packageChanged() throws {
        let s = try setup()
        let data = try fixturePackage()
        let preview = try s.service.preview(data)
        let other = FoodPackageResolutions(
            packageHash: String(repeating: "0", count: 64), foods: [], recipes: [], mappings: []
        )
        #expect(throws: FoodPackageError.packageChanged) { try s.service.importPackage(data, resolutions: other) }
        #expect(preview.packageHash != other.packageHash)
    }

    @Test("Files that are not packages give a specific error")
    func notAPackage() throws {
        let s = try setup()
        #expect(throws: FoodPackageError.notAPackage) { try s.service.preview(Data("just some text".utf8)) }
        #expect(throws: FoodPackageError.empty) { try s.service.preview(Data()) }
        var writer = ZipWriter()
        try writer.add(name: "notes.txt", data: Data("hello".utf8), compress: false)
        let zip = try writer.finish()
        #expect(throws: FoodPackageError.missingManifest) { try s.service.preview(zip) }
    }

    @Test("A bare JSON manifest works like a package without photos")
    func bareManifest() throws {
        let s = try setup()
        let package = try FoodPackageReader.read(fixturePackage())
        let json = try PackageManifestCoding.encode(package.manifest)
        let preview = try s.service.preview(json)
        #expect(preview.newFoods.count == 5)
    }

    @Test("A photo that is not an image is skipped with an issue, the food is still imported")
    func brokenPhoto() throws {
        let s = try setup()
        var manifest = try FoodPackageReader.read(fixturePackage()).manifest
        manifest.foods = manifest.foods.filter { $0.ref == "f4" }
        manifest.foods[0].role = .selected
        manifest.recipes = []
        var writer = ZipWriter()
        try writer.add(name: "bissbilanz-foods.json", data: PackageManifestCoding.encode(manifest), compress: true)
        try writer.add(name: "images/f4.webp", data: Data("not an image".utf8), compress: false)
        let data = try writer.finish()

        let preview = try s.service.preview(data)
        let result = try s.service.importPackage(data, resolutions: resolutions(preview))
        #expect(result.created.foods == 1)
        #expect(result.images == 0)
        #expect(result.issues.map(\.message) == ["\"Pasta\": image could not be read"])
        #expect(s.food(named: "Pasta")?.imageUrl == nil)
    }

    // MARK: - Export

    @Test("Exports one recipe with its ingredient foods, named after it")
    func exportsRecipe() async throws {
        let s = try setup()
        let data = try fixturePackage()
        try s.service.importPackage(data, resolutions: resolutions(s.service.preview(data)))
        let recipe = try #require(s.recipes.first)

        let export = try s.service.export(FoodPackageSelection(recipeIds: [recipe.id], includeRecipes: "none"))
        #expect(export.filename == "Pasta al pomodoro.bissbilanz")
        let file = try FoodPackageReader.read(export.data)
        #expect(file.manifest.formatVersion == 1)
        #expect(file.manifest.exportedAt == "2026-09-28T10:00:00Z")
        #expect(file.manifest.foods.map(\.name) == ["Olivenöl", "Pasta", "Tomaten"])
        #expect(file.manifest.foods.map(\.role) == [.ingredient, .ingredient, .ingredient])
        #expect(file.manifest.foods.map(\.ref) == ["f1", "f2", "f3"])
        let exported = try #require(file.manifest.recipes.first)
        #expect(exported.ref == "r1")
        #expect(exported.name == "Pasta al pomodoro")
        #expect(exported.cookedWeight == 650)
        #expect(exported.ingredients == [
            PackageIngredient(food: "f2", quantity: 200, servingUnit: .g),
            PackageIngredient(food: "f3", quantity: 400, servingUnit: .g),
            PackageIngredient(food: "f1", quantity: 1, servingUnit: .tbsp),
        ])
        let pastaPhoto = try #require(file.manifest.foods[1].image)
        #expect(pastaPhoto == "images/f2.jpg")
        #expect(file.readImages([pastaPhoto])[pastaPhoto]?.isEmpty == false)
    }

    @Test("Exports a single food, all foods, and only what a brand or label selects")
    func exportSelections() async throws {
        let s = try setup()
        let data = try fixturePackage()
        try s.service.importPackage(data, resolutions: resolutions(s.service.preview(data)))
        let oats = try #require(s.food(named: "Haferflocken"))

        let single = try s.service.export(FoodPackageSelection(foodIds: [oats.id], includeRecipes: "none"))
        #expect(single.filename == "Haferflocken.bissbilanz")
        #expect(try FoodPackageReader.read(single.data).manifest.foods.map(\.role) == [.selected])

        let everything = try s.service.export(FoodPackageSelection(all: true, includeRecipes: "all"))
        #expect(everything.filename == "bissbilanz-foods-2026-09-28.bissbilanz")
        let all = try FoodPackageReader.read(everything.data).manifest
        #expect(all.foods.count == 5)
        #expect(all.recipes.count == 1)
        #expect(all.foods.filter { $0.role == .selected }.count == 5)

        // Brand names match case-insensitively; a food with no recipe brings none along.
        let byBrand = try s.service.export(FoodPackageSelection(brands: [" alnatura "], includeRecipes: "related"))
        let brandManifest = try FoodPackageReader.read(byBrand.data).manifest
        #expect(brandManifest.foods.map(\.name) == ["Haferflocken"])
        #expect(brandManifest.recipes.isEmpty)

        // A label selects Tomaten, whose recipe follows with all its ingredients.
        let byLabel = try s.service.export(FoodPackageSelection(labels: ["Tomato"], includeRecipes: "related"))
        let labelManifest = try FoodPackageReader.read(byLabel.data).manifest
        #expect(labelManifest.recipes.map(\.name) == ["Pasta al pomodoro"])
        #expect(labelManifest.foods.map(\.name) == ["Olivenöl", "Pasta", "Tomaten"])
        #expect(labelManifest.foods.map(\.role) == [.ingredient, .ingredient, .selected])
    }

    @Test("Exports nothing for a selection that matches nothing")
    func exportsNothing() throws {
        let s = try setup()
        #expect(throws: FoodPackageError.nothingToExport) {
            try s.service.export(FoodPackageSelection(brands: ["nobody"], includeRecipes: "none"))
        }
    }

    @Test("Summarizes a selection")
    func summarizes() async throws {
        let s = try setup()
        let data = try fixturePackage()
        try s.service.importPackage(data, resolutions: resolutions(s.service.preview(data)))
        let recipe = try #require(s.recipes.first)

        let summary = try s.service.summarize(FoodPackageSelection(recipeIds: [recipe.id], includeRecipes: "none"))
        #expect(summary.foods == 0)
        #expect(summary.recipes == 1)
        #expect(summary.ingredientFoods == 3)
        #expect(summary.images == 1)
        #expect(summary.estimatedBytes >= 4 * 1500)
        #expect(summary.maxBytes == 50 * 1024 * 1024)
        #expect(!summary.overLimit)
    }

    @Test("Photos too large for a package are shrunk or left out")
    func hugePhotoIsLeftOut() async throws {
        let images = MemoryImageStore()
        let s = try setup(images: images)
        let url = "file:///memory/huge.jpg"
        images.files[url] = Data(repeating: 0x42, count: FoodPackageFormat.maxImageEntryBytes + 1)
        try await addFood(s, "Bild", imageUrl: url)
        let export = try s.service.export(FoodPackageSelection(all: true))
        let food = try #require(FoodPackageReader.read(export.data).manifest.foods.first)
        #expect(food.image == nil)
    }

    // MARK: - Round trip

    @Test("A package exported on the device imports on another device unchanged")
    func roundTrip() async throws {
        let sender = try setup()
        let data = try fixturePackage()
        try sender.service.importPackage(data, resolutions: resolutions(sender.service.preview(data)))
        let export = try sender.service.export(FoodPackageSelection(all: true, includeRecipes: "all"))

        let receiver = try setup()
        let preview = try receiver.service.preview(export.data)
        #expect(preview.newFoods.count == 5)
        #expect(preview.newRecipes.count == 1)
        #expect(preview.totals.images == 1)
        let result = try receiver.service.importPackage(export.data, resolutions: resolutions(preview))
        #expect(result.created == FoodPackageCounts(foods: 5, recipes: 1))
        #expect(result.images == 1)

        for name in ["Haferflocken", "Milch", "Olivenöl", "Pasta", "Tomaten"] {
            let from = try #require(sender.food(named: name))
            let to = try #require(receiver.food(named: name))
            #expect(to.brand == from.brand)
            #expect(to.servingSize == from.servingSize)
            #expect(to.servingUnit == from.servingUnit)
            #expect(to.calories == from.calories)
            #expect(to.protein == from.protein)
            #expect(to.sodium == from.sodium)
            #expect(to.saturatedFat == from.saturatedFat)
            #expect(to.vitaminC == from.vitaminC)
            #expect(to.barcode == from.barcode)
            #expect(to.nutriScore == from.nutriScore)
            #expect(to.labels == from.labels)
            #expect(to.id != from.id)
        }
        let recipe = try #require(receiver.recipes.first)
        #expect(abs((recipe.calories ?? 0) - (sender.recipes.first?.calories ?? -1)) < 0.001)
        #expect(recipe.cookedWeight == 650)
        // The photo made it through the device's own writer and reader.
        #expect(receiver.food(named: "Pasta")?.imageUrl?.hasPrefix("file://") == true)
    }

    @Test("Foods and recipes of an on-device export read back through the server's rules")
    func exportedManifestIsValid() async throws {
        let s = try setup()
        let data = try fixturePackage()
        try s.service.importPackage(data, resolutions: resolutions(s.service.preview(data)))
        let export = try s.service.export(FoodPackageSelection(all: true, includeRecipes: "all"))

        let reader = try ZipReader(data: export.data, maxEntries: 100)
        #expect(reader.entries.map(\.name) == [
            "README.txt", "bissbilanz-foods.json", "images/f4.jpg",
        ])
        #expect(reader.entries[0].method == 8)
        #expect(reader.entries[1].method == 8)
        #expect(reader.entries[2].method == 0)
        let manifest = try #require(JSONSerialization.jsonObject(
            with: reader.contents(of: reader.entries[1], limit: 1 << 20)
        ) as? [String: Any])
        #expect(manifest["format"] as? String == "bissbilanz.food-package")
        let foods = try #require(manifest["foods"] as? [[String: Any]])
        for food in foods {
            for key in FoodPackageFormat.nutrientKeys {
                #expect(food.keys.contains(key), "\(key) missing from \(food["name"] ?? "")")
            }
            #expect(food.keys.contains("image") && food.keys.contains("imageUrl"))
        }
    }

    // MARK: - Facets

    @Test("Lists brands and labels with counts")
    func facets() async throws {
        let s = try setup()
        try await addFood(s, "A", brand: "Migros", labels: ["bread"])
        try await addFood(s, "B", brand: " migros ", labels: ["bread", "bun"])
        try await addFood(s, "C", brand: "Coop")
        try await addFood(s, "D")

        let brands = s.service.brandStats()
        #expect(brands.map(\.count) == [2, 1])
        #expect(brands[1].brand == "Coop")
        #expect(brands[0].brand.lowercased() == "migros")
        #expect(s.service.labelStats() == [FoodLabelStat(label: "bread", count: 2), FoodLabelStat(label: "bun", count: 1)])
    }

    // MARK: - Files

    @Test("A shared file keeps the package's own name in a folder of its own")
    func shareFile() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try FoodPackageShareFile.write(
            FoodPackageExport(data: Data("one".utf8), filename: "Käsespätzle.bissbilanz"), root: root
        )
        #expect(first.lastPathComponent == "Käsespätzle.bissbilanz")
        #expect(try Data(contentsOf: first) == Data("one".utf8))
        let second = try FoodPackageShareFile.write(
            FoodPackageExport(data: Data("two".utf8), filename: "../../evil.bissbilanz"), root: root
        )
        #expect(second.lastPathComponent == "evil.bissbilanz")
        #expect(second.path.hasPrefix(root.path))
        #expect(try Data(contentsOf: second) == Data("two".utf8))
    }

    @Test("A file handed over by another app is copied, under its name")
    func stagesIncomingFile() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("inbox-\(UUID().uuidString)")
        let source = root.appendingPathComponent("Downloads/Lasagne.bissbilanz")
        try FileManager.default.createDirectory(at: source.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("package".utf8).write(to: source)
        defer { try? FileManager.default.removeItem(at: root) }

        let staged = try FoodPackageInbox.stage(source, root: root.appendingPathComponent("tmp"))
        #expect(staged.lastPathComponent == "Lasagne.bissbilanz")
        #expect(staged != source)
        #expect(try Data(contentsOf: staged) == Data("package".utf8))
        // The original is untouched.
        #expect(FileManager.default.fileExists(atPath: source.path))
    }

    @Test("A file that is not there cannot be staged")
    func stagingMissingFile() {
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("nope-\(UUID().uuidString).bissbilanz")
        #expect(throws: (any Error).self) { try FoodPackageInbox.stage(missing) }
    }

    @Test("The package type is declared for the bissbilanz extension")
    func packageType() {
        #expect(UTType.foodPackage.identifier == "com.bissbilanz.food-package")
        #expect(UTType.foodPackage.conforms(to: .zip))
    }
}
