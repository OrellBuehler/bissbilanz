import SwiftUI

/// One day of the dashboard calorie trend.
struct DashboardTrendPoint: Identifiable {
    let date: Date
    let calories: Double
    var id: Date {
        date
    }
}

/// One row of the dashboard "top foods" card, aggregated over the trend window.
struct DashboardTopFood: Identifiable {
    let name: String
    let count: Int
    let calories: Double
    var id: String {
        name
    }
}

/// One meal's share of the selected day's calories.
struct DashboardMealSlice: Identifiable {
    let meal: String
    let calories: Double
    var id: String {
        meal
    }
}

/// A ranked recipe suggestion paired with the recipe it ranks, for the
/// dashboard's compact card.
struct DashboardRecipeSuggestion: Identifiable {
    let recipe: Recipe
    let suggestion: LocalRecipeSuggestions.Suggestion
    var id: String {
        recipe.id
    }
}
