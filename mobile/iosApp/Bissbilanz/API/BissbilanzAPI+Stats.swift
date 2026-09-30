import Foundation

extension BissbilanzAPI {
    // MARK: - Stats

    func getWeeklyStats() async throws -> MacroTotals {
        let response: WeeklyMonthlyStatsResponse = try await get("/api/stats/weekly")
        return response.stats
    }

    func getMonthlyStats() async throws -> MacroTotals {
        let response: WeeklyMonthlyStatsResponse = try await get("/api/stats/monthly")
        return response.stats
    }

    func getStreaks() async throws -> StreaksResponse {
        try await get("/api/stats/streaks")
    }

    /// `sort` is "count" (most logged) or a macro key, ranking by the food's
    /// total contribution to it over the period.
    func getTopFoods(days: Int = 7, limit: Int = 10, sort: String = "count") async throws -> [TopFoodEntry] {
        let response: TopFoodsResponse = try await get("/api/stats/top-foods", params: [
            "days": "\(days)",
            "limit": "\(limit)",
            "sort": sort,
        ])
        return response.data
    }

    func getDailyStats(startDate: String, endDate: String) async throws -> DailyStatsResponse {
        try await get("/api/stats/daily", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
    }

    func getCalendarStats(month: Int, year: Int) async throws -> [String: CalendarDayData] {
        let response: CalendarResponse = try await get("/api/stats/calendar", params: [
            "month": String(format: "%04d-%02d", year, month),
        ])
        return response.days
    }

    func getMealBreakdown(days: Int = 7) async throws -> [MealBreakdownEntry] {
        let end = Date()
        let start = end.adding(days: -(days - 1))
        let response: MealBreakdownResponse = try await get("/api/stats/meal-breakdown", params: [
            "startDate": DateFormatting.isoString(from: start),
            "endDate": DateFormatting.isoString(from: end),
        ])
        return response.data
    }
}
