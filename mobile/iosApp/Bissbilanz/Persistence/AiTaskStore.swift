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
struct PendingAiTaskUpload: Identifiable {
    enum State: Equatable {
        case sending
        case failed(String)
    }

    let id: UUID
    let draft: AiTaskUploadDraft
    var state: State
}

/// AI tasks, held in memory rather than in SwiftData.
///
/// Deliberately not the local-first pattern the other repositories use: a task is only
/// ever resolved by the MCP assistant server-side, so a local mirror could never be
/// authoritative and there is nothing to queue — the web client made the same call and
/// skips its Dexie mirror. In Local mode the queue does not exist at all.
///
/// The one thing that *is* queued is the upload itself: it runs in a task the store
/// owns, so dismissing the capture sheet or leaving the app no longer cancels it the
/// way it did while the sheet's own `Task` drove the request.
@MainActor
@Observable
final class AiTaskStore {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager

    private(set) var tasks: [AiTask] = []
    private(set) var pendingUploads: [PendingAiTaskUpload] = []
    /// One per pending upload; the key doubles as the create call's idempotency key,
    /// so a retry after a failure the server never reported cannot duplicate the task.
    private var uploadTasks: [UUID: Task<Void, Never>] = [:]
    private var backgroundTasks: [UUID: UIBackgroundTaskIdentifier] = [:]

    init(api: BissbilanzAPI, appMode: AppModeManager) {
        self.api = api
        self.appMode = appMode
    }

    /// Photo size the server keeps (it downsizes every AI task photo to 1024px), so
    /// sending more only costs upload time on a weak uplink.
    private static let uploadMaxDimension: CGFloat = 1024
    private static let uploadQuality: CGFloat = 0.75

    /// Returns immediately; the upload continues in the background.
    func enqueue(_ draft: AiTaskUploadDraft) {
        let id = UUID()
        pendingUploads.append(PendingAiTaskUpload(id: id, draft: draft, state: .sending))
        start(id)
    }

    func retryUpload(id: UUID) {
        guard let index = pendingUploads.firstIndex(where: { $0.id == id }) else { return }
        pendingUploads[index].state = .sending
        start(id)
    }

    func discardUpload(id: UUID) {
        uploadTasks[id]?.cancel()
        uploadTasks[id] = nil
        pendingUploads.removeAll { $0.id == id }
    }

    private func start(_ id: UUID) {
        uploadTasks[id]?.cancel()
        uploadTasks[id] = Task { [weak self] in
            await self?.run(id)
        }
    }

    private func run(_ id: UUID) async {
        guard let pending = pendingUploads.first(where: { $0.id == id }) else { return }
        // Keep running for the ~30s iOS grants after the user leaves the app; a
        // foreground URLSession task would otherwise die with the suspension.
        backgroundTasks[id] = UIApplication.shared.beginBackgroundTask { [weak self] in
            self?.uploadTasks[id]?.cancel()
            self?.endBackgroundTask(id)
        }
        defer { endBackgroundTask(id) }

        do {
            let images = pending.draft.images
            let maxDimension = Self.uploadMaxDimension
            let quality = Self.uploadQuality
            // JPEG encoding of a few 48MP captures is a visible main-thread hang.
            let parts: [(data: Data, filename: String)] = await Task.detached(priority: .userInitiated) {
                images.enumerated().compactMap { index, image in
                    image.downscaledJPEGData(maxDimension: maxDimension, quality: quality)
                        .map { (data: $0, filename: "meal_\(index).jpg") }
                }
            }.value
            try Task.checkCancellation()
            let photoUrls = parts.isEmpty ? nil : try await api.uploadAiTaskPhotos(parts)
            try Task.checkCancellation()
            _ = try await api.createAiTask(
                AiTaskCreate(
                    description: pending.draft.description,
                    photoUrls: photoUrls,
                    date: pending.draft.date,
                    mealType: pending.draft.mealType,
                    eatenAt: pending.draft.eatenAt,
                    source: "ios"
                ),
                idempotencyKey: id.uuidString
            )
            pendingUploads.removeAll { $0.id == id }
            uploadTasks[id] = nil
            try? await refresh()
        } catch is CancellationError {
            // Discarded, or the background grant ran out; a still-listed upload is
            // shown as failed so it can be retried.
            markFailed(id, message: L10n.aiTaskUploadFailedBody)
        } catch {
            ErrorReporter.capture(error, context: ["op": "enqueueAiTask"])
            markFailed(id, message: error.localizedDescription)
            if UIApplication.shared.applicationState != .active {
                await AiTaskNotifier.notifyUploadFailed(description: pending.draft.description)
            }
        }
    }

    private func endBackgroundTask(_ id: UUID) {
        guard let token = backgroundTasks.removeValue(forKey: id) else { return }
        UIApplication.shared.endBackgroundTask(token)
    }

    private func markFailed(_ id: UUID, message: String) {
        guard let index = pendingUploads.firstIndex(where: { $0.id == id }) else { return }
        pendingUploads[index].state = .failed(message)
        uploadTasks[id] = nil
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
