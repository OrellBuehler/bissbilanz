import Foundation
import Observation

private let importFolderName = "food-package-import"

/// Food package files other apps hand to Bissbilanz ("Open in…", a WhatsApp or Mail
/// attachment, Files). The file is copied out of wherever it was offered right away,
/// and stays pending here until `ContentView` — which only exists once sign-in or
/// the local-mode choice, and any data migration, are done — presents the import
/// for it.
@MainActor
@Observable
final class FoodPackageInbox {
    struct Pending: Identifiable, Equatable {
        let id = UUID()
        /// The private copy to import from; nil when it could not be made.
        let url: URL?
        /// Why there is no copy.
        let error: String?
    }

    var pending: Pending?

    /// The private folder of the pending copy; not view state.
    @ObservationIgnored private var stagedFolder: URL?

    /// Takes over a file URL handed to the app: copies it into the temporary
    /// directory and queues the import for it. A package opened while another is
    /// still on screen replaces it.
    func receive(_ url: URL) {
        removeStaged()
        do {
            let copy = try Self.stage(url)
            stagedFolder = copy.deletingLastPathComponent()
            pending = Pending(url: copy, error: nil)
        } catch {
            if !(error is FoodPackageError) { ErrorReporter.capture(error) }
            pending = Pending(
                url: nil,
                error: (error as? FoodPackageError).map(FoodPackageErrorText.message(for:)) ?? L10n.foodPackageOpenFailed
            )
        }
    }

    /// The import sheet went away. Its private copy goes with it — unless a newer
    /// package already took its place.
    func sheetDismissed() {
        if pending == nil { removeStaged() }
    }

    private func removeStaged() {
        if let stagedFolder { try? FileManager.default.removeItem(at: stagedFolder) }
        stagedFolder = nil
    }

    /// Copies `url` (security-scoped when it comes from another app's container) to
    /// `<root>/food-package-import/<uuid>/<file name>`. Refuses files over the
    /// bulk import's size limit before copying them (the import screen decides which flow
    /// a file big enough for the bulk one takes).
    nonisolated static func stage(
        _ url: URL,
        root: URL = FileManager.default.temporaryDirectory
    ) throws -> URL {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= FoodPackageFormat.bulkMaxBytes else { throw FoodPackageError.tooLarge }

        let folder = root
            .appendingPathComponent(importFolderName, isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let name = FoodPackageFilename.safeFileName(url.lastPathComponent)
            ?? "package.\(FoodPackageFormat.fileExtension)"
        let copy = folder.appendingPathComponent(name)
        do {
            try FileManager.default.copyItem(at: url, to: copy)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
        return copy
    }
}
