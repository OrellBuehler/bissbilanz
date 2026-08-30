import Foundation

/// On-disk home for food and recipe images.
///
/// One directory serves three needs, all keyed by the server's own filename (a
/// UUID, so collision-free): the offline cache for server-hosted images, the
/// destination the account downgrade localizes photos into, and the home of
/// images attached while in Local mode, which have no server to live on.
///
/// It sits in the App Group container next to the SwiftData store, so widgets
/// can reach it later without a second migration.
enum LocalImageStore {
    static let directoryName = "local-images"

    /// Filenames `processImage` produces server-side, and the only shape the
    /// `/uploads/` route will serve.
    private static let uploadNameCharacters = Set("0123456789abcdef-")

    static var directory: URL? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: WidgetSnapshotStore.appGroupId)
        else { return nil }
        let dir = container.appendingPathComponent(directoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    /// The cache key for an image URL, or nil if it isn't one of our uploads.
    static func cacheKey(for imageUrl: String?) -> String? {
        guard let imageUrl, imageUrl.hasPrefix("/uploads/") else { return nil }
        let name = String(imageUrl.dropFirst("/uploads/".count))
        let stem = name.dropLast(".webp".count)
        guard name.hasSuffix(".webp"), !stem.isEmpty,
              stem.allSatisfy({ uploadNameCharacters.contains($0) })
        else { return nil }
        return name
    }

    /// Resolves an image URL to a file inside this directory, whether it is a
    /// cached upload or a locally-attached `file://` photo. Confined to the
    /// directory itself: a stored row must never be able to point the app at an
    /// arbitrary file.
    static func fileURL(for imageUrl: String?) -> URL? {
        guard let imageUrl, let dir = directory else { return nil }
        let candidate: URL? = if imageUrl.hasPrefix("file://") {
            URL(string: imageUrl)
        } else {
            cacheKey(for: imageUrl).map { dir.appendingPathComponent($0) }
        }
        guard let candidate, candidate.isFileURL else { return nil }
        let resolved = candidate.standardizedFileURL
        guard resolved.deletingLastPathComponent().standardizedFileURL == dir.standardizedFileURL else {
            return nil
        }
        return resolved
    }

    static func cachedFile(for imageUrl: String?) -> URL? {
        guard let url = fileURL(for: imageUrl),
              FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    @discardableResult
    static func write(_ data: Data, named filename: String) -> URL? {
        guard let dir = directory else { return nil }
        let url = dir.appendingPathComponent(filename)
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    /// Stores a locally-captured photo and returns the `file://` URL to put on
    /// the row — the same shape the account downgrade produces, which is what
    /// lets `LocalDataMigrator` re-upload it if the user later signs in.
    static func writeLocalPhoto(_ data: Data) -> String? {
        guard let url = write(data, named: "local-\(UUID().uuidString).jpg") else { return nil }
        return url.absoluteString
    }

    /// Reads back a locally-attached photo for re-upload during migration.
    static func localPhoto(for imageUrl: String) -> (filename: String, data: Data)? {
        guard let url = cachedFile(for: imageUrl), let data = try? Data(contentsOf: url) else { return nil }
        return (url.lastPathComponent, data)
    }

    static func evict(_ imageUrl: String?) {
        guard let url = fileURL(for: imageUrl) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// Clears the whole store — used when the account's local data is wiped.
    static func clear() {
        guard let dir = directory,
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
        else { return }
        for file in files { try? FileManager.default.removeItem(at: file) }
    }
}
