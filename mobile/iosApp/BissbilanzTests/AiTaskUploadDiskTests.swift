@testable import Bissbilanz
import Foundation
import Testing

@Suite("AI Task Upload Disk Tests")
struct AiTaskUploadDiskTests {
    private func tempRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("ai-task-upload-tests-\(UUID().uuidString)", isDirectory: true)
    }

    @Test("Round-trips a record and its photos, oldest first")
    func roundTrip() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        let older = UUID()
        let newer = UUID()
        let olderMeta = PersistedAiTaskUpload(
            description: "Lunch", date: "2026-09-09", mealType: "Lunch", eatenAt: nil,
            photoCount: 2, queuedAt: Date(timeIntervalSince1970: 1_000)
        )
        let newerMeta = PersistedAiTaskUpload(
            description: nil, date: "2026-09-09", mealType: nil, eatenAt: "2026-09-09T10:00:00Z",
            photoCount: 0, queuedAt: Date(timeIntervalSince1970: 2_000)
        )
        try AiTaskUploadDisk.save(newerMeta, photos: [], id: newer, root: root)
        try AiTaskUploadDisk.save(
            olderMeta, photos: [Data([1, 2]), Data([3])], id: older, root: root
        )

        let all = AiTaskUploadDisk.loadAll(root: root)
        #expect(all.map(\.id) == [older, newer])
        #expect(all.first?.meta == olderMeta)
        #expect(AiTaskUploadDisk.photos(id: older, root: root) == [Data([1, 2]), Data([3])])
        #expect(AiTaskUploadDisk.photos(id: newer, root: root).isEmpty)

        AiTaskUploadDisk.remove(id: older, root: root)
        #expect(AiTaskUploadDisk.loadAll(root: root).map(\.id) == [newer])
    }

    @Test("Ignores directories without a readable record")
    func skipsHalfWrittenUploads() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let id = UUID()
        try FileManager.default.createDirectory(
            at: AiTaskUploadDisk.directory(for: id, root: root), withIntermediateDirectories: true
        )
        try FileManager.default.createDirectory(
            at: root.appendingPathComponent("not-a-uuid"), withIntermediateDirectories: true
        )
        #expect(AiTaskUploadDisk.loadAll(root: root).isEmpty)
        #expect(AiTaskUploadDisk.photos(id: id, root: root).isEmpty)
    }

    @Test("Marks a failure without touching the photos")
    func updatesMetaInPlace() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let id = UUID()
        var meta = PersistedAiTaskUpload(
            description: "Dinner", date: "2026-09-09", mealType: nil, eatenAt: nil,
            photoCount: 1, queuedAt: Date(timeIntervalSince1970: 1_000)
        )
        try AiTaskUploadDisk.save(meta, photos: [Data([9])], id: id, root: root)
        meta.failure = "Bad request"
        meta.retryable = false
        try AiTaskUploadDisk.writeMeta(meta, id: id, root: root)

        let loaded = AiTaskUploadDisk.loadMeta(id: id, root: root)
        #expect(loaded?.failure == "Bad request")
        #expect(loaded?.retryable == false)
        #expect(AiTaskUploadDisk.photos(id: id, root: root) == [Data([9])])
    }

    @Test("Sweeps abandoned failures and incomplete saves, preserving recoverable uploads")
    func sweepsAbandonedUploads() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let now = Date()
        let failed = UUID(), retryable = UUID(), orphan = UUID(), active = UUID()
        var meta = PersistedAiTaskUpload(
            description: "Lunch", date: "2026-09-09", mealType: nil, eatenAt: nil,
            photoCount: 1, queuedAt: now.addingTimeInterval(-31 * 86400)
        )
        try AiTaskUploadDisk.save(meta, photos: [Data([1])], id: retryable, root: root)
        meta.retryable = false
        try AiTaskUploadDisk.save(meta, photos: [Data([1])], id: failed, root: root)
        for id in [orphan, active] {
            try FileManager.default.createDirectory(
                at: AiTaskUploadDisk.directory(for: id, root: root),
                withIntermediateDirectories: true
            )
        }
        try FileManager.default.setAttributes(
            [.modificationDate: now.addingTimeInterval(-7200)],
            ofItemAtPath: AiTaskUploadDisk.directory(for: orphan, root: root).path
        )
        AiTaskUploadDisk.sweep(root: root, protecting: [active], now: now)
        #expect(AiTaskUploadDisk.loadAll(root: root).map(\.id) == [retryable])
        #expect(!FileManager.default.fileExists(atPath: AiTaskUploadDisk.directory(for: orphan, root: root).path))
        #expect(FileManager.default.fileExists(atPath: AiTaskUploadDisk.directory(for: active, root: root).path))
    }

    @Test("Keeps at most one hundred permanent failures, newest first")
    func capsFailedQueue() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let now = Date()
        var ids: [UUID] = []
        for index in 0 ... 100 {
            let id = UUID()
            ids.append(id)
            var meta = PersistedAiTaskUpload(
                description: nil,
                date: "2026-09-09",
                mealType: nil,
                eatenAt: nil,
                photoCount: 0,
                queuedAt: now.addingTimeInterval(Double(index - 100))
            )
            meta.retryable = false
            try AiTaskUploadDisk.save(meta, photos: [], id: id, root: root)
        }
        AiTaskUploadDisk.sweep(root: root, now: now)
        #expect(AiTaskUploadDisk.loadAll(root: root).map(\.id) == Array(ids.dropFirst()))
    }

    @Test("Restore reporting marker survives relaunch")
    func persistsRestoreMarker() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let id = UUID()
        var meta = PersistedAiTaskUpload(
            description: nil,
            date: "2026-09-09",
            mealType: nil,
            eatenAt: nil,
            photoCount: 0,
            queuedAt: Date()
        )
        try AiTaskUploadDisk.save(meta, photos: [], id: id, root: root)
        #expect(AiTaskUploadDisk.loadMeta(id: id, root: root)?.restoreReportedAt == nil)
        meta.restoreReportedAt = Date(timeIntervalSince1970: 1000)
        try AiTaskUploadDisk.writeMeta(meta, id: id, root: root)
        #expect(AiTaskUploadDisk.loadMeta(id: id, root: root)?.restoreReportedAt == meta.restoreReportedAt)
    }

    @Test("Only payload rejections are permanent")
    func retryability() {
        #expect(!AiTaskStore.isRetryable(APIError.badRequest("nope")))
        #expect(!AiTaskStore.isRetryable(APIError.serverError(422, nil)))
        #expect(AiTaskStore.isRetryable(APIError.serverError(429, nil)))
        #expect(AiTaskStore.isRetryable(APIError.serverError(503, nil)))
        #expect(AiTaskStore.isRetryable(APIError.networkError(URLError(.timedOut))))
        #expect(AiTaskStore.isRetryable(APIError.unauthorized))
        #expect(AiTaskStore.isRetryable(CancellationError()))
    }
}
