import Foundation
import SwiftData

/// A package built by the server or on the device, ready to share.
struct FoodPackageExport {
    let data: Data
    /// `<Recipe name>.bissbilanz`, `<Food name>.bissbilanz` or `bissbilanz-foods-YYYY-MM-DD.bissbilanz`.
    let filename: String
}

/// Where food packages are built and applied: the server when signed in, the
/// on-device store in local mode. Both speak the same preview and resolution
/// types, so the export and import screens work unchanged in either.
@MainActor
protocol FoodPackageBackend {
    func brandStats() async throws -> [FoodBrandStat]
    func labelStats() async throws -> [FoodLabelStat]
    func summarize(_ selection: FoodPackageSelection) async throws -> FoodPackageSummary
    func export(_ selection: FoodPackageSelection) async throws -> FoodPackageExport
    func preview(_ data: Data, filename: String) async throws -> FoodPackagePreview
    func importPackage(
        _ data: Data,
        filename: String,
        resolutions: FoodPackageResolutions
    ) async throws -> FoodPackageImportResult
}

@MainActor
struct ServerFoodPackageBackend: FoodPackageBackend {
    let api: BissbilanzAPI
    let foodRepository: FoodRepository
    let recipeRepository: RecipeRepository

    func brandStats() async throws -> [FoodBrandStat] {
        try await api.getFoodBrands()
    }

    func labelStats() async throws -> [FoodLabelStat] {
        try await api.getFoodLabelStats()
    }

    func summarize(_ selection: FoodPackageSelection) async throws -> FoodPackageSummary {
        try await api.summarizeFoodPackage(selection)
    }

    func export(_ selection: FoodPackageSelection) async throws -> FoodPackageExport {
        try await api.exportFoodPackage(selection)
    }

    func preview(_ data: Data, filename: String) async throws -> FoodPackagePreview {
        try await api.previewFoodPackage(data, filename: filename)
    }

    func importPackage(
        _ data: Data,
        filename: String,
        resolutions: FoodPackageResolutions
    ) async throws -> FoodPackageImportResult {
        let result = try await api.importFoodPackage(data, filename: filename, resolutions: resolutions)
        // Pull the new and replaced rows into the local store.
        do {
            try await foodRepository.mirrorAll()
            try await recipeRepository.refresh()
        } catch {
            ErrorReporter.capture(error)
        }
        return result
    }
}

extension LocalFoodPackageService: FoodPackageBackend {
    /// Both steps run on the main actor, so a moment is given first for the spinner
    /// the screen just asked for to appear.
    func preview(_ data: Data, filename _: String) async throws -> FoodPackagePreview {
        try? await Task.sleep(nanoseconds: 60_000_000)
        return try preview(data)
    }

    func importPackage(
        _ data: Data,
        filename _: String,
        resolutions: FoodPackageResolutions
    ) async throws -> FoodPackageImportResult {
        try? await Task.sleep(nanoseconds: 60_000_000)
        return try importPackage(data, resolutions: resolutions)
    }
}

enum FoodPackageBackends {
    /// The backend for the current mode. In local mode there is no server to ask, so
    /// the package is built and applied against the on-device store.
    @MainActor
    static func make(
        appMode: AppModeManager,
        api: BissbilanzAPI,
        foodRepository: FoodRepository,
        recipeRepository: RecipeRepository,
        context: ModelContext
    ) -> any FoodPackageBackend {
        if appMode.isLocal {
            return LocalFoodPackageService(context: context)
        }
        return ServerFoodPackageBackend(api: api, foodRepository: foodRepository, recipeRepository: recipeRepository)
    }
}
