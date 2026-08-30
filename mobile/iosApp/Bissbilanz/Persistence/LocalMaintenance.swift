import Foundation
import shared
import SwiftData

/// Computes maintenance calories on-device from the local SwiftData store using
/// the shared Kotlin calculator (`MaintenanceKt.calculateMaintenance`), so the
/// screen works for local/anonymous users with no network and for online users
/// without an API round-trip (issue #321).
///
/// This mirrors the server's `/api/maintenance` route: daily calories are summed
/// per day (fasting days counted as 0) and averaged over the whole window, and
/// the weight change is taken from the first and last weight in range. The math
/// itself lives in the shared module, so iOS and the server stay in agreement.
enum LocalMaintenance {
    /// `days` is the analysis window length (the picker's `weeks * 7`), which
    /// equals the server's `daysBetween(startDate, endDate)`. `bodyFatRatio` is
    /// the fraction of the weight change attributed to fat (the slider value);
    /// the shared calculator takes the complementary muscle ratio.
    ///
    /// Returns nil when the range lacks the inputs — fewer than two weight
    /// entries or no logged/fasting days — matching the server contract.
    static func compute(
        context: ModelContext,
        startDate: String,
        endDate: String,
        days: Int,
        bodyFatRatio: Double
    ) -> MaintenanceResponse? {
        guard days > 0 else { return nil }

        let weightDescriptor = FetchDescriptor<LocalWeightEntry>(
            predicate: #Predicate { $0.entryDate >= startDate && $0.entryDate <= endDate },
            sortBy: [SortDescriptor(\.entryDate)]
        )
        let weights = (try? context.fetch(weightDescriptor)) ?? []
        guard weights.count >= 2 else { return nil }

        let entryDescriptor = FetchDescriptor<LocalEntry>(
            predicate: #Predicate { $0.date >= startDate && $0.date <= endDate }
        )
        let entries = (try? context.fetch(entryDescriptor)) ?? []
        var dailyTotals: [String: Double] = [:]
        for entry in entries {
            dailyTotals[entry.date, default: 0] += entry.calories * entry.servings
        }

        let fastingDescriptor = FetchDescriptor<LocalDayProperties>(
            predicate: #Predicate { $0.isFastingDay && $0.date >= startDate && $0.date <= endDate }
        )
        for fasting in (try? context.fetch(fastingDescriptor)) ?? [] where dailyTotals[fasting.date] == nil {
            dailyTotals[fasting.date] = 0
        }
        guard !dailyTotals.isEmpty else { return nil }

        // Mean intake is over the days actually logged (fasting days are explicit
        // zeros); an unlogged day is unknown, not a zero-calorie day. The calendar
        // count only feeds the coverage figure.
        let totalCalories = dailyTotals.values.reduce(0, +)
        let avgDailyCalories = totalCalories / Double(dailyTotals.count)
        let coverage = Double(dailyTotals.count) / Double(days)
        // Endpoints are 7-day smoothed anchors rescaled to the full interval,
        // the same estimator the server and Android use.
        let change = MaintenanceKt.smoothedWeightChange(
            weights: weights.map { DatedWeight(weightKg: $0.weightKg, entryDate: $0.entryDate) },
            days: Int32(days)
        )
        let firstWeight = change.firstWeight
        let lastWeight = change.lastWeight
        let weightChange = change.weightChangeKg

        guard let result = MaintenanceKt.calculateMaintenance(
            input: MaintenanceInput(
                weightChangeKg: weightChange,
                avgDailyCalories: avgDailyCalories,
                days: Int32(days),
                muscleRatio: 1 - bodyFatRatio
            )
        )
        else { return nil }

        // The shared result reports fat/muscle as unsigned masses; the screen
        // shows a directional change, so carry the sign of the weight change.
        let direction: Double = weightChange < 0 ? -1 : (weightChange > 0 ? 1 : 0)
        return MaintenanceResponse(
            maintenanceCalories: result.maintenanceCalories,
            avgDailyCalories: result.avgDailyCalories,
            dailyDeficitSurplus: result.dailyDeficit,
            weightChange: weightChange,
            startWeight: firstWeight,
            endWeight: lastWeight,
            totalDays: days,
            weightEntryCount: weights.count,
            foodEntryDays: dailyTotals.count,
            coveragePercent: coverage * 100,
            fatChange: direction * result.fatMassKg,
            muscleChange: direction * result.muscleMassKg
        )
    }
}
