@testable import Bissbilanz
import Foundation
import shared
import Testing

/// Mirrors `tests/analytics/parity.test.ts` (TypeScript) and `AnalyticsParityTest.kt` (Kotlin):
/// runs the frozen `analytics-parity/fixtures/golden-vectors.json` cases through the analytics the
/// iOS app really calls.
///
/// The iOS app has no Swift analytics of its own. It calls the shared Kotlin functions across the
/// KMP bridge (`LocalMaintenance`, `WeightView`, `LocalInsights`), so the numbers are the Kotlin
/// implementation's, compiled to a native binary and reached through SKIE. This suite therefore
/// pins the bridge — `Int` to `Int32`, nullable results, optional strings, the parameters Kotlin
/// default arguments no longer supply — on top of what `shared:iosSimulatorArm64Test` already
/// asserts on the Kotlin side.
///
/// Only the functions the app calls directly with plain values are exercised here. The rest of the
/// golden vectors are reached only through `InsightsComputerKt.computeInsights`, whose input is
/// built from SwiftData rows; those are covered by the Kotlin/Native run of the same fixture.
@Suite("Analytics consistency with the golden vectors")
@MainActor
struct AnalyticsConsistencyTests {
    private static let bridged: Set<String> = ["calculateMaintenance", "smoothedWeightChange", "weightMovingAverage"]

    private struct GoldenCase {
        let fn: String
        let name: String
        let input: [String: Any]
        let expected: Any
    }

    private final class BundleToken {}

    private func loadGoldenCases() throws -> [GoldenCase] {
        let url = try #require(
            Bundle(for: BundleToken.self).url(forResource: "golden-vectors", withExtension: "json"),
            "analytics-parity/fixtures/golden-vectors.json is missing from the test bundle"
        )
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let root = try #require(object as? [String: Any])
        let rawCases = try #require(root["cases"] as? [[String: Any]])
        return rawCases.compactMap { raw in
            guard let fn = raw["fn"] as? String,
                  let name = raw["name"] as? String,
                  let input = raw["input"] as? [String: Any]
            else { return nil }
            return GoldenCase(fn: fn, name: name, input: input, expected: raw["expected"] ?? NSNull())
        }
    }

    @Test("Bridged analytics reproduce the golden vectors")
    func bridgedAnalyticsMatchGoldenVectors() throws {
        let cases = try loadGoldenCases().filter { Self.bridged.contains($0.fn) }
        // Guards against the filter silently matching nothing (e.g. a renamed fn).
        #expect(cases.count >= 12)

        var failures: [String] = []
        for goldenCase in cases {
            let actual = run(goldenCase)
            failures += SharedFixtures.diff(actual, goldenCase.expected, tolerance: 1e-9, path: "\(goldenCase.fn)/\(goldenCase.name)")
        }
        #expect(failures.isEmpty, "\(failures.joined(separator: "\n"))")
    }

    private func run(_ goldenCase: GoldenCase) -> Any {
        let input = goldenCase.input
        switch goldenCase.fn {
        case "calculateMaintenance":
            // `muscleRatio` is a Kotlin default argument, which the Swift bridge drops, so the
            // caller always passes it; a vector that omits it means the shared default, which
            // the vector's own expected result reports back.
            let expected = goldenCase.expected as? [String: Any]
            let muscleRatio = SharedFixtures.number(input["muscleRatio"])
                ?? SharedFixtures.number(expected?["muscleRatio"])
                ?? 0.3
            let maintenanceInput = MaintenanceInput(
                weightChangeKg: SharedFixtures.number(input["weightChangeKg"]) ?? 0,
                avgDailyCalories: SharedFixtures.number(input["avgDailyCalories"]) ?? 0,
                days: Int32(SharedFixtures.number(input["days"]) ?? 0),
                muscleRatio: muscleRatio
            )
            guard let result = MaintenanceKt.calculateMaintenance(input: maintenanceInput) else {
                return NSNull()
            }
            let fields: [String: Any] = [
                "maintenanceCalories": result.maintenanceCalories,
                "dailyDeficit": result.dailyDeficit,
                "totalEnergyBalance": result.totalEnergyBalance,
                "fatMassKg": result.fatMassKg,
                "muscleMassKg": result.muscleMassKg,
                "fatCalories": result.fatCalories,
                "muscleCalories": result.muscleCalories,
                "avgDailyCalories": result.avgDailyCalories,
                "weightChangeKg": result.weightChangeKg,
                "days": Double(result.days),
                "muscleRatio": result.muscleRatio,
            ]
            return fields

        case "smoothedWeightChange":
            let weights = (input["weights"] as? [[String: Any]] ?? []).map { raw in
                DatedWeight(weightKg: SharedFixtures.number(raw["weightKg"]) ?? 0, entryDate: raw["entryDate"] as? String)
            }
            let change = MaintenanceKt.smoothedWeightChange(
                weights: weights,
                days: Int32(SharedFixtures.number(input["days"]) ?? 0)
            )
            let fields: [String: Any] = [
                "firstWeight": change.firstWeight,
                "lastWeight": change.lastWeight,
                "weightChangeKg": change.weightChangeKg,
            ]
            return fields

        case "weightMovingAverage":
            let entries = (input["entries"] as? [[String: Any]] ?? []).map { raw in
                WeightChartInput(
                    date: raw["date"] as? String ?? "",
                    weightKg: SharedFixtures.number(raw["weightKg"]) ?? 0,
                    loggedAt: raw["loggedAt"] as? String
                )
            }
            let points = WeightChartAnalyticsKt.weightMovingAverage(
                entries: entries,
                windowDays: Int32(SharedFixtures.number(input["windowDays"]) ?? 7)
            )
            return points.map { point -> [String: Any] in
                ["date": point.date, "weightKg": point.weightKg, "movingAvg": point.movingAvg]
            }

        default:
            return NSNull()
        }
    }
}
