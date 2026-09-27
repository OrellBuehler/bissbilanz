import Foundation

/// A meal `AiTaskProcessor` has read but, in review-first mode, not yet
/// logged — persisted to disk (mirroring `AiTaskUploadDisk`'s upload queue)
/// so it survives the app being backgrounded or relaunched between
/// processing and the user opening `AIMealReviewView` to confirm it.
///
/// `items` is a normal `MealEstimate.items` list. A barcode with an Open Food
/// Facts hit or a local match is resolved to a real food id during
/// processing either way — that lookup is a deterministic network/local read,
/// not an AI guess the user needs to approve — so only a label- or link-
/// derived item (numbers `AiTaskProcessor` itself read off a photo or a page)
/// carries a synthetic `matchedFoodId` that indexes into `pendingFoods`
/// instead of a real food id; `AIMealReviewView` creates that food only once
/// the user confirms.
struct ProcessedAiTaskDraft: Codable, Equatable, Identifiable {
    var taskId: String
    var date: String
    var mealType: String?
    var eatenAt: String?
    var items: [MealEstimateItem]
    var pendingFoods: [String: FoodCreate]
    var source: MealEstimateSource
    var queuedAt: Date

    /// `AiTasksView` presents a draft with `.sheet(item:)`, keyed by the task
    /// it belongs to (one draft per task).
    var id: String { taskId }
}

/// Disk layout for `AiTaskProcessor`'s review-first drafts: one JSON file per
/// task under Application Support, named by the task's server id. Simpler
/// than `AiTaskUploadDisk` (no accompanying photos — the draft only ever
/// carries the already-extracted numbers), but the same "write it down before
/// anything else can lose it" reasoning.
enum AiTaskDraftDisk {
    static let directoryName = "AiTaskDrafts"

    static var defaultRoot: URL {
        let base = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent(directoryName, isDirectory: true)
    }

    private static func fileURL(taskId: String, root: URL) -> URL {
        root.appendingPathComponent("\(taskId).json")
    }

    static func save(_ draft: ProcessedAiTaskDraft, root: URL = defaultRoot) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(draft)
        try data.write(to: fileURL(taskId: draft.taskId, root: root), options: .atomic)
    }

    static func load(taskId: String, root: URL = defaultRoot) -> ProcessedAiTaskDraft? {
        guard let data = try? Data(contentsOf: fileURL(taskId: taskId, root: root)) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(ProcessedAiTaskDraft.self, from: data)
    }

    /// Every stored draft, oldest first — `AiTasksView` matches these against
    /// `AiTaskStore.tasks` by `taskId` to render the "Ready to review" rows.
    static func loadAll(root: URL = defaultRoot) -> [ProcessedAiTaskDraft] {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { return [] }
        return names
            .filter { $0.hasSuffix(".json") }
            .compactMap { load(taskId: String($0.dropLast(".json".count)), root: root) }
            .sorted { $0.queuedAt < $1.queuedAt }
    }

    static func remove(taskId: String, root: URL = defaultRoot) {
        try? FileManager.default.removeItem(at: fileURL(taskId: taskId, root: root))
    }
}
