import Foundation
import Observation
import UIKit

/// What the capture sheet hands over; the photos are still full-size `UIImage`s
/// because encoding them belongs off the main thread, in the store's task.
struct AiTaskUploadDraft: Sendable {
    var description: String?
    var images: [UIImage]
    var date: String
    var mealType: String?
    var eatenAt: String?
}

/// A meal on its way to the server. Stays in `pendingUploads` until the task
/// exists server-side, or until the user retries or discards a failed one.
struct PendingAiTaskUpload: Identifiable, Equatable {
    enum State: Equatable {
        case sending
        case failed(String, retryable: Bool)
    }

    let id: UUID
    var description: String?
    var photoCount: Int
    var date: String
    var mealType: String?
    var eatenAt: String?
    var state: State
}

/// AI tasks, held in memory rather than in SwiftData.
///
/// Deliberately not the local-first pattern the other repositories use: a task is only
/// ever resolved by the MCP assistant server-side, so a local mirror could never be
/// authoritative and there is nothing to queue — the web client made the same call and
/// skips its Dexie mirror. In Local mode the queue does not exist at all.
///
/// The one thing that *is* queued is the upload itself. It runs in a task the store
/// owns, so dismissing the capture sheet or leaving the app does not cancel it, and
/// it is written to disk (`AiTaskUploadDisk`) before the first request, so an app
/// termination while it is in flight cannot lose the meal: the next activation calls
/// `restorePendingUploads()` and sends it again under the same idempotency key.
@MainActor
@Observable
final class AiTaskStore {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let uploadRoot: URL

    private(set) var tasks: [AiTask] = []
    private(set) var pendingUploads: [PendingAiTaskUpload] = []
    /// Photos of a freshly queued meal, until the first attempt has encoded them to disk.
    private var freshImages: [UUID: [UIImage]] = [:]
    /// One per pending upload; the key doubles as the create call's idempotency key,
    /// so a retry after a failure the server never reported cannot duplicate the task.
    private var uploadTasks: [UUID: Task<Void, Never>] = [:]
    private var backgroundTasks: [UUID: UIBackgroundTaskIdentifier] = [:]
    /// Bumped by every `start`, so an attempt superseded by a retry cannot overwrite
    /// the newer attempt's state when its cancellation lands.
    private var generations: [UUID: Int] = [:]
    private var attempts: [UUID: Int] = [:]
    /// Uploads whose background grant ran out — a cancellation that is a real failure.
    private var expiredInBackground: Set<UUID> = []
    private var restoringUploads = false

    init(api: BissbilanzAPI, appMode: AppModeManager, uploadRoot: URL = AiTaskUploadDisk.defaultRoot) {
        self.api = api
        self.appMode = appMode
        self.uploadRoot = uploadRoot
    }

    /// Photo size the server keeps (it downsizes every AI task photo to 1024px), so
    /// sending more only costs upload time on a weak uplink.
    private static let uploadMaxDimension: CGFloat = 1024
    private static let uploadQuality: CGFloat = 0.75

    /// Returns immediately; the upload continues in the background.
    func enqueue(_ draft: AiTaskUploadDraft) {
        let id = UUID()
        freshImages[id] = draft.images
        pendingUploads.append(PendingAiTaskUpload(
            id: id,
            description: draft.description,
            photoCount: draft.images.count,
            date: draft.date,
            mealType: draft.mealType,
            eatenAt: draft.eatenAt,
            state: .sending
        ))
        ErrorReporter.addBreadcrumb("AI task queued", category: "ai_task", data: [
            "upload_id": id.uuidString,
            "photo_count": draft.images.count,
            "has_description": draft.description != nil,
            "date": draft.date
        ])
        start(id)
    }

    /// Picks up uploads an earlier launch left on disk. Safe to call on every
    /// activation: uploads already listed are left alone.
    ///
    /// A non-empty result means the app was terminated with a meal in flight —
    /// precisely the case that used to lose it — so it is reported as a warning,
    /// not just a breadcrumb.
    func restorePendingUploads() async {
        guard !appMode.isLocal, !restoringUploads else { return }
        restoringUploads = true
        defer { restoringUploads = false }
        let root = uploadRoot
        let active = Set(pendingUploads.map(\.id))
        let records = await Task.detached(priority: .utility) {
            AiTaskUploadDisk.sweep(root: root, protecting: active)
            return AiTaskUploadDisk.loadAll(root: root)
        }.value
        let restored = records.filter { item in !pendingUploads.contains { $0.id == item.id } }
        guard !restored.isEmpty else { return }

        let unreported = restored.filter { $0.meta.restoreReportedAt == nil }
        await Task.detached(priority: .utility) {
            for item in unreported {
                guard var meta = AiTaskUploadDisk.loadMeta(id: item.id, root: root) else { continue }
                meta.restoreReportedAt = Date()
                try? AiTaskUploadDisk.writeMeta(meta, id: item.id, root: root)
            }
        }.value
        var resumed = 0
        for item in restored {
            let failed = item.meta.retryable ? nil : (item.meta.failure ?? L10n.aiTaskUploadFailedBody)
            pendingUploads.append(PendingAiTaskUpload(
                id: item.id,
                description: item.meta.description,
                photoCount: item.meta.photoCount,
                date: item.meta.date,
                mealType: item.meta.mealType,
                eatenAt: item.meta.eatenAt,
                state: failed.map { .failed($0, retryable: false) } ?? .sending
            ))
            if item.meta.retryable {
                resumed += 1
                start(item.id)
            }
        }
        guard !unreported.isEmpty else { return }
        let oldest = unreported.map(\.meta.queuedAt).min() ?? Date()
        ErrorReporter.captureWarning("AI task uploads restored from disk", context: [
            "count": restored.count,
            "resumed": resumed,
            "oldest_age_seconds": Int(Date().timeIntervalSince(oldest)),
            "previous_failures": restored.compactMap(\.meta.failure)
        ])
    }

    func retryUpload(id: UUID) {
        guard let index = pendingUploads.firstIndex(where: { $0.id == id }) else { return }
        guard case .failed(_, retryable: true) = pendingUploads[index].state else { return }
        if var meta = AiTaskUploadDisk.loadMeta(id: id, root: uploadRoot) {
            meta.retryable = true
            meta.failure = nil
            try? AiTaskUploadDisk.writeMeta(meta, id: id, root: uploadRoot)
        }
        pendingUploads[index].state = .sending
        ErrorReporter.addBreadcrumb("AI task upload retried", category: "ai_task", data: [
            "upload_id": id.uuidString
        ])
        start(id)
    }

    func discardUpload(id: UUID) {
        pendingUploads.removeAll { $0.id == id }
        freshImages[id] = nil
        uploadTasks[id]?.cancel()
        uploadTasks[id] = nil
        attempts[id] = nil
        let root = uploadRoot
        Task.detached(priority: .utility) { AiTaskUploadDisk.remove(id: id, root: root) }
        ErrorReporter.addBreadcrumb("AI task upload discarded", category: "ai_task", data: [
            "upload_id": id.uuidString
        ])
    }

    private func start(_ id: UUID) {
        uploadTasks[id]?.cancel()
        let generation = (generations[id] ?? 0) + 1
        generations[id] = generation
        uploadTasks[id] = Task { [weak self] in
            await self?.run(id, generation: generation)
        }
    }

    private func run(_ id: UUID, generation: Int) async {
        guard let pending = pendingUploads.first(where: { $0.id == id }) else { return }
        let attempt = (attempts[id] ?? 0) + 1
        attempts[id] = attempt
        // Keep running for the ~30s iOS grants after the user leaves the app; a
        // foreground URLSession task would otherwise die with the suspension.
        backgroundTasks[id] = UIApplication.shared.beginBackgroundTask(withName: "ai-task-upload") { [weak self] in
            guard let self else { return }
            expiredInBackground.insert(id)
            uploadTasks[id]?.cancel()
            endBackgroundTask(id)
        }
        defer {
            if generations[id] == generation || generations[id] == nil {
                endBackgroundTask(id)
                expiredInBackground.remove(id)
            }
        }

        let root = uploadRoot
        var phase = "encode"
        let startedAt = Date()
        do {
            if let images = freshImages[id] {
                let maxDimension = Self.uploadMaxDimension
                let quality = Self.uploadQuality
                // JPEG encoding of a few 48MP captures is a visible main-thread hang.
                let encoded: [Data] = await Task.detached(priority: .userInitiated) {
                    images.compactMap { $0.downscaledJPEGData(maxDimension: maxDimension, quality: quality) }
                }.value
                try await Task.detached(priority: .userInitiated) {
                    try AiTaskUploadDisk.save(
                        PersistedAiTaskUpload(
                            description: pending.description,
                            date: pending.date,
                            mealType: pending.mealType,
                            eatenAt: pending.eatenAt,
                            photoCount: encoded.count,
                            queuedAt: Date()
                        ),
                        photos: encoded, id: id, root: root
                    )
                }.value
                guard generations[id] == generation, pendingUploads.contains(where: { $0.id == id }) else {
                    if !pendingUploads.contains(where: { $0.id == id }) {
                        await Task.detached(priority: .utility) { AiTaskUploadDisk.remove(id: id, root: root) }.value
                    }
                    return
                }
                freshImages[id] = nil
                if encoded.count != images.count {
                    ErrorReporter.captureWarning("AI task photos dropped while encoding", context: [
                        "upload_id": id.uuidString,
                        "picked": images.count,
                        "encoded": encoded.count
                    ])
                }
            }
            try Task.checkCancellation()

            let photos = await Task.detached(priority: .userInitiated) {
                AiTaskUploadDisk.photos(id: id, root: root)
            }.value
            try Task.checkCancellation()
            phase = "photos"
            let photoUrls = photos.isEmpty ? nil : try await api.uploadAiTaskPhotos(
                photos.enumerated().map { (data: $0.element, filename: "meal_\($0.offset).jpg") }
            )
            try Task.checkCancellation()

            phase = "create"
            let created = try await api.createAiTask(
                AiTaskCreate(
                    description: pending.description,
                    photoUrls: photoUrls,
                    date: pending.date,
                    mealType: pending.mealType,
                    eatenAt: pending.eatenAt,
                    source: "ios"
                ),
                idempotencyKey: id.uuidString
            )
            guard generations[id] == generation else { return }
            ErrorReporter.addBreadcrumb("AI task created", category: "ai_task", data: [
                "upload_id": id.uuidString,
                "task_id": created.id,
                "photo_count": photos.count,
                "attempt": attempt,
                "seconds": Int(Date().timeIntervalSince(startedAt))
            ])
            await Task.detached(priority: .utility) { AiTaskUploadDisk.remove(id: id, root: root) }.value
            pendingUploads.removeAll { $0.id == id }
            uploadTasks[id] = nil
            attempts[id] = nil
            generations[id] = nil
            try? await refresh()
        } catch is CancellationError {
            let expired = expiredInBackground.remove(id) != nil
            // A retry superseded this attempt, or the user discarded it (it is
            // already gone from the list): nothing to report either way.
            guard generations[id] == generation, pendingUploads.contains(where: { $0.id == id }) else {
                return
            }
            markFailed(id, message: L10n.aiTaskUploadFailedBody, retryable: true)
            reportFailure(
                id: id, phase: phase, attempt: attempt, startedAt: startedAt,
                reason: expired ? "background_expired" : "cancelled", retryable: true, pending: pending
            )
            // The grant ran out because the user left — they are not looking at
            // the list, so this is the only way they hear the meal did not go out.
            if expired {
                await AiTaskNotifier.notifyUploadFailed(description: pending.description)
            }
        } catch {
            guard generations[id] == generation else { return }
            let retryable = Self.isRetryable(error)
            markFailed(id, message: error.localizedDescription, retryable: retryable)
            reportFailure(
                id: id, phase: phase, attempt: attempt, startedAt: startedAt,
                reason: ErrorReporter.reason(for: error), retryable: retryable, pending: pending
            )
            if UIApplication.shared.applicationState != .active {
                await AiTaskNotifier.notifyUploadFailed(description: pending.description)
            }
        }
    }

    /// Whether sending the same bytes again can succeed. A 4xx says the payload
    /// itself was refused (bar the two transient ones), so a relaunch must not
    /// keep re-sending it; everything else is the network or the server's day.
    nonisolated static func isRetryable(_ error: Error) -> Bool {
        switch error as? APIError {
        case .badRequest, .notFound, .gone, .conflict:
            false
        case let .serverError(code, _):
            code < 400 || code >= 500 || code == 408 || code == 429
        default:
            true
        }
    }

    /// Every failed attempt is reported as a warning with its classified reason.
    /// `ErrorReporter.capture` drops offline/timeout/401/cancelled as noise, which
    /// for most calls they are — here they are the whole story of a lost meal.
    private func reportFailure(
        id: UUID, phase: String, attempt: Int, startedAt: Date,
        reason: String, retryable: Bool, pending: PendingAiTaskUpload
    ) {
        let app = UIApplication.shared
        let appState: String = switch app.applicationState {
        case .active: "active"
        case .inactive: "inactive"
        case .background: "background"
        @unknown default: "unknown"
        }
        var context: [String: Any] = [
            "upload_id": id.uuidString,
            "phase": phase,
            "reason": reason,
            "retryable": retryable,
            "attempt": attempt,
            "seconds": Int(Date().timeIntervalSince(startedAt)),
            "photo_count": pending.photoCount,
            "has_description": pending.description != nil,
            "app_state": appState
        ]
        if app.applicationState != .active {
            context["background_time_remaining"] = Int(app.backgroundTimeRemaining)
        }
        // "cancelled" is filtered by captureWarning; it only reaches here when a
        // cancellation was not a discard or a retry, which is worth a look.
        ErrorReporter.captureWarning("AI task upload failed", context: context)
    }

    private func endBackgroundTask(_ id: UUID) {
        guard let token = backgroundTasks.removeValue(forKey: id) else { return }
        UIApplication.shared.endBackgroundTask(token)
    }

    private func markFailed(_ id: UUID, message: String, retryable: Bool) {
        guard let index = pendingUploads.firstIndex(where: { $0.id == id }) else { return }
        pendingUploads[index].state = .failed(message, retryable: retryable)
        uploadTasks[id] = nil
        if var meta = AiTaskUploadDisk.loadMeta(id: id, root: uploadRoot) {
            meta.failure = message
            meta.retryable = retryable
            try? AiTaskUploadDisk.writeMeta(meta, id: id, root: uploadRoot)
        }
    }

    var unreadDismissals: [AiTask] {
        tasks.filter(\.isUnreadDismissal)
    }

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        tasks = try await api.listAiTasks(limit: 100).tasks
    }

    /// Clears the unread badge for every resolved task. Called when the user opens the
    /// list — posting a notification does not count as reading it, which is what lets
    /// each of the user's devices announce the same dismissal once.
    func acknowledgeAll() async {
        guard !appMode.isLocal, !unreadDismissals.isEmpty else { return }
        do {
            try await api.acknowledgeAiTasks()
            try await refresh()
        } catch {
            // Leave the badge up rather than pretending it was read.
            ErrorReporter.capture(error, context: ["op": "acknowledgeAiTasks"])
        }
    }

    func delete(id: String) async throws {
        guard !appMode.isLocal else { return }
        try await api.deleteAiTask(id: id)
        tasks.removeAll { $0.id == id }
    }
}
