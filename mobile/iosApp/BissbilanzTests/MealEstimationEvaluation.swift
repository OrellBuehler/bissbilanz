import Foundation

// The Evaluations framework (`import Evaluations`) is new in Xcode 27 / iOS
// 27.0+ — a full major version past the iOS 26.0 FoundationModels gate
// `MealEstimator` itself uses — so this needs its own, stricter version fence.
// Mirrors the `#if compiler(>=6.4)` / `@available(iOS 27, *)` pattern in
// `Intents/SiriIOS27.swift`: the project's deployment target stays iOS 18, and
// the Swift CodeQL job builds with an Xcode whose SDK doesn't declare this
// framework at all, so the gate has to be a compile-time one, not just a
// runtime `#available` check.
//
// There is no meaningful "fallback" for an evaluation framework the way there
// is for, say, a Siri feature — on an older toolchain this type simply
// doesn't exist, and `MealEstimatorEvaluationTests`'s deterministic tests
// (hallucination guard, result mapping, tolerance scoring) are what still run
// everywhere. See that file's header comment for how the two fit together.
#if compiler(>=6.4)
@testable import Bissbilanz
import Evaluations
import FoundationModels
import SwiftData

/// One sample's expected/actual shape for `MealEstimationEvaluation`. The
/// Evaluations framework requires a sample's `expected` value and its
/// subject's produced value to be the same type (see `Evaluator`'s
/// `ModelSubject<Input.ExpectedValue>` parameter), so this is deliberately a
/// plain point value rather than the ranges `MealEvalFixtures.Case` scores
/// against — the evaluators below re-look-up the original `Case` by prompt
/// text to get those ranges back.
@available(iOS 27, *)
struct MealEvalOutcome: Codable, Sendable {
    let totalCalories: Double
    let totalProtein: Double
    let totalCarbs: Double
    let totalFat: Double
    let matchedFoodIds: Set<String>
}

@available(iOS 27, *)
extension MealEvalFixtures.Case {
    /// The midpoint of each range, expected-matched ids carried through as-is.
    /// Only used as `ModelSample.expected`'s value for its type — the actual
    /// pass/fail check is against this case's ranges, looked up separately.
    var expectedOutcome: MealEvalOutcome {
        MealEvalOutcome(
            totalCalories: (calorieRange.lowerBound + calorieRange.upperBound) / 2,
            totalProtein: (proteinRange.lowerBound + proteinRange.upperBound) / 2,
            totalCarbs: (carbsRange.lowerBound + carbsRange.upperBound) / 2,
            totalFat: (fatRange.lowerBound + fatRange.upperBound) / 2,
            matchedFoodIds: expectedMatchedFoodIds
        )
    }
}

/// Owns the in-memory fixture store + `MealEstimator` every sample in
/// `MealEstimationEvaluation` evaluates against — one shared food database for
/// the whole run, since it doesn't change between samples. A `@MainActor`
/// singleton because `MealEstimator`/`FoodRepository`/SwiftData's
/// `ModelContext` are main-actor-isolated; `MealEstimationEvaluation.subject(from:)`
/// reaches it by `await`ing into `estimate(_:)`, so the (`Sendable`-required)
/// `Evaluation`-conforming type below never has to store a reference to it.
@available(iOS 27, *)
@MainActor
final class MealEvalHarness {
    static let shared = MealEvalHarness()

    private let mealEstimator: MealEstimator

    private init() {
        let container: ModelContainer
        do {
            container = try LocalStore.makeContainer(inMemory: true)
        } catch {
            fatalError("Failed to create in-memory eval container: \(error)")
        }
        let context = container.mainContext
        for food in MealEvalFixtures.seedFoods {
            context.insert(LocalFood(food: food))
        }
        try? context.save()

        // A `.invalid` host and an offline monitor: this harness only ever
        // exercises the on-device text path, so nothing here should ever
        // attempt a real network call.
        let baseURL = "https://meal-eval.invalid"
        let api = BissbilanzAPI(baseURL: baseURL, authManager: AuthManager(baseURL: baseURL))
        let appMode = AppModeManager(defaults: UserDefaults(suiteName: "meal-eval-\(UUID().uuidString)")!)
        appMode.setMode(.local)
        let connectivity = ConnectivityMonitor()
        connectivity.isOnline = false
        let syncManager = SyncManager(context: context, api: api, appMode: appMode, connectivity: connectivity)
        syncManager.autoDrain = false
        let foodRepository = FoodRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
        mealEstimator = MealEstimator(foodRepository: foodRepository)
    }

    func estimate(_ description: String) async throws -> MealEstimate {
        try await mealEstimator.estimate(description: description)
    }
}

/// `Evaluation` conformance for `MealEstimator`'s text-estimation path — see
/// `MealEstimatorEvaluationTests` for how this wires into Swift Testing via
/// `.evaluates(...)`, and that file's header comment for why it only ever
/// runs locally on a Mac with Apple Intelligence turned on.
///
/// Scores the CURRENT text-only path (`MealEstimator.estimate(description:)`)
/// only. Sibling work is adding photo input and a Private Cloud Compute
/// fallback to `MealEstimator` — neither changes that method's signature, so
/// this evaluation and `MealEvalHarness` keep working unmodified once they
/// land; a photo-input evaluation would add its own `Evaluation` conformance
/// calling a different `MealEstimator` method against the same harness/fixture
/// food database.
@available(iOS 27, *)
struct MealEstimationEvaluation: Evaluation {
    let dataset = ArrayLoader(samples: MealEvalFixtures.cases.map {
        ModelSample(prompt: $0.description, expected: $0.expectedOutcome)
    })

    let caloriesInRange = Metric("CaloriesInRange")
    let proteinInRange = Metric("ProteinInRange")
    let carbsInRange = Metric("CarbsInRange")
    let fatInRange = Metric("FatInRange")
    let expectedIdsMatched = Metric("ExpectedIdsMatched")
    let noHallucinatedIds = Metric("NoHallucinatedIds")

    private static let knownFoodIds = Set(MealEvalFixtures.seedFoods.map(\.id))

    /// Keyed by prompt text: `ModelSample.expected` only carries the midpoint
    /// (see `MealEvalOutcome`), so the evaluators below look the original
    /// `Case` back up here to score against its actual tolerance ranges.
    private static let casesByPrompt = Dictionary(
        uniqueKeysWithValues: MealEvalFixtures.cases.map { ($0.description, $0) }
    )

    func subject(from sample: ModelSample<MealEvalOutcome>) async throws -> ModelSubject<MealEvalOutcome> {
        let estimate = try await MealEvalHarness.shared.estimate(sample.promptDescription)
        let outcome = MealEvalOutcome(
            totalCalories: estimate.items.reduce(0) { $0 + ($1.calories ?? 0) },
            totalProtein: estimate.items.reduce(0) { $0 + ($1.protein ?? 0) },
            totalCarbs: estimate.items.reduce(0) { $0 + ($1.carbs ?? 0) },
            totalFat: estimate.items.reduce(0) { $0 + ($1.fat ?? 0) },
            matchedFoodIds: Set(estimate.items.compactMap(\.matchedFoodId))
        )
        return ModelSubject(value: outcome)
    }

    var evaluators: Evaluators {
        Evaluator { sample, subject in
            guard let fixture = Self.casesByPrompt[sample.promptDescription] else { return caloriesInRange.ignore() }
            return fixture.calorieRange.contains(subject.value.totalCalories)
                ? caloriesInRange.passing()
                : caloriesInRange.failing(rationale: "\(subject.value.totalCalories) kcal, expected \(fixture.calorieRange)")
        }
        Evaluator { sample, subject in
            guard let fixture = Self.casesByPrompt[sample.promptDescription] else { return proteinInRange.ignore() }
            return fixture.proteinRange.contains(subject.value.totalProtein)
                ? proteinInRange.passing()
                : proteinInRange.failing(rationale: "\(subject.value.totalProtein) g, expected \(fixture.proteinRange)")
        }
        Evaluator { sample, subject in
            guard let fixture = Self.casesByPrompt[sample.promptDescription] else { return carbsInRange.ignore() }
            return fixture.carbsRange.contains(subject.value.totalCarbs)
                ? carbsInRange.passing()
                : carbsInRange.failing(rationale: "\(subject.value.totalCarbs) g, expected \(fixture.carbsRange)")
        }
        Evaluator { sample, subject in
            guard let fixture = Self.casesByPrompt[sample.promptDescription] else { return fatInRange.ignore() }
            return fixture.fatRange.contains(subject.value.totalFat)
                ? fatInRange.passing()
                : fatInRange.failing(rationale: "\(subject.value.totalFat) g, expected \(fixture.fatRange)")
        }
        Evaluator { sample, subject in
            guard let fixture = Self.casesByPrompt[sample.promptDescription] else { return expectedIdsMatched.ignore() }
            return fixture.expectedMatchedFoodIds.isSubset(of: subject.value.matchedFoodIds)
                ? expectedIdsMatched.passing()
                : expectedIdsMatched.failing(rationale: "matched \(subject.value.matchedFoodIds), expected \(fixture.expectedMatchedFoodIds)")
        }
        Evaluator { _, subject in
            subject.value.matchedFoodIds.isSubset(of: Self.knownFoodIds)
                ? noHallucinatedIds.passing()
                : noHallucinatedIds.failing(rationale: "unknown ids in \(subject.value.matchedFoodIds)")
        }
    }

    func aggregateMetrics(using aggregator: inout MetricsAggregator) {
        aggregator.computeMean(of: caloriesInRange)
        aggregator.computeMean(of: proteinInRange)
        aggregator.computeMean(of: carbsInRange)
        aggregator.computeMean(of: fatInRange)
        aggregator.computeMean(of: expectedIdsMatched)
        aggregator.computeMean(of: noHallucinatedIds)
    }
}

#endif
