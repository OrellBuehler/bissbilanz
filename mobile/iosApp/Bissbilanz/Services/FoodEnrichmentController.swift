import Foundation
import Observation

enum FoodEnrichmentNotice: Equatable {
    case offline
    case rateLimited(seconds: Int)
    case actionFailed
    case foodsRefreshFailed
}

enum LocalSweepState: Equatable {
    case idle
    case running
    case completed
    case stopped
    case failed
    case offline
}

struct LocalSweepProgress: Equatable {
    var state: LocalSweepState = .idle
    var total = 0
    var done = 0
    var updated = 0
    var notFound = 0
    var failed = 0
    var currentFoodName: String?
    var isWaiting = false
}

enum FoodEnrichmentSweepStep: Equatable {
    case skip
    case fail(String)
    case retry(after: TimeInterval?, reason: String)
    case cancel
}

@MainActor
@Observable
final class FoodEnrichmentController {
    nonisolated static let candidatesKey = "food_enrichment_candidates"
    nonisolated static let statusMaxAge: TimeInterval = 300
    nonisolated static let activeStatusMaxAge: TimeInterval = 30

    private(set) var status: FoodEnrichmentStatus?
    private(set) var cachedCandidates: Int?
    private(set) var consecutiveFailures = 0
    private(set) var isSubmitting = false
    private(set) var notice: FoodEnrichmentNotice?
    private(set) var sweep = LocalSweepProgress()
    private(set) var localCandidateCount = 0

    @ObservationIgnored private let api: BissbilanzAPI
    @ObservationIgnored private let appMode: AppModeManager
    @ObservationIgnored private let connectivity: ConnectivityMonitor
    @ObservationIgnored private let foodRepository: FoodRepository
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let delay: @Sendable (TimeInterval) async throws -> Void
    @ObservationIgnored private var lastFetchedAt: Date?
    @ObservationIgnored private var rateLimitedUntil: Date?
    @ObservationIgnored private var latestRequest = 0
    @ObservationIgnored private var sweepTask: Task<Void, Never>?
    @ObservationIgnored private var mirrorTask: Task<Void, Never>?

    init(
        api: BissbilanzAPI,
        appMode: AppModeManager,
        connectivity: ConnectivityMonitor,
        foodRepository: FoodRepository,
        defaults: UserDefaults = .standard,
        delay: @escaping @Sendable (TimeInterval) async throws -> Void = { seconds in
            try await Task.sleep(for: .seconds(seconds))
        }
    ) {
        self.api = api
        self.appMode = appMode
        self.connectivity = connectivity
        self.foodRepository = foodRepository
        self.defaults = defaults
        self.delay = delay
        cachedCandidates = defaults.object(forKey: Self.candidatesKey) as? Int
    }

    var isJobActive: Bool {
        status?.isActive ?? false
    }

    var shouldPoll: Bool {
        !appMode.isLocal && isJobActive && consecutiveFailures < FoodEnrichmentRules.maxPollFailures
    }

    var loadFailed: Bool {
        consecutiveFailures > 0 && !shouldPoll
    }

    var isSweepRunning: Bool {
        sweep.state == .running
    }

    var settingsSummary: String? {
        if appMode.isLocal {
            if isSweepRunning {
                return L10n.enhanceFoodsProgress(sweep.done, sweep.total)
            }
            return localCandidateCount > 0 ? L10n.unlabeledFoodCount(localCandidateCount) : nil
        }
        if let job = status?.job, job.phase.isActive {
            return L10n.enhanceFoodsJobProgress(job)
        }
        let count = status?.candidates ?? cachedCandidates ?? 0
        return count > 0 ? L10n.unlabeledFoodCount(count) : nil
    }

    func refreshForSettings() async {
        if appMode.isLocal {
            refreshLocalCount()
            return
        }
        let maxAge = isJobActive ? Self.activeStatusMaxAge : Self.statusMaxAge
        if let lastFetchedAt, Date().timeIntervalSince(lastFetchedAt) < maxAge {
            return
        }
        await refreshStatus()
    }

    func refreshForScreen() async {
        if appMode.isLocal {
            refreshLocalCount()
        } else {
            await refreshStatus()
        }
    }

    @discardableResult
    func refreshStatus() async -> Bool {
        guard !appMode.isLocal, connectivity.isOnline else { return false }
        latestRequest += 1
        let request = latestRequest
        do {
            let next = try await api.getFoodEnrichmentStatus()
            guard request == latestRequest else { return true }
            consecutiveFailures = 0
            if notice == .offline {
                notice = nil
            }
            apply(next)
            return true
        } catch {
            guard request == latestRequest, !Self.isCancellation(error) else { return false }
            if let failure = error as? FoodEnrichmentFailure, case let .rateLimited(retryAfter) = failure {
                rateLimitedUntil = Date().addingTimeInterval(retryAfter)
            }
            consecutiveFailures += 1
            return false
        }
    }

    func pollWhileActive() async {
        while shouldPoll {
            let rateLimitedFor = rateLimitedUntil.map(\.timeIntervalSinceNow)
            let wait = FoodEnrichmentRules.pollDelay(failures: consecutiveFailures, rateLimitedFor: rateLimitedFor)
            guard await pause(wait) else { return }
            await refreshStatus()
        }
    }

    func startJob() async {
        await perform(.start)
    }

    func cancelJob() async {
        await perform(.cancel)
    }

    private enum JobAction {
        case start
        case cancel
    }

    private func perform(_ action: JobAction) async {
        guard !appMode.isLocal, !isSubmitting else { return }
        guard connectivity.isOnline else {
            notice = .offline
            return
        }
        if let until = rateLimitedUntil, until > Date() {
            notice = .rateLimited(seconds: Self.wholeSeconds(until.timeIntervalSinceNow))
            return
        }
        isSubmitting = true
        defer { isSubmitting = false }
        latestRequest += 1
        let request = latestRequest
        do {
            let next: FoodEnrichmentStatus
            switch action {
            case .start: next = try await api.startFoodEnrichment()
            case .cancel: next = try await api.cancelFoodEnrichment()
            }
            notice = nil
            rateLimitedUntil = nil
            consecutiveFailures = 0
            if request == latestRequest {
                apply(next)
            }
        } catch {
            guard !Self.isCancellation(error) else { return }
            if let failure = error as? FoodEnrichmentFailure, case let .rateLimited(retryAfter) = failure {
                rateLimitedUntil = Date().addingTimeInterval(retryAfter)
            }
            notice = Self.failureNotice(for: error)
        }
    }

    private func apply(_ next: FoodEnrichmentStatus) {
        let finished = FoodEnrichmentRules.didFinish(previous: status, next: next)
        status = next
        lastFetchedAt = Date()
        cachedCandidates = next.candidates
        defaults.set(next.candidates, forKey: Self.candidatesKey)
        if finished, (next.job?.updated ?? 0) > 0 {
            refreshLocalFoods()
        }
    }

    private func refreshLocalFoods() {
        guard mirrorTask == nil else { return }
        mirrorTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await foodRepository.mirrorAll()
            } catch {
                if !Self.isCancellation(error) {
                    notice = .foodsRefreshFailed
                    let reason = ErrorReporter.reason(for: error)
                    if !ErrorReporter.isExpectedFailureReason(reason) {
                        ErrorReporter.captureWarning("Enhance foods refresh failed", context: ["reason": reason])
                    }
                }
            }
            mirrorTask = nil
        }
    }

    func reset() {
        sweepTask?.cancel()
        mirrorTask?.cancel()
        mirrorTask = nil
        latestRequest += 1
        status = nil
        cachedCandidates = nil
        consecutiveFailures = 0
        notice = nil
        lastFetchedAt = nil
        rateLimitedUntil = nil
        localCandidateCount = 0
        defaults.removeObject(forKey: Self.candidatesKey)
    }

    nonisolated static func failureNotice(for error: Error) -> FoodEnrichmentNotice {
        if let failure = error as? FoodEnrichmentFailure, case let .rateLimited(retryAfter) = failure {
            return .rateLimited(seconds: wholeSeconds(retryAfter))
        }
        switch ErrorReporter.reason(for: error) {
        case "offline", "timeout", "cannot_reach_host": return .offline
        default: return .actionFailed
        }
    }

    nonisolated static func wholeSeconds(_ interval: TimeInterval) -> Int {
        guard interval.isFinite else { return 1 }
        return max(1, Int(interval.rounded(.up)))
    }

    nonisolated static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || ErrorReporter.reason(for: error) == "cancelled"
    }

    func refreshLocalCount() {
        guard appMode.isLocal else { return }
        localCandidateCount = foodRepository.unenrichedLocalFoods().count
    }

    func startLocalSweep() {
        guard appMode.isLocal, sweepTask == nil else { return }
        guard connectivity.isOnline else {
            sweep = LocalSweepProgress(state: .offline)
            return
        }
        let foods = foodRepository.unenrichedLocalFoods()
        localCandidateCount = foods.count
        sweep = LocalSweepProgress(state: .running, total: foods.count)
        sweepTask = Task { [weak self] in
            guard let self else { return }
            let finalState = await runSweep(foods)
            sweep.state = finalState
            sweep.currentFoodName = nil
            sweep.isWaiting = false
            sweepTask = nil
            refreshLocalCount()
        }
    }

    func stopLocalSweep() {
        sweepTask?.cancel()
    }

    private enum SweepItem {
        case outcome(FoodEnrichOutcome)
        case skipped
        case failed(String)
        case offline
        case cancelled
    }

    private func runSweep(_ foods: [Food]) async -> LocalSweepState {
        var failuresInARow = 0
        for (index, food) in foods.enumerated() {
            if Task.isCancelled || !appMode.isLocal { return .stopped }
            guard connectivity.isOnline else { return .offline }
            if index > 0, !(await pause(FoodEnrichmentRules.requestSpacing)) { return .stopped }
            sweep.currentFoodName = food.name
            let item = await enrichWithRetry(food)
            switch item {
            case .cancelled:
                return .stopped
            case .offline:
                return .offline
            case let .outcome(outcome):
                failuresInARow = 0
                if outcome == .updated { sweep.updated += 1 }
                if outcome == .notFound { sweep.notFound += 1 }
            case .skipped:
                failuresInARow = 0
            case let .failed(reason):
                sweep.failed += 1
                failuresInARow += 1
                ErrorReporter.addBreadcrumb(
                    "Enhance foods item failed",
                    category: "food-enrichment",
                    data: ["reason": reason]
                )
                if failuresInARow >= FoodEnrichmentRules.maxConsecutiveFailures {
                    sweep.done += 1
                    ErrorReporter.captureWarning(
                        "Enhance foods sweep stopped after repeated failures",
                        context: ["reason": reason, "failures": failuresInARow]
                    )
                    return .failed
                }
            }
            sweep.done += 1
        }
        return .completed
    }

    private func enrichWithRetry(_ food: Food) async -> SweepItem {
        var attempt = 1
        while true {
            let step: FoodEnrichmentSweepStep
            do {
                let result = try await foodRepository.enrichFood(id: food.id)
                return .outcome(result.outcome)
            } catch {
                step = Self.sweepStep(for: error)
            }
            switch step {
            case .cancel:
                return .cancelled
            case .skip:
                return .skipped
            case let .fail(reason):
                return .failed(reason)
            case let .retry(after, reason):
                guard attempt < FoodEnrichmentRules.maxAttempts else { return .failed(reason) }
                guard connectivity.isOnline else { return .offline }
                sweep.isWaiting = true
                let resumed = await pause(FoodEnrichmentRules.backoff(attempt: attempt, retryAfter: after))
                sweep.isWaiting = false
                guard resumed else { return .cancelled }
                attempt += 1
            }
        }
    }

    nonisolated static func sweepStep(for error: Error) -> FoodEnrichmentSweepStep {
        if isCancellation(error) {
            return .cancel
        }
        guard let failure = error as? FoodEnrichmentFailure else {
            let reason = ErrorReporter.reason(for: error)
            return isTransportError(error) ? .retry(after: nil, reason: reason) : .fail(reason)
        }
        switch failure {
        case .foodNotFound, .foodChanged, .noBarcode, .pendingChanges:
            return .skip
        case let .offUnavailable(retryAfter):
            return .retry(after: retryAfter, reason: "off_unavailable")
        case let .rateLimited(retryAfter):
            return .retry(after: retryAfter, reason: "rate_limited")
        case .offInvalidResponse:
            return .fail("off_invalid_response")
        case let .failed(status):
            return .fail("status_\(status)")
        }
    }

    nonisolated static func isTransportError(_ error: Error) -> Bool {
        if error is URLError {
            return true
        }
        if let apiError = error as? APIError, case .networkError = apiError {
            return true
        }
        return false
    }

    private func pause(_ seconds: TimeInterval) async -> Bool {
        do {
            try await delay(seconds)
        } catch {
            if !Self.isCancellation(error) {
                ErrorReporter.capture(error, context: ["operation": "FoodEnrichmentController.pause"])
            }
            return false
        }
        return !Task.isCancelled
    }
}
