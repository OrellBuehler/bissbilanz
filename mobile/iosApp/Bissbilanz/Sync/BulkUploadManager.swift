import Foundation
import Observation
import SwiftData

/// Where the bulk upload remembers its totals and the user's choices. The counters go with
/// the rest of the local data on sign-out (`LocalDataMigrator.wipeLocalData`); the Wi-Fi-only
/// choice is a preference and stays.
enum BulkUploadState {
    static let totalKey = "bulk_upload_total"
    static let pausedKey = "bulk_upload_paused"
    static let wifiOnlyKey = "bulk_upload_wifi_only"

    static func reset(_ defaults: UserDefaults) {
        defaults.removeObject(forKey: totalKey)
        defaults.removeObject(forKey: pausedKey)
    }
}

/// Uploads the foods of a bulk package import to the account, in the background and over
/// time (`POST /api/foods/bulk`, up to 200 foods and their photos per request).
///
/// The foods are already in the local store and usable; each one has a `BulkUploadJob` until
/// the server has it. `drain` takes the oldest pending jobs, builds the request off the main
/// thread (`BulkUploadStore`), sends it and writes the answer back — repeatedly, paced under the
/// route's own rate limit (30 requests a minute), until nothing is left, the user pauses it,
/// the device goes offline (or onto cellular with Wi-Fi only on), or the session ends. It runs
/// in the foreground, kicked off by the import, by launches and by connectivity changes, and as
/// a `BGProcessingTask` while the app is closed (`BulkUploadScheduler`).
///
/// Only the account that imported can upload: the run is tied to the signed-in user id, and a
/// different account's jobs are discarded along with the foods they stand for.
@MainActor
@Observable
final class BulkUploadManager {
    nonisolated static let minRequestInterval: TimeInterval = 2.1
    nonisolated static let backoffBase: TimeInterval = 5
    nonisolated static let backoffCap: TimeInterval = 300
    nonisolated static let maxTransientFailures = 4
    nonisolated static let maxBatchFailures = 3
    private nonisolated static let retryDelay: TimeInterval = 60

    /// Foods still to upload.
    private(set) var pendingCount = 0
    /// Foods the server turned down for good, kept for the user to retry.
    private(set) var failedCount = 0
    /// Foods handed over by imports since the queue was last empty — the denominator of the
    /// progress shown.
    private(set) var total = 0
    private(set) var isUploading = false
    private(set) var lastError: String?
    private(set) var rateLimitedUntil: Date?

    var isPaused = false {
        didSet { defaults.set(isPaused, forKey: BulkUploadState.pausedKey) }
    }

    var wifiOnly = false {
        didSet {
            defaults.set(wifiOnly, forKey: BulkUploadState.wifiOnlyKey)
            if !wifiOnly { start() }
        }
    }

    var uploadedCount: Int {
        max(total - pendingCount - failedCount, 0)
    }

    /// Whether the banner has anything to show.
    var hasWork: Bool {
        pendingCount + failedCount > 0
    }

    /// Called after every answered request, so the sync queue can retry the operations it held
    /// back for foods that were not on the server yet.
    @ObservationIgnored var onProgress: (() -> Void)?

    /// Test seam: when false, `start` and the retry it backs are no-ops, so tests drive the
    /// upload explicitly through `drain`.
    @ObservationIgnored var autoStart = true

    @ObservationIgnored private let container: ModelContainer
    @ObservationIgnored private let api: BissbilanzAPI
    @ObservationIgnored private let appMode: AppModeManager
    @ObservationIgnored private let connectivity: ConnectivityMonitor
    @ObservationIgnored private let currentUserId: () -> String?
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let imageIO: BulkImageIO
    @ObservationIgnored private let delay: @Sendable (TimeInterval) async throws -> Void
    @ObservationIgnored private var store: BulkUploadStore?
    @ObservationIgnored private var drainTask: Task<Void, Never>?
    @ObservationIgnored private var retryTask: Task<Void, Never>?
    @ObservationIgnored private var isDraining = false

    init(
        container: ModelContainer,
        api: BissbilanzAPI,
        appMode: AppModeManager,
        connectivity: ConnectivityMonitor,
        currentUserId: @escaping () -> String?,
        defaults: UserDefaults = .standard,
        imageIO: BulkImageIO = .live,
        delay: @escaping @Sendable (TimeInterval) async throws -> Void = { seconds in
            try await Task.sleep(for: .seconds(seconds))
        }
    ) {
        self.container = container
        self.api = api
        self.appMode = appMode
        self.connectivity = connectivity
        self.currentUserId = currentUserId
        self.defaults = defaults
        self.imageIO = imageIO
        self.delay = delay
        isPaused = defaults.bool(forKey: BulkUploadState.pausedKey)
        wifiOnly = defaults.bool(forKey: BulkUploadState.wifiOnlyKey)
        total = defaults.integer(forKey: BulkUploadState.totalKey)
        connectivity.onPathChange = { [weak self] in
            self?.start()
        }
    }

    // MARK: - Control

    /// Whether the user's choices and the network allow an upload right now.
    var canUpload: Bool {
        !isPaused && connectivity.isOnline && (!wifiOnly || !connectivity.isExpensive)
    }

    /// Starts uploading in the background of the app unless it already is, is paused, or the
    /// app is in Local mode.
    func start() {
        guard autoStart, drainTask == nil, !isPaused, !appMode.isLocal, currentUserId() != nil else { return }
        retryTask?.cancel()
        retryTask = nil
        drainTask = Task { [weak self] in
            guard let self else { return }
            await drain()
            drainTask = nil
        }
    }

    func pause() {
        isPaused = true
        drainTask?.cancel()
        drainTask = nil
        retryTask?.cancel()
        retryTask = nil
    }

    func resume() {
        isPaused = false
        if isDraining {
            scheduleRetry(after: 1)
        } else {
            start()
        }
    }

    /// Stops without changing the user's choices: sign-out, where the jobs go with the rest of
    /// the account's data.
    func stop() {
        drainTask?.cancel()
        drainTask = nil
        retryTask?.cancel()
        retryTask = nil
    }

    /// Sign-out and account deletion: forgets everything about the queue (its rows are wiped
    /// with the rest of the local data).
    func reset() {
        stop()
        pendingCount = 0
        failedCount = 0
        total = 0
        isPaused = false
        lastError = nil
        rateLimitedUntil = nil
    }

    func retryFailed() {
        guard let userId = currentUserId() else { return }
        Task {
            let store = await ensureStore()
            do {
                try await store.retryFailed(userId: userId)
            } catch {
                ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.retryFailed"])
            }
            await refreshCounts()
            start()
        }
    }

    /// An import just queued `count` foods.
    func noteImported(count: Int) async {
        setTotal(total + count)
        await refreshCounts()
        start()
    }

    // MARK: - Counts

    func refreshCounts() async {
        guard let userId = currentUserId() else {
            pendingCount = 0
            failedCount = 0
            return
        }
        let store = await ensureStore()
        do {
            let counts = try await store.counts(userId: userId)
            pendingCount = counts.pending
            failedCount = counts.failed
            let open = counts.pending + counts.failed
            if open == 0 {
                if total != 0 { setTotal(0) }
            } else if total < open {
                setTotal(open)
            }
        } catch {
            ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.refreshCounts"])
        }
    }

    private func setTotal(_ value: Int) {
        total = value
        defaults.set(value, forKey: BulkUploadState.totalKey)
    }

    // MARK: - Sync queue hook

    /// Whether `foodId` is an imported food that is not on the server yet. The sync queue asks
    /// before sending an operation that refers to a food, because the server would answer
    /// "not found"; asking also moves that food to the front of the upload.
    func isAwaitingUpload(foodId: String) -> Bool {
        guard total > 0 || pendingCount > 0 else { return false }
        let pending = BulkUploadJob.pendingState
        var descriptor = FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { $0.foodId == foodId && $0.state == pending }
        )
        descriptor.fetchLimit = 1
        let context = container.mainContext
        do {
            guard let job = try context.fetch(descriptor).first else { return false }
            if job.priority == 0 {
                job.priority = 1
                try context.save()
                start()
            }
            return true
        } catch {
            ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.isAwaitingUpload"])
            return false
        }
    }

    // MARK: - Draining

    /// Uploads until nothing is left or something stops it. Returns when it is done, blocked or
    /// cancelled — the background task awaits it, the foreground wraps it in a task.
    func drain() async {
        guard !isDraining, !appMode.isLocal, let userId = currentUserId() else { return }
        isDraining = true
        isUploading = true
        defer {
            isDraining = false
            isUploading = false
        }
        let store = await ensureStore()
        do {
            try await store.discardForeignJobs(currentUserId: userId)
        } catch {
            ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.discardForeignJobs"])
        }
        await refreshCounts()

        var lastRequestAt: Date?
        var transientFailures = 0
        var batchFailures = 0
        loop: while !Task.isCancelled {
            guard canUpload, currentUserId() == userId else { break }
            let request: BulkUploadRequest?
            do {
                request = try await store.prepareBatch(userId: userId, imageIO: imageIO)
            } catch {
                ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.prepareBatch"])
                lastError = error.localizedDescription
                break
            }
            guard let request else { break }

            if let lastRequestAt {
                let remaining = Self.minRequestInterval - Date().timeIntervalSince(lastRequestAt)
                if remaining > 0 {
                    guard await wait(remaining) else { break loop }
                }
            }
            lastRequestAt = Date()

            do {
                let results = try await api.postBulkFoods(body: request.body, boundary: request.boundary)
                _ = try await store.apply(results, to: request, imageIO: imageIO)
                transientFailures = 0
                batchFailures = 0
                lastError = nil
                rateLimitedUntil = nil
                await refreshCounts()
                onProgress?()
            } catch BulkUploadError.rateLimited(let retryAfter) {
                if Task.isCancelled { break loop }
                rateLimitedUntil = Date().addingTimeInterval(retryAfter)
                guard await wait(retryAfter) else { break loop }
                rateLimitedUntil = nil
            } catch let error as APIError {
                if Task.isCancelled { break loop }
                switch error {
                case .unauthorized, .updateRequired:
                    lastError = error.localizedDescription
                    break loop
                case .networkError:
                    transientFailures += 1
                    lastError = error.localizedDescription
                    if transientFailures >= Self.maxTransientFailures { break loop }
                    guard await wait(Self.backoff(transientFailures)) else { break loop }
                case let .serverError(status, _) where status >= 500:
                    transientFailures += 1
                    lastError = error.localizedDescription
                    if transientFailures >= Self.maxTransientFailures { break loop }
                    guard await wait(Self.backoff(transientFailures)) else { break loop }
                default:
                    batchFailures += 1
                    lastError = error.localizedDescription
                    ErrorReporter.captureWarning(
                        "Bulk food upload rejected", context: ["reason": ErrorReporter.reason(for: error)]
                    )
                    do {
                        try await store.recordFailure(of: request, reason: error.localizedDescription)
                    } catch {
                        ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.recordFailure"])
                        break loop
                    }
                    await refreshCounts()
                    if batchFailures >= Self.maxBatchFailures { break loop }
                }
            } catch {
                if Task.isCancelled { break loop }
                ErrorReporter.capture(error, context: ["operation": "BulkUploadManager.drain"])
                lastError = error.localizedDescription
                break loop
            }
        }

        await refreshCounts()
        if pendingCount > 0, canUpload, lastError != nil, !Task.isCancelled {
            scheduleRetry(after: Self.retryDelay)
        }
    }

    /// Waits `seconds`; false when the task was cancelled meanwhile (`delay` throws nothing else).
    private func wait(_ seconds: TimeInterval) async -> Bool {
        do {
            try await delay(seconds)
            return true
        } catch {
            ErrorReporter.addBreadcrumb("bulk upload wait ended early: \(error)", category: "sync")
            return false
        }
    }

    nonisolated static func backoff(_ failures: Int) -> TimeInterval {
        min(backoffBase * pow(2.0, Double(max(failures - 1, 0))), backoffCap)
    }

    private func scheduleRetry(after interval: TimeInterval) {
        guard autoStart else { return }
        retryTask?.cancel()
        retryTask = Task { [weak self] in
            guard let self else { return }
            guard await wait(interval) else { return }
            retryTask = nil
            start()
        }
    }

    /// The store is created in a detached task: a `@ModelActor` runs on the executor it was
    /// created on, and created here it would do its fetches on the main thread.
    private func ensureStore() async -> BulkUploadStore {
        if let store { return store }
        let container = container
        let created = await Task.detached(priority: .utility) {
            BulkUploadStore(modelContainer: container)
        }.value
        if let store { return store }
        store = created
        return created
    }
}
