@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Chat data refresh")
@MainActor
struct ChatDataRefresherTests {
    private static func refresher(_ harness: RepositoryHarness) -> ChatDataRefresher {
        ChatDataRefresher(
            entryRepository: harness.entryRepository,
            foodRepository: harness.foodRepository,
            recipeRepository: harness.recipeRepository,
            goalsRepository: harness.goalsRepository,
            weightRepository: harness.weightRepository,
            sleepRepository: harness.sleepRepository,
            supplementRepository: harness.supplementRepository,
            reminderRepository: harness.reminderRepository,
            preferencesRepository: harness.preferencesRepository,
            fastingManager: FastingTimerManager(
                entryRepository: harness.entryRepository, syncManager: harness.syncManager, api: harness.api
            )
        )
    }

    private static func seedRecipeDay(_ harness: RepositoryHarness, date: String) throws {
        harness.context.insert(LocalRecipe(recipe: try harness.recipe(id: "r1", name: "Bowl", ingredientFoodId: "f1")))
        harness.context.insert(LocalEntry(entry: try harness.entry(id: "e1", date: date, recipeId: "r1"), date: date))
        try harness.context.save()
        harness.stub("GET", "/api/entries", json: #"{"entries": []}"#)
    }

    @Test("A changed food re-pulls the recent days of the recipes made with it")
    func foodRefreshesRecipeDays() async throws {
        let harness = try RepositoryHarness()
        let today = DateFormatting.today
        try Self.seedRecipeDay(harness, date: today)
        let plan = ChatRefreshPlan(changes: [ChatChange(domain: "foods", ids: ["f1"])])
        await Self.refresher(harness).run(plan, isCurrent: { true })
        #expect(harness.recordedQueries("GET", "/api/entries").contains { $0.contains(today) })
    }

    @Test("A changed recipe re-pulls the recent days it is logged on")
    func recipeRefreshesItsDays() async throws {
        let harness = try RepositoryHarness()
        let today = DateFormatting.today
        try Self.seedRecipeDay(harness, date: today)
        harness.stub("GET", "/api/recipes", json: #"{"recipes": []}"#)
        let plan = ChatRefreshPlan(changes: [ChatChange(domain: "recipes", ids: ["r1"])])
        await Self.refresher(harness).run(plan, isCurrent: { true })
        #expect(harness.recordedQueries("GET", "/api/entries").contains { $0.contains(today) })
        #expect(harness.recordedRequests.contains("GET /api/recipes"))
    }

    @Test("A plan of a signed-out account pulls nothing")
    func staleAccountPullsNothing() async throws {
        let harness = try RepositoryHarness()
        let plan = ChatRefreshPlan(changes: [
            ChatChange(domain: "entries", dates: ["2026-11-18"]),
            ChatChange(domain: "goals"),
            ChatChange(domain: "fasting", ids: ["f1"])
        ])
        await Self.refresher(harness).run(plan, isCurrent: { false })
        #expect(harness.recordedRequests.isEmpty)
    }
}
