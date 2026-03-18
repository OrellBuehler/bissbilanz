import Foundation

struct WeightEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let weightKg: Double
    let entryDate: String
    let loggedAt: String?
    let notes: String?
    let createdAt: String?
    let updatedAt: String?
}

struct WeightCreate: Codable {
    let weightKg: Double
    let entryDate: String
    var notes: String?
}

struct WeightUpdate: Codable {
    var weightKg: Double?
    var entryDate: String?
    var notes: String?
}

struct WeightEntriesResponse: Codable {
    let entries: [WeightEntry]
}

struct WeightEntryResponse: Codable {
    let entry: WeightEntry
}

struct WeightStatsResponse: Codable {
    let latest: Double?
    let trend: Double?
    let delta7d: Double?
    let projected14d: Double?
    let projected30d: Double?
    let projected60d: Double?
    let entryCount: Int

    enum CodingKeys: String, CodingKey {
        case latest, trend
        case delta7d = "delta_7d"
        case projected14d = "projected_14d"
        case projected30d = "projected_30d"
        case projected60d = "projected_60d"
        case entryCount = "entry_count"
    }
}
