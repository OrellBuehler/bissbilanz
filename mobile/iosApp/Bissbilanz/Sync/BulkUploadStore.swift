import Foundation
import SwiftData

/// One bulk request, fully built off the main thread: the ids of its foods, in order, and
/// the multipart body.
struct BulkUploadRequest: Sendable, Equatable {
    let foodIds: [String]
    let body: Data
    let boundary: String
}

/// What one answered request did to the jobs it carried.
struct BulkUploadOutcome: Equatable, Sendable {
    /// Foods now on the server (`created` and `exists`): their jobs are gone.
    var uploaded = 0
    /// Jobs left for another request: a retry without the barcode, a new id, no answer.
    var requeued = 0
    /// Jobs the server turned down for good, parked for the user.
    var failed = 0
    /// Foods created without their photo (too large, unreadable, over the storage quota).
    var imagesDropped = 0
}

/// How photos reach and leave the disk. Injected so tests need no App Group directory.
struct BulkImageIO: Sendable {
    /// The bytes of a food's photo, nil when it has none on this device.
    var read: @Sendable (_ imageUrl: String) throws -> Data?
    /// Called once the server stored a food's photo under `serverUrl`: the local copy takes
    /// the cache's name for it, so the photo needs no second download.
    var adopt: @Sendable (_ localUrl: String, _ serverUrl: String) -> Void

    static let live = BulkImageIO(
        read: { imageUrl in
            guard let file = LocalImageStore.cachedFile(for: imageUrl) else { return nil }
            return try Data(contentsOf: file)
        },
        adopt: { localUrl, serverUrl in
            guard let source = LocalImageStore.cachedFile(for: localUrl),
                  let key = LocalImageStore.cacheKey(for: serverUrl),
                  let directory = LocalImageStore.directory
            else { return }
            let target = directory.appendingPathComponent(key)
            do {
                if FileManager.default.fileExists(atPath: target.path) {
                    try FileManager.default.removeItem(at: target)
                }
                try FileManager.default.moveItem(at: source, to: target)
            } catch {
                ErrorReporter.captureWarning(
                    "Adopting an uploaded food photo failed", context: ["reason": ErrorReporter.reason(for: error)]
                )
            }
        }
    )
}

/// The database half of the bulk upload, on its own executor so building a request of two
/// hundred foods and their photos, and applying the answer, never touch the main thread.
/// Create it in a detached task (see `BulkUploadManager`): a `@ModelActor` runs wherever
/// it was created.
@ModelActor
actor BulkUploadStore {
    static let maxItems = 200
    static let maxBodyBytes = 8 * 1024 * 1024
    static let maxImageBytes = 200 * 1024
    static let maxAttempts = 5

    // MARK: Counts and housekeeping

    func counts(userId: String) throws -> (pending: Int, failed: Int) {
        let pending = BulkUploadJob.pendingState
        let failed = BulkUploadJob.failedState
        let pendingCount = try modelContext.fetchCount(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { $0.userId == userId && $0.state == pending }
        ))
        let failedCount = try modelContext.fetchCount(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { $0.userId == userId && $0.state == failed }
        ))
        return (pendingCount, failedCount)
    }

    /// Another account's jobs are never uploaded. They are dropped together with the foods
    /// they stand for, which the signed-out account's mirror held and no longer owns.
    @discardableResult
    func discardForeignJobs(currentUserId: String) throws -> Int {
        let jobs = try modelContext.fetch(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { $0.userId != currentUserId }
        ))
        guard !jobs.isEmpty else { return 0 }
        let foodIds = jobs.map(\.foodId)
        for chunk in stride(from: 0, to: foodIds.count, by: 500).map({ Array(foodIds[$0 ..< min($0 + 500, foodIds.count)]) }) {
            let rows = try modelContext.fetch(FetchDescriptor<LocalFood>(
                predicate: #Predicate { chunk.contains($0.id) }
            ))
            for row in rows { modelContext.delete(row) }
        }
        for job in jobs { modelContext.delete(job) }
        try modelContext.save()
        return jobs.count
    }

    /// Puts the jobs of these foods at the front of the line.
    func prioritize(foodIds: [String]) throws {
        let ids = foodIds.map { $0.lowercased() }
        let pending = BulkUploadJob.pendingState
        let jobs = try modelContext.fetch(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { ids.contains($0.foodId) && $0.state == pending }
        ))
        for job in jobs { job.priority = 1 }
        try modelContext.save()
    }

    /// Parked jobs go back in the queue with their attempts reset.
    @discardableResult
    func retryFailed(userId: String) throws -> Int {
        let failed = BulkUploadJob.failedState
        let jobs = try modelContext.fetch(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { $0.userId == userId && $0.state == failed }
        ))
        for job in jobs {
            job.state = BulkUploadJob.pendingState
            job.attempts = 0
            job.lastError = nil
        }
        try modelContext.save()
        return jobs.count
    }

    // MARK: Building a request

    /// The next request: the foods of the first pending jobs (by priority, then age) as a
    /// multipart body, up to `maxItems` foods and about `maxBytes`. Jobs whose food was
    /// deleted since the import are dropped on the way, so a deleted food is never
    /// resurrected on the server. Nil when nothing is left to send.
    func prepareBatch(
        userId: String,
        imageIO: BulkImageIO,
        maxItems: Int = BulkUploadStore.maxItems,
        maxBytes: Int = BulkUploadStore.maxBodyBytes
    ) throws -> BulkUploadRequest? {
        let pending = BulkUploadJob.pendingState
        while true {
            var descriptor = FetchDescriptor<BulkUploadJob>(
                predicate: #Predicate { $0.userId == userId && $0.state == pending },
                sortBy: [SortDescriptor(\.priority, order: .reverse), SortDescriptor(\.createdAt)]
            )
            descriptor.fetchLimit = maxItems
            let jobs = try modelContext.fetch(descriptor)
            if jobs.isEmpty { return nil }

            let ids = jobs.map(\.foodId)
            let rows = try modelContext.fetch(FetchDescriptor<LocalFood>(
                predicate: #Predicate { ids.contains($0.id) }
            ))
            var rowsById: [String: LocalFood] = [:]
            for row in rows where rowsById[row.id] == nil { rowsById[row.id] = row }

            var items: [[String: Any]] = []
            var sentIds: [String] = []
            var images: [(id: String, filename: String, mimeType: String, data: Data)] = []
            var bytes = 0
            for job in jobs {
                guard let row = rowsById[job.foodId] else {
                    modelContext.delete(job)
                    continue
                }
                guard let food = row.toFood() else {
                    park(job, reason: "the stored food could not be read")
                    continue
                }
                if !items.isEmpty, bytes >= maxBytes { break }
                let id = job.foodId.lowercased()
                do {
                    items.append(try Self.item(for: food, id: id, dropBarcode: job.dropBarcode))
                } catch {
                    park(job, reason: error.localizedDescription)
                    continue
                }
                sentIds.append(job.foodId)
                bytes += 4096
                if let image = Self.image(of: food, id: id, imageIO: imageIO) {
                    images.append(image)
                    bytes += image.data.count
                }
            }
            try modelContext.save()
            guard !items.isEmpty else { continue }

            let boundary = "Boundary-\(UUID().uuidString)"
            let json = try JSONSerialization.data(withJSONObject: items)
            return BulkUploadRequest(
                foodIds: sentIds, body: Self.multipartBody(boundary: boundary, foods: json, images: images),
                boundary: boundary
            )
        }
    }

    private func park(_ job: BulkUploadJob, reason: String) {
        job.state = BulkUploadJob.failedState
        job.lastError = reason
    }

    /// The food as the route takes it: the create fields plus the client's id and labels.
    /// Fields only the app knows (owner, timestamps) are left off, and so is a local photo
    /// URL, which the route would reject — the photo travels as its own part.
    private static func item(for food: Food, id: String, dropBarcode: Bool) throws -> [String: Any] {
        var item = try JSONPatch.dictionary(of: food)
        for key in ["userId", "createdAt", "updatedAt", "serverModifiedAt"] {
            item.removeValue(forKey: key)
        }
        if let imageUrl = item["imageUrl"] as? String, !isRemoteImageUrl(imageUrl) {
            item.removeValue(forKey: "imageUrl")
        }
        if dropBarcode { item.removeValue(forKey: "barcode") }
        item["id"] = id
        return item
    }

    private static func isRemoteImageUrl(_ url: String) -> Bool {
        (url.hasPrefix("/") && !url.hasPrefix("//")) || url.hasPrefix("http://") || url.hasPrefix("https://")
    }

    private static func image(
        of food: Food, id: String, imageIO: BulkImageIO
    ) -> (id: String, filename: String, mimeType: String, data: Data)? {
        guard let url = food.imageUrl, url.hasPrefix("file://") else { return nil }
        do {
            guard let data = try imageIO.read(url), !data.isEmpty, data.count <= maxImageBytes else { return nil }
            let filename = "\(id).\(URL(string: url)?.pathExtension.lowercased() ?? "webp")"
            return (id, filename, BissbilanzAPI.imageMimeType(forFilename: filename), data)
        } catch {
            ErrorReporter.captureWarning(
                "Reading a food photo for upload failed", context: ["reason": ErrorReporter.reason(for: error)]
            )
            return nil
        }
    }

    private static func multipartBody(
        boundary: String,
        foods: Data,
        images: [(id: String, filename: String, mimeType: String, data: Data)]
    ) -> Data {
        var body = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"foods\"\r\nContent-Type: application/json\r\n\r\n".utf8))
        body.append(foods)
        body.append(Data("\r\n".utf8))
        for image in images {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"image.\(image.id)\"; filename=\"\(image.filename)\"\r\n".utf8))
            body.append(Data("Content-Type: \(image.mimeType)\r\n\r\n".utf8))
            body.append(image.data)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))
        return body
    }

    // MARK: Applying the answer

    /// Writes what the server said into the jobs and foods of one request. A job that is
    /// gone by now (signed out, food deleted meanwhile) is simply skipped.
    func apply(
        _ results: [BulkFoodResult],
        to request: BulkUploadRequest,
        imageIO: BulkImageIO
    ) throws -> BulkUploadOutcome {
        var outcome = BulkUploadOutcome()
        var resultsById: [String: BulkFoodResult] = [:]
        for result in results where resultsById[result.id.lowercased()] == nil {
            resultsById[result.id.lowercased()] = result
        }
        let ids = request.foodIds
        let jobs = try modelContext.fetch(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { ids.contains($0.foodId) }
        ))
        var jobsByFood: [String: BulkUploadJob] = [:]
        for job in jobs where jobsByFood[job.foodId] == nil { jobsByFood[job.foodId] = job }

        for id in request.foodIds {
            guard let job = jobsByFood[id] else { continue }
            guard let result = resultsById[id.lowercased()] else {
                retry(job, reason: "the server sent no result for it", outcome: &outcome)
                continue
            }
            switch result.status {
            case "created", "exists":
                try finish(job, result: result, imageIO: imageIO, outcome: &outcome)
            case "duplicate_barcode":
                if job.dropBarcode {
                    park(job, reason: "the barcode is already used by another food")
                    outcome.failed += 1
                } else {
                    job.dropBarcode = true
                    outcome.requeued += 1
                }
            case "id_conflict":
                if job.attempts + 1 < Self.maxAttempts, remap(job) {
                    outcome.requeued += 1
                } else {
                    park(job, reason: "its id is taken and the food could not be re-keyed")
                    outcome.failed += 1
                }
            case "invalid":
                park(job, reason: result.message ?? "the server rejected the food")
                outcome.failed += 1
            default:
                retry(job, reason: "unexpected status \(result.status)", outcome: &outcome)
            }
        }
        try modelContext.save()
        return outcome
    }

    /// A request that failed as a whole: every job in it used an attempt, and one that
    /// has used `maxAttempts` is parked.
    func recordFailure(of request: BulkUploadRequest, reason: String) throws {
        let ids = request.foodIds
        let jobs = try modelContext.fetch(FetchDescriptor<BulkUploadJob>(
            predicate: #Predicate { ids.contains($0.foodId) }
        ))
        var ignored = BulkUploadOutcome()
        for job in jobs { retry(job, reason: reason, outcome: &ignored) }
        try modelContext.save()
    }

    private func retry(_ job: BulkUploadJob, reason: String, outcome: inout BulkUploadOutcome) {
        job.attempts += 1
        job.lastError = reason
        if job.attempts >= Self.maxAttempts {
            park(job, reason: reason)
            outcome.failed += 1
        } else {
            outcome.requeued += 1
        }
    }

    private func finish(
        _ job: BulkUploadJob,
        result: BulkFoodResult,
        imageIO: BulkImageIO,
        outcome: inout BulkUploadOutcome
    ) throws {
        if let serverUrl = result.imageUrl {
            let foodId = job.foodId
            var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == foodId })
            descriptor.fetchLimit = 1
            if let row = try modelContext.fetch(descriptor).first, let food = row.toFood() {
                let localUrl = food.imageUrl
                let patched = try JSONPatch.merged(Food.self, base: food, patch: ["imageUrl": serverUrl])
                row.update(from: patched)
                if let localUrl, localUrl.hasPrefix("file://") { imageIO.adopt(localUrl, serverUrl) }
            }
        } else if let message = result.message, message.hasPrefix("image_") || message == "quota_exceeded" {
            outcome.imagesDropped += 1
        }
        modelContext.delete(job)
        outcome.uploaded += 1
    }

    /// Gives the food a new id after the server said the old one belongs to someone else,
    /// and rewrites the diary entries that already point at it. Whether it worked.
    private func remap(_ job: BulkUploadJob) -> Bool {
        let oldId = job.foodId
        let newId = UUID().uuidString.lowercased()
        do {
            var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == oldId })
            descriptor.fetchLimit = 1
            guard let row = try modelContext.fetch(descriptor).first, let food = row.toFood() else { return false }
            let patched = try JSONPatch.merged(Food.self, base: food, patch: ["id": newId])
            row.id = newId
            row.update(from: patched)
            let entries = try modelContext.fetch(FetchDescriptor<LocalEntry>(
                predicate: #Predicate { $0.foodId == oldId }
            ))
            for entry in entries {
                entry.foodId = newId
                if let decoded = entry.toEntry() {
                    entry.jsonData = LocalStoreCoding.encode(
                        try JSONPatch.merged(Entry.self, base: decoded, patch: ["foodId": newId])
                    )
                }
            }
            job.foodId = newId
            job.attempts += 1
            return true
        } catch {
            ErrorReporter.captureWarning(
                "Re-keying a bulk food failed", context: ["reason": ErrorReporter.reason(for: error)]
            )
            return false
        }
    }
}
