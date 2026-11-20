@testable import Bissbilanz
import Foundation
import Testing

@Suite("Chat changes to refreshes")
struct ChatRefreshPlanTests {
    @Test("Dated entries refresh their days; unscoped ones the recent days")
    func entries() {
        let dated = ChatRefreshPlan(changes: [ChatChange(domain: "entries", dates: ["2026-11-18", "2026-11-19"])])
        #expect(dated.entryDates == ["2026-11-18", "2026-11-19"])
        #expect(!dated.recentEntries)
        let unscoped = ChatRefreshPlan(changes: [ChatChange(domain: "entries")])
        #expect(unscoped.entryDates.isEmpty)
        #expect(unscoped.recentEntries)
    }

    @Test("Foods and recipes by id, the whole domain without ids or with too many")
    func foodsAndRecipes() {
        let scoped = ChatRefreshPlan(changes: [
            ChatChange(domain: "foods", ids: ["f1"]),
            ChatChange(domain: "recipes", ids: ["r1"])
        ])
        #expect(scoped.foodIds == ["f1"])
        #expect(!scoped.allFoods)
        #expect(scoped.recipeIds == ["r1"])
        let unscoped = ChatRefreshPlan(changes: [ChatChange(domain: "foods"), ChatChange(domain: "recipes")])
        #expect(unscoped.allFoods)
        #expect(unscoped.allRecipes)
        let many = (0 ... ChatRefreshPlan.maxScopedIds).map { "f\($0)" }
        let tooMany = ChatRefreshPlan(changes: [ChatChange(domain: "foods", ids: many)])
        #expect(tooMany.allFoods)
        #expect(tooMany.foodIds.isEmpty)
    }

    @Test("Day properties by date; the other domains as a whole")
    func otherDomains() {
        let plan = ChatRefreshPlan(changes: [
            ChatChange(domain: "dayProperties", dates: ["2026-11-18"]),
            ChatChange(domain: "goals"),
            ChatChange(domain: "weight", dates: ["2026-11-18"]),
            ChatChange(domain: "sleep", ids: ["s1"]),
            ChatChange(domain: "supplements", ids: ["x"]),
            ChatChange(domain: "preferences")
        ])
        #expect(plan.dayPropertyDates == ["2026-11-18"])
        #expect(plan.goals && plan.weight && plan.sleep && plan.supplements && plan.preferences)
        #expect(!plan.recentEntries)
    }

    @Test("A domain only in changed counts as unscoped")
    func changedWithoutChanges() {
        let plan = ChatRefreshPlan(changes: [ChatChange(domain: "foods", ids: ["f1"])], changed: ["foods", "entries"])
        #expect(plan.foodIds == ["f1"])
        #expect(plan.recentEntries)
        #expect(ChatRefreshPlan.scopedChanges(changes: [], changed: ["goals", "goals"]) == [ChatChange(domain: "goals")])
    }

    @Test("Labels alone refresh foods and recipes; with them, their ids are enough")
    func labels() {
        let alone = ChatRefreshPlan(changes: [ChatChange(domain: "labels")])
        #expect(alone.allFoods && alone.allRecipes)
        let withFoods = ChatRefreshPlan(changes: [ChatChange(domain: "labels"), ChatChange(domain: "foods", ids: ["f1"])])
        #expect(!withFoods.allFoods)
        #expect(!withFoods.allRecipes)
        #expect(withFoods.foodIds == ["f1"])
    }

    @Test("Unknown domains are ignored")
    func unknownDomain() {
        #expect(ChatRefreshPlan(changes: [ChatChange(domain: "fasting")], changed: ["reminders"]).isEmpty)
    }

    @Test("Plans merge; a whole domain absorbs its ids")
    func merge() {
        var first = ChatRefreshPlan(changes: [ChatChange(domain: "entries", dates: ["2026-11-18"])])
        first.formUnion(ChatRefreshPlan(changes: [
            ChatChange(domain: "entries", dates: ["2026-11-18", "2026-11-19"]),
            ChatChange(domain: "foods", ids: ["f1"]),
            ChatChange(domain: "goals")
        ]))
        #expect(first.entryDates == ["2026-11-18", "2026-11-19"])
        #expect(first.foodIds == ["f1"])
        #expect(first.goals)

        var all = ChatRefreshPlan(changes: [ChatChange(domain: "foods")])
        all.formUnion(ChatRefreshPlan(changes: [ChatChange(domain: "foods", ids: ["f2"])]))
        #expect(all.allFoods)
        #expect(all.foodIds.isEmpty)
    }
}
