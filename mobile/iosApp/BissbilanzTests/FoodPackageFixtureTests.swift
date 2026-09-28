@testable import Bissbilanz
import Foundation
import SwiftData
import Testing
import UIKit

private final class SharedFixtureToken {}

private func fixture(_ name: String) throws -> Data {
    let url = try #require(
        Bundle(for: SharedFixtureToken.self).url(forResource: name, withExtension: "bissbilanz"),
        "Fixtures/FoodPackage/\(name).bissbilanz is missing from the test bundle"
    )
    return try Data(contentsOf: url)
}

/// Packages the other platforms wrote: the server-shaped export and the Android export
/// (its photos are deflated, the server's are stored). Both must import here, and what
/// this device exports must read back the same.
@Suite("Shared food package fixtures")
@MainActor
struct FoodPackageFixtureTests {
    private func store() throws -> (harness: RepositoryHarness, images: MemoryImageStore, service: LocalFoodPackageService) {
        let harness = try RepositoryHarness(mode: .local)
        let images = MemoryImageStore()
        return (harness, images, LocalFoodPackageService(context: harness.context, images: images))
    }

    @Test("Imports a package from the server or the Android app", arguments: ["server-export", "android-export"])
    func importsPackage(name: String) throws {
        let (harness, images, service) = try store()
        let data = try fixture(name)
        let preview = try service.preview(data)

        #expect(preview.newFoods.items.map(\.name) == ["Bio Haferflocken", "Bündner Käse", "Honig", "Vollmilch"])
        #expect(preview.newFoods.items.map(\.isIngredient) == [false, false, true, false])
        #expect(preview.newRecipes.count == 1)
        #expect(preview.totals.images == 2)
        #expect(preview.conflicts.foods.isEmpty)
        #expect(preview.issues.isEmpty)

        let result = try service.importPackage(
            data, resolutions: FoodPackageResolutionModel.resolutions(for: preview, foods: [:], recipes: [:])
        )
        #expect(result.created == FoodPackageCounts(foods: 4, recipes: 1))
        #expect(result.images == 2)
        #expect(images.files.count == 2)

        let foods = harness.foodRepository.allLocalFoods()
        let oats = try #require(foods.first { $0.name == "Bio Haferflocken" })
        #expect(oats.barcode == "7610200000001")
        #expect(oats.imageUrl?.hasPrefix("file://") == true)
        #expect(foods.first { $0.name == "Vollmilch" }?.servingUnit == .ml)

        let recipe = try #require(harness.recipeRepository.recipes().first)
        #expect(recipe.name == "Porridge")
        #expect(recipe.imageUrl?.hasPrefix("file://") == true)
        #expect(recipe.ingredients?.map(\.quantity) == [80, 300, 20])
        #expect(recipe.ingredients?.map(\.servingUnit) == [.g, .ml, .g])
        #expect((recipe.calories ?? 0) > 0)
    }

    @Test("The device's own export of an imported package reads back with the same foods")
    func reExportsPackage() throws {
        let (harness, _, service) = try store()
        let data = try fixture("server-export")
        let preview = try service.preview(data)
        try service.importPackage(
            data, resolutions: FoodPackageResolutionModel.resolutions(for: preview, foods: [:], recipes: [:])
        )
        let export = try service.export(FoodPackageSelection(all: true, includeRecipes: "all"))
        let written = try FoodPackageReader.read(export.data).manifest
        let original = try FoodPackageReader.read(data).manifest

        #expect(written.foods.map(\.name) == original.foods.map(\.name))
        #expect(written.foods.map(\.servingUnit) == original.foods.map(\.servingUnit))
        #expect(written.foods.map(\.barcode) == original.foods.map(\.barcode))
        #expect(written.recipes.map(\.name) == original.recipes.map(\.name))
        #expect(written.recipes.first?.ingredients == original.recipes.first?.ingredients)
        #expect(harness.recipeRepository.recipes().count == 1)

        // Regenerate the checked-in iOS export the server test reads:
        // UPDATE_FIXTURES=1 xcodebuild test ... -only-testing:BissbilanzTests/FoodPackageFixtureTests
        if ProcessInfo.processInfo.environment["UPDATE_FIXTURES"] != nil {
            let target = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .appendingPathComponent("Fixtures/FoodPackage/ios-export.bissbilanz")
            try export.data.write(to: target)
        }
    }

    @Test("Reads photos stored as jpg and png as well as webp")
    func readsOtherPhotoFormats() throws {
        let (harness, images, service) = try store()
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
        let png = renderer.pngData { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let jpg = renderer.jpegData(withCompressionQuality: 0.8) { context in
            UIColor.blue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        func food(_ ref: String, _ name: String, _ image: String) -> PackageFood {
            PackageFood(
                ref: ref, name: name, brand: nil, servingSize: 100, servingUnit: .g,
                calories: 1, protein: 1, carbs: 1, fat: 1, fiber: 1, image: image
            )
        }
        let manifest = PackageManifest(
            exportedAt: nil,
            foods: [food("f1", "Rot", "images/f1.png"), food("f2", "Blau", "images/f2.jpg")],
            recipes: []
        )
        var writer = ZipWriter()
        try writer.add(name: "bissbilanz-foods.json", data: PackageManifestCoding.encode(manifest), compress: true)
        try writer.add(name: "images/f1.png", data: png, compress: false)
        try writer.add(name: "images/f2.jpg", data: jpg, compress: true)
        let data = try writer.finish()

        let preview = try service.preview(data)
        let result = try service.importPackage(
            data, resolutions: FoodPackageResolutionModel.resolutions(for: preview, foods: [:], recipes: [:])
        )
        #expect(result.images == 2)
        #expect(result.issues.isEmpty)
        #expect(images.files.count == 2)
        #expect(harness.foodRepository.allLocalFoods().allSatisfy { $0.imageUrl != nil })
    }
}
