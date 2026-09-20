import AppIntents
@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@MainActor
struct NutritionReaderTests {
    private func makeReader(_ harness: RepositoryHarness) -> NutritionReader {
        NutritionReader(entryRepository: harness.entryRepository, goalsRepository: harness.goalsRepository)
    }

    private func seedEntry(
        _ harness: RepositoryHarness,
        id: String,
        date: String,
        calories: Double,
        protein: Double = 0,
        carbs: Double = 0,
        fat: Double = 0,
        fiber: Double = 0,
        servings: Double = 1
    ) throws {
        let entry = try JSONPatch.decode(Entry.self, from: [
            "id": id,
            "mealType": "lunch",
            "servings": servings,
            "foodName": "Seed \(id)",
            "calories": calories,
            "protein": protein,
            "carbs": carbs,
            "fat": fat,
            "fiber": fiber,
            "date": date,
        ])
        harness.context.insert(LocalEntry(entry: entry, date: date))
        try harness.context.save()
    }

    /// A one-off estimate: no food row, macros carried on the entry itself.
    private func seedQuickEntry(
        _ harness: RepositoryHarness,
        id: String,
        date: String,
        calories: Double,
        protein: Double,
        servings: Double = 1
    ) throws {
        let entry = try JSONPatch.decode(Entry.self, from: [
            "id": id,
            "mealType": "snacks",
            "servings": servings,
            "quickName": "Quick \(id)",
            "quickCalories": calories,
            "quickProtein": protein,
            "date": date,
        ])
        harness.context.insert(LocalEntry(entry: entry, date: date))
        try harness.context.save()
    }

    private func seedGoals(_ harness: RepositoryHarness, calories: Double = 2000) throws {
        harness.context.insert(LocalGoals(goals: Goals(
            calorieGoal: calories,
            proteinGoal: 150,
            carbGoal: 250,
            fatGoal: 65,
            fiberGoal: 30,
            sodiumGoal: nil,
            sugarGoal: nil
        )))
        try harness.context.save()
    }

    private func seedFastingDay(_ harness: RepositoryHarness, date: String) throws {
        harness.context.insert(LocalDayProperties(properties: DayProperties(date: date, isFastingDay: true)))
        try harness.context.save()
    }

    // MARK: - Day summaries

    @Test("daySummary totals every entry on the day, quick entries included")
    func daySummaryTotals() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedEntry(harness, id: "e1", date: "2026-09-16", calories: 500, protein: 40, carbs: 50, fat: 10, fiber: 5)
        // Two servings: the summary must scale, like the dashboard does.
        try seedEntry(
            harness, id: "e2", date: "2026-09-16",
            calories: 200, protein: 10, carbs: 20, fat: 5, fiber: 2, servings: 2
        )
        try seedQuickEntry(harness, id: "e3", date: "2026-09-16", calories: 150, protein: 5)
        try seedEntry(harness, id: "other", date: "2026-09-15", calories: 999)

        let summary = makeReader(harness).daySummary(date: "2026-09-16")

        #expect(summary.id == "2026-09-16")
        #expect(summary.calories == 1050)
        #expect(summary.protein == 65)
        #expect(summary.carbs == 90)
        #expect(summary.fat == 20)
        #expect(summary.fiber == 9)
        #expect(summary.entryCount == 3)
        #expect(!summary.isFastingDay)
        #expect(summary.calorieGoal == nil)
        #expect(summary.remainingCalories == nil)
    }

    @Test("daySummary returns a zeroed day when nothing is logged")
    func daySummaryEmptyDay() throws {
        let harness = try RepositoryHarness(mode: .local)

        let summary = makeReader(harness).daySummary(date: "2026-09-16")

        #expect(summary.isEmpty)
        #expect(summary.calories == 0)
        #expect(!summary.metCalorieGoal)
    }

    @Test("Remaining calories and the goal flag follow the stored goals")
    func daySummaryGoals() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedGoals(harness, calories: 2000)
        try seedEntry(harness, id: "e1", date: "2026-09-16", calories: 1600, protein: 100)
        try seedEntry(harness, id: "e2", date: "2026-09-15", calories: 2400, protein: 100)
        let reader = makeReader(harness)

        let within = reader.daySummary(date: "2026-09-16")
        #expect(within.calorieGoal == 2000)
        #expect(within.remainingCalories == 400)
        #expect(within.metCalorieGoal)

        let over = reader.daySummary(date: "2026-09-15")
        #expect(over.remainingCalories == -400)
        #expect(!over.metCalorieGoal)

        // An empty day has calories left but has not "met" the goal.
        let empty = reader.daySummary(date: "2026-09-14")
        #expect(empty.remainingCalories == 2000)
        #expect(!empty.metCalorieGoal)
    }

    @Test("A fasting day is reported even with no entries")
    func daySummaryFastingDay() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFastingDay(harness, date: "2026-09-16")
        let reader = makeReader(harness)

        let summary = reader.daySummary(date: "2026-09-16")
        #expect(summary.isFastingDay)
        #expect(summary.isEmpty)

        // …and the range read keeps it, which is what the Spotlight index walks.
        let range = reader.daySummaries(from: "2026-09-10", to: "2026-09-20")
        #expect(range.map(\.id) == ["2026-09-16"])
        #expect(range.first?.isFastingDay == true)
    }

    @Test("daySummaries(from:to:) skips days with nothing on them")
    func daySummariesRange() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedEntry(harness, id: "e1", date: "2026-09-14", calories: 100)
        try seedEntry(harness, id: "e2", date: "2026-09-16", calories: 200)
        try seedEntry(harness, id: "e3", date: "2026-09-20", calories: 300)

        let days = makeReader(harness).daySummaries(from: "2026-09-14", to: "2026-09-16")

        #expect(days.map(\.id) == ["2026-09-14", "2026-09-16"])
        #expect(days.map(\.calories) == [100, 200])
    }

    @Test("daySummaries(dates:) answers for every requested day, empty ones included")
    func daySummariesForIdentifiers() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedEntry(harness, id: "e1", date: "2026-09-16", calories: 100)

        let days = makeReader(harness).daySummaries(dates: ["2026-09-16", "2026-09-17", "not-a-date"])

        #expect(days.map(\.id) == ["2026-09-16", "2026-09-17"])
        #expect(days.map(\.calories) == [100, 0])
    }

    // MARK: - Weekly stats

    @Test("weeklyStats averages over the logged days only")
    func weeklyStatsIgnoresEmptyDays() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedGoals(harness, calories: 2000)
        try seedEntry(harness, id: "e1", date: "2026-09-16", calories: 1000, protein: 100, carbs: 80, fat: 30, fiber: 10)
        try seedEntry(harness, id: "e2", date: "2026-09-14", calories: 3000, protein: 50, carbs: 40, fat: 10, fiber: 6)
        // Outside the seven-day window ending on the 16th.
        try seedEntry(harness, id: "old", date: "2026-09-08", calories: 9999)

        let stats = makeReader(harness).weeklyStats(endingOn: "2026-09-16")

        #expect(stats.startDate == "2026-09-10")
        #expect(stats.endDate == "2026-09-16")
        #expect(stats.daysLogged == 2)
        #expect(stats.averageCalories == 2000)
        #expect(stats.averageProtein == 75)
        #expect(stats.averageCarbs == 60)
        #expect(stats.averageFat == 20)
        #expect(stats.averageFiber == 8)
        // Only the 1000 kcal day stayed within the 2000 kcal goal.
        #expect(stats.goalsMet == 1)
        #expect(stats.calorieGoal == 2000)
    }

    @Test("weeklyStats reports an empty week rather than dividing by zero")
    func weeklyStatsEmptyWeek() throws {
        let harness = try RepositoryHarness(mode: .local)

        let stats = makeReader(harness).weeklyStats(endingOn: "2026-09-16")

        #expect(stats.isEmpty)
        #expect(stats.averageCalories == 0)
        #expect(stats.goalsMet == 0)
    }

    // MARK: - Query resolution

    @Test("The string query resolves spoken days in both languages")
    func resolveSpokenDates() throws {
        // A Wednesday, so the most recent Monday is two days back.
        let now = try #require(DateFormatting.date(from: "2026-09-16"))

        #expect(DaySummaryQuery.resolveDate("today", now: now) == "2026-09-16")
        #expect(DaySummaryQuery.resolveDate("Heute", now: now) == "2026-09-16")
        #expect(DaySummaryQuery.resolveDate("yesterday", now: now) == "2026-09-15")
        #expect(DaySummaryQuery.resolveDate("gestern", now: now) == "2026-09-15")
        #expect(DaySummaryQuery.resolveDate("Monday", now: now) == "2026-09-14")
        #expect(DaySummaryQuery.resolveDate("Montag", now: now) == "2026-09-14")
        // The current weekday resolves to today, not a week ago.
        #expect(DaySummaryQuery.resolveDate("wednesday", now: now) == "2026-09-16")
        #expect(DaySummaryQuery.resolveDate("2026-09-01", now: now) == "2026-09-01")
        #expect(DaySummaryQuery.resolveDate("pizza", now: now) == nil)
        #expect(DaySummaryQuery.resolveDate("2026/09/01", now: now) == nil)
    }

    @Test("Property comparators filter the day list")
    func propertyQueryFiltering() throws {
        let days = try [
            DaySummaryEntity(dateString: "2026-09-14", entries: [], isFastingDay: false, goals: nil),
            summary(date: "2026-09-15", calories: 1200, protein: 60),
            summary(date: "2026-09-16", calories: 2400, protein: 180),
        ]

        let above = DaySummaryQuery.filter(days, comparators: [.caloriesAbove(1500)], mode: .and)
        #expect(above.map(\.id) == ["2026-09-16"])

        let narrow = DaySummaryQuery.filter(
            days,
            comparators: [.caloriesAbove(1000), .proteinBelow(100)],
            mode: .and
        )
        #expect(narrow.map(\.id) == ["2026-09-15"])

        let either = DaySummaryQuery.filter(
            days,
            comparators: [.caloriesAbove(2000), .caloriesBelow(500)],
            mode: .or
        )
        #expect(either.map(\.id) == ["2026-09-14", "2026-09-16"])

        // No comparators means the whole window, not nothing.
        #expect(DaySummaryQuery.filter(days, comparators: [], mode: .or).count == 3)
    }

    /// Standalone entity factory (no store needed).
    private func summary(date: String, calories: Double, protein: Double) throws -> DaySummaryEntity {
        let entry = try JSONPatch.decode(Entry.self, from: [
            "id": "e-\(date)",
            "mealType": "lunch",
            "servings": 1,
            "foodName": "Seed",
            "calories": calories,
            "protein": protein,
            "date": date,
        ])
        return DaySummaryEntity(dateString: date, entries: [entry], isFastingDay: false, goals: nil)
    }
}
