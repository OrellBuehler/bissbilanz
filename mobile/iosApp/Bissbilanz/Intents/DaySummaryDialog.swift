import Foundation

/// The sentences Siri speaks for the read intents. Kept apart from the intents
/// themselves so both the daily and the weekly answer phrase numbers the same
/// way, and so the wording can be asserted in tests without running an intent.
enum DaySummaryDialog {
    static func status(for summary: DaySummaryEntity) -> String {
        let locale = DaySummaryFormat.locale
        let day = DaySummaryFormat.dayLabel(summary, locale: locale)
        guard !summary.isEmpty else {
            return summary.isFastingDay ? L10n.intentDayFasting(day) : L10n.intentDayNothingLogged(day)
        }
        let calories = DaySummaryFormat.number(summary.calories, locale: locale)
        let protein = DaySummaryFormat.number(summary.protein, locale: locale)
        let carbs = DaySummaryFormat.number(summary.carbs, locale: locale)
        let fat = DaySummaryFormat.number(summary.fat, locale: locale)
        var text: String
        if let goal = summary.calorieGoal {
            text = L10n.intentDayStatusWithGoal(
                day: day,
                calories: calories,
                goal: DaySummaryFormat.number(goal, locale: locale),
                protein: protein,
                carbs: carbs,
                fat: fat
            )
        } else {
            text = L10n.intentDayStatus(day: day, calories: calories, protein: protein, carbs: carbs, fat: fat)
        }
        if let remaining = summary.remainingCalories {
            let value = DaySummaryFormat.number(abs(remaining), locale: locale)
            text += " " + (remaining >= 0 ? L10n.intentCaloriesLeft(value) : L10n.intentCaloriesOver(value))
        }
        if summary.isFastingDay {
            text += " " + L10n.intentDayFasting(day)
        }
        return text
    }

    static func week(_ stats: WeeklyNutritionStats) -> String {
        guard !stats.isEmpty else { return L10n.intentWeekNothingLogged }
        let locale = DaySummaryFormat.locale
        var text = L10n.intentWeekSummary(
            days: stats.daysLogged,
            calories: DaySummaryFormat.number(stats.averageCalories, locale: locale),
            protein: DaySummaryFormat.number(stats.averageProtein, locale: locale),
            carbs: DaySummaryFormat.number(stats.averageCarbs, locale: locale),
            fat: DaySummaryFormat.number(stats.averageFat, locale: locale)
        )
        if stats.calorieGoal != nil {
            text += " " + L10n.intentWeekGoalsMet(stats.goalsMet, of: stats.daysLogged)
        }
        return text
    }
}
