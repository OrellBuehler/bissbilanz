import Foundation

/// A meal queued for the assistant, as kept on disk between launches.
///
/// The photos sit next to it as `photo_<n>.jpg`, already downscaled — encoding
/// happens once, before the first attempt, so a retry after a relaunch costs only
/// the upload.
struct PersistedAiTaskUpload: Codable, Equatable, Sendable {
    var description: String?
    var date: String
    var mealType: String?
    var eatenAt: String?
    var photoCount: Int
    var queuedAt: Date
    /// The last failure the user has to act on. Nil while the upload is still
    /// worth retrying on its own.
    var failure: String?
    /// False once the server rejected the payload itself (a 4xx): retrying the
    /// same bytes cannot succeed, so a relaunch shows it as failed instead of
    /// re-sending it.
    var retryable: Bool = true
}

/// Disk layout for `AiTaskStore`'s upload queue: one directory per upload under
/// Application Support, holding `meta.json` plus the encoded photos.
///
/// The queue used to live only in memory, and an upload cut off by the ~30s
/// background grant vanished with the next app termination — no task on the
/// server, no failed row in the list, nothing in Sentry. Keeping it here is what
/// lets the next launch pick it up again.
enum AiTaskUploadDisk {
    static let directoryName = "AiTaskUploads"
    private static let metaFilename = "meta.json"

    static var defaultRoot: URL {
        let base = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent(directoryName, isDirectory: true)
    }

    static func directory(for id: UUID, root: URL) -> URL {
        root.appendingPathComponent(id.uuidString, isDirectory: true)
    }

    static func photoFilename(_ index: Int) -> String {
        "photo_\(index).jpg"
    }

    /// Writes the record and its photos. Photos go first so a crash between the
    /// two leaves a directory without `meta.json`, which `loadAll` ignores.
    static func save(_ meta: PersistedAiTaskUpload, photos: [Data], id: UUID, root: URL) throws {
        let dir = directory(for: id, root: root)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for (index, data) in photos.enumerated() {
            try data.write(to: dir.appendingPathComponent(photoFilename(index)), options: .atomic)
        }
        try writeMeta(meta, id: id, root: root)
    }

    static func writeMeta(_ meta: PersistedAiTaskUpload, id: UUID, root: URL) throws {
        let dir = directory(for: id, root: root)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(meta).write(to: dir.appendingPathComponent(metaFilename), options: .atomic)
    }

    static func loadMeta(id: UUID, root: URL) -> PersistedAiTaskUpload? {
        let url = directory(for: id, root: root).appendingPathComponent(metaFilename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(PersistedAiTaskUpload.self, from: data)
    }

    /// Every upload with a readable record, oldest first.
    static func loadAll(root: URL) -> [(id: UUID, meta: PersistedAiTaskUpload)] {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: root.path) else {
            return []
        }
        return names
            .compactMap { name -> (id: UUID, meta: PersistedAiTaskUpload)? in
                guard let id = UUID(uuidString: name), let meta = loadMeta(id: id, root: root) else {
                    return nil
                }
                return (id, meta)
            }
            .sorted { $0.meta.queuedAt < $1.meta.queuedAt }
    }

    /// The photos in upload order. A missing file is skipped rather than failing
    /// the whole meal: the description still reaches the assistant.
    static func photos(id: UUID, root: URL) -> [Data] {
        guard let meta = loadMeta(id: id, root: root) else { return [] }
        let dir = directory(for: id, root: root)
        return (0 ..< meta.photoCount).compactMap { index in
            try? Data(contentsOf: dir.appendingPathComponent(photoFilename(index)))
        }
    }

    static func remove(id: UUID, root: URL) {
        try? FileManager.default.removeItem(at: directory(for: id, root: root))
    }
}
