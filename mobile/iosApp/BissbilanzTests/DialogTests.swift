@testable import Bissbilanz
import Foundation
import Testing

/// `DaySummaryDialog`/`BodyDialog` build the sentences Siri speaks for the
/// read intents — see their own header comments ("kept apart... so the
/// wording can be asserted in tests without running an intent"). AppIntentsTesting
/// (`BissbilanzIntentsUITests`) can only inspect an intent's *returned value*,
/// not its spoken dialog (there is no API surface for that yet), so this is
/// where the dialog assembly logic — which clauses appear, and in what order —
/// actually gets covered. Expected text is built by calling the same `L10n`
/// functions the dialogs call rather than hardcoding copy, so these assert
/// assembly, not wording.
struct DialogTests {
    private func entry(calories: Double, protein: Double, carbs: Double, fat: Double) throws -> Entry {
        try JSONPatch.decode(Entry.self, from: [
            "id": UUID().uuidString, "mealType": "lunch", "servings": 1,
            "foodName": "Test", "calories": calories, "protein": protein,
            "carbs": carbs, "fat": fat, "date": "2026-01-15",
        ])
    }

    // MARK: - Day status

    @Test("An empty, non-fasting day reads as nothing logged")
    func statusEmptyDay() {
        let summary = DaySummaryEntity(dateString: "2026-01-15", entries: [], isFastingDay: false, goals: nil)
        let day = DaySummaryFormat.dayLabel(summary, locale: DaySummaryFormat.locale)
        #expect(DaySummaryDialog.status(for: summary) == L10n.intentDayNothingLogged(day))
    }

    @Test("An empty fasting day reads as fasting, not 'nothing logged'")
    func statusEmptyFastingDay() {
        let summary = DaySummaryEntity(dateString: "2026-01-15", entries: [], isFastingDay: true, goals: nil)
        let day = DaySummaryFormat.dayLabel(summary, locale: DaySummaryFormat.locale)
        #expect(DaySummaryDialog.status(for: summary) == L10n.intentDayFasting(day))
    }

    @Test("A logged day with no goal reads calories/macros without a remaining clause")
    func statusWithoutGoal() throws {
        let summary = DaySummaryEntity(
            dateString: "2026-01-15", entries: [try entry(calories: 500, protein: 30, carbs: 40, fat: 10)],
            isFastingDay: false, goals: nil
        )
        let locale = DaySummaryFormat.locale
        let expected = L10n.intentDayStatus(
            day: DaySummaryFormat.dayLabel(summary, locale: locale),
            calories: DaySummaryFormat.number(500, locale: locale),
            protein: DaySummaryFormat.number(30, locale: locale),
            carbs: DaySummaryFormat.number(40, locale: locale),
            fat: DaySummaryFormat.number(10, locale: locale)
        )
        #expect(DaySummaryDialog.status(for: summary) == expected)
    }

    @Test("A logged day within its goal appends the calories-left clause")
    func statusWithGoalUnderBudget() throws {
        let summary = DaySummaryEntity(
            dateString: "2026-01-15", entries: [try entry(calories: 500, protein: 30, carbs: 40, fat: 10)],
            isFastingDay: false, goals: Goals.defaults
        )
        let locale = DaySummaryFormat.locale
        let text = DaySummaryDialog.status(for: summary)
        #expect(text.hasSuffix(L10n.intentCaloriesLeft(DaySummaryFormat.number(1500, locale: locale))))
    }

    @Test("A logged day over its goal appends the calories-over clause")
    func statusWithGoalOverBudget() throws {
        let summary = DaySummaryEntity(
            dateString: "2026-01-15", entries: [try entry(calories: 2500, protein: 30, carbs: 40, fat: 10)],
            isFastingDay: false, goals: Goals.defaults
        )
        let locale = DaySummaryFormat.locale
        let text = DaySummaryDialog.status(for: summary)
        #expect(text.hasSuffix(L10n.intentCaloriesOver(DaySummaryFormat.number(500, locale: locale))))
    }

    // MARK: - Week

    @Test("An empty week reads as nothing logged")
    func weekEmpty() {
        let stats = WeeklyNutritionStats(
            startDate: "2026-01-09", endDate: "2026-01-15", daysLogged: 0,
            averageCalories: 0, averageProtein: 0, averageCarbs: 0, averageFat: 0, averageFiber: 0,
            goalsMet: 0, calorieGoal: nil
        )
        #expect(DaySummaryDialog.week(stats) == L10n.intentWeekNothingLogged)
    }

    @Test("A logged week with a goal appends the goals-met clause")
    func weekWithGoal() {
        let stats = WeeklyNutritionStats(
            startDate: "2026-01-09", endDate: "2026-01-15", daysLogged: 5,
            averageCalories: 1900, averageProtein: 120, averageCarbs: 200, averageFat: 60, averageFiber: 25,
            goalsMet: 3, calorieGoal: 2000
        )
        #expect(DaySummaryDialog.week(stats).hasSuffix(L10n.intentWeekGoalsMet(3, of: 5)))
    }

    // MARK: - Weight

    @Test("Weight without a trend omits the movement clause")
    func weightNoTrend() throws {
        let weightEntry = WeightEntity(entry: try JSONPatch.decode(WeightEntry.self, from: [
            "id": "w1", "userId": "u1", "weightKg": 76.4, "entryDate": "2026-01-15",
        ]))
        let locale = DaySummaryFormat.locale
        let text = BodyDialog.weight(for: weightEntry, trend: .empty(days: 7), isLatest: true)
        let day = DaySummaryFormat.dayLabel(dateString: weightEntry.entryDate, date: weightEntry.date, locale: locale)
        #expect(text == L10n.intentWeightLatest(weight: DaySummaryFormat.kilograms(76.4, locale: locale), day: day))
    }

    @Test("A downward weight trend appends the trend-down clause")
    func weightTrendDown() throws {
        let weightEntry = WeightEntity(entry: try JSONPatch.decode(WeightEntry.self, from: [
            "id": "w1", "userId": "u1", "weightKg": 75.0, "entryDate": "2026-01-15",
        ]))
        let trend = WeightTrendSummary(
            days: 7, firstDate: "2026-01-09", lastDate: "2026-01-15",
            firstKg: 76.0, lastKg: 75.0, averageKg: 75.5, count: 2
        )
        let locale = DaySummaryFormat.locale
        let text = BodyDialog.weight(for: weightEntry, trend: trend, isLatest: true)
        #expect(text.hasSuffix(L10n.intentWeightTrendDown(value: DaySummaryFormat.kilograms(1.0, locale: locale), days: 7)))
    }

    // MARK: - Sleep

    @Test("Last night's sleep opens with the last-night clause")
    func sleepLastNight() throws {
        let sleepEntry = SleepEntity(entry: try JSONPatch.decode(SleepEntry.self, from: [
            "id": "s1", "userId": "u1", "entryDate": DateFormatting.today, "durationMinutes": 420, "quality": 7,
        ]))
        let text = BodyDialog.sleep(for: sleepEntry, stats: .empty(days: 7), isLatest: true)
        #expect(text.hasPrefix(L10n.intentSleepLastNight(duration: DaySummaryFormat.spokenDuration(minutes: 420))))
    }

    @Test("Multiple nights append the average clause")
    func sleepWithAverage() throws {
        let sleepEntry = SleepEntity(entry: try JSONPatch.decode(SleepEntry.self, from: [
            "id": "s1", "userId": "u1", "entryDate": "2026-01-15", "durationMinutes": 420, "quality": 7,
        ]))
        let stats = SleepStats(
            days: 7, nights: 5, averageDurationMinutes: 410, averageQuality: 7,
            bestDurationMinutes: 460, bestDate: "2026-01-12", worstDurationMinutes: 360, worstDate: "2026-01-10"
        )
        let text = BodyDialog.sleep(for: sleepEntry, stats: stats, isLatest: false)
        #expect(text.hasSuffix(L10n.intentSleepAverage(
            duration: DaySummaryFormat.spokenDuration(minutes: 410), nights: 5
        )))
    }
}
