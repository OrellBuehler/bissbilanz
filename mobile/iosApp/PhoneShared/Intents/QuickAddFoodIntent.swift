import AppIntents
import Foundation
import SwiftData

/// `Button(intent:)` action for one-tap logging of a favorite from a widget —
/// the Favorites widget's per-tile button and every row of the Quick Add
/// widget. Unlike `LogFoodIntent` (Siri/Shortcuts, runs in the *main app*
/// process because the system background-launches the host app to service
/// it), WidgetKit runs a widget button's intent inside the **widget
/// extension's own process**. That process never had `BissbilanzApp.init()`
/// run, so `EntryWriter`'s `AppDependencyManager` registration doesn't exist
/// there — this intent opens its own minimal SwiftData container against the
/// same App Group store instead of depending on it.
///
/// Deliberately not registered in `BissbilanzShortcuts` (it's a widget-only
/// action, not a Siri phrase) and doesn't use `FoodEntity`/`EntityQuery`
/// (that resolves via `EntryWriter.searchFoods`, which calls the network —
/// unavailable and unnecessary here, since the calling widget already has the
/// concrete favorite's id/name from the cached `WidgetSnapshot`).
struct QuickAddFoodIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Quick Add"
    }

    static var description: IntentDescription {
        IntentDescription("Log a favorite food to today's diary with one tap.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    @Parameter(title: "Food ID")
    var foodId: String

    /// Display-only — not used to resolve the write, just kept so a future
    /// confirmation surface (if any) doesn't need a second store read.
    @Parameter(title: "Food Name")
    var foodName: String

    @Parameter(title: "Servings", default: 1.0)
    var servings: Double

    @Parameter(title: "Meal")
    var meal: MealTypeAppEnum?

    init() {
        foodId = ""
        foodName = ""
        servings = 1.0
        meal = nil
    }

    init(foodId: String, foodName: String, servings: Double = 1.0, meal: MealTypeAppEnum? = nil) {
        self.foodId = foodId
        self.foodName = foodName
        self.servings = servings
        self.meal = meal
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard !foodId.isEmpty else { return .result() }

        let isLocal = AppModeSnapshot.isLocal
        let container = LocalStore.extensionContainer(
            cloudKitEnabled: isLocal,
            onError: { error, context in
                QuickAddDiagnostics.record(phase: context["phase"] as? String ?? "container", error: error)
            }
        )
        let context = ModelContext(container)

        do {
            try QuickAddWriter.write(
                foodId: foodId,
                meal: meal ?? .forCurrentTime(),
                servings: servings,
                in: context,
                isLocal: isLocal
            )
            try context.save()
        } catch let error as QuickAddWriter.WriteError {
            QuickAddDiagnostics.record(phase: "food_not_found", error: error)
            return .result()
        } catch {
            QuickAddDiagnostics.record(phase: "save", error: error)
            return .result()
        }

        let localeCode = WidgetSnapshotStore.currentLocaleCode()
        let snapshot = WidgetSnapshotWriter.buildSnapshot(context: context, localeCode: localeCode)
        WidgetSnapshotWriter.saveAndReload(snapshot)

        return .result()
    }
}
