import Foundation
import SwiftData

/// The SwiftData write `QuickAddFoodIntent.perform()` performs, factored out
/// so it's testable without invoking the `AppIntent` machinery (which needs a
/// live `ModelContainer`/`AppDependencyManager` context tests don't set up).
enum QuickAddWriter {
    enum WriteError: Error {
        case foodNotFound(String)
    }

    /// Inserts a `LocalEntry` for `foodId` and, in Synced mode, enqueues the
    /// matching `PendingSyncOperation` — the same optimistic-write shape
    /// `EntryRepository.createEntry` produces for the in-app log path, minus
    /// the HealthKit sync and Spotlight donation steps (both app-only and
    /// unnecessary for a background widget action). Does not call
    /// `context.save()` — the caller controls when the write is committed.
    @discardableResult
    static func write(
        foodId: String,
        meal: MealTypeAppEnum,
        servings: Double,
        in context: ModelContext,
        isLocal: Bool
    ) throws -> Entry {
        let id = foodId
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate<LocalFood> { $0.id == id })
        descriptor.fetchLimit = 1
        guard let row = (try? context.fetch(descriptor))?.first, let food = row.toFood() else {
            throw WriteError.foodNotFound(foodId)
        }

        let create = EntryCreate(
            foodId: foodId,
            mealType: meal.serverValue,
            servings: max(servings, 0.0001),
            date: DateFormatting.today
        )
        let entry = EntryFactory.makeEntry(from: create, id: LocalStore.makeTempId(), food: food, recipe: nil)
        context.insert(LocalEntry(entry: entry, date: create.date))

        if !isLocal {
            let seq = PendingSyncOperation.nextSeq(in: context)
            context.insert(PendingSyncOperation(seq: seq, operation: .createEntry(body: create, localId: entry.id)))
        }

        return entry
    }
}
