import Foundation

struct SleepEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let entryDate: String
    let durationMinutes: Int
    let quality: Double
    let bedtime: String?
    let wakeTime: String?
    let wakeUps: Int?
    let sleepLatencyMinutes: Int?
    let deepSleepMinutes: Int?
    let lightSleepMinutes: Int?
    let remSleepMinutes: Int?
    let source: String?
    let notes: String?
    let loggedAt: String?
    let createdAt: String?
    let updatedAt: String?
}

struct SleepCreate: Codable {
    let durationMinutes: Int
    let quality: Double
    let entryDate: String
    var bedtime: String?
    var wakeTime: String?
    var wakeUps: Int?
    var notes: String?
}

/// Partial PATCH body for `/api/sleep/{id}`.
///
/// `bedtime`/`wakeTime`/`wakeUps`/`notes` are double optionals on purpose —
/// see `EntryUpdate` in Entry.swift for the full rationale. `nil` omits the
/// key (leave the stored value alone), `.some(nil)` sends an explicit JSON
/// null (clear it). `durationMinutes`/`quality`/`entryDate` aren't nullable
/// server-side, so they stay plain optionals.
struct SleepUpdate: Codable {
    var durationMinutes: Int?
    var quality: Double?
    var entryDate: String?
    var bedtime: String??
    var wakeTime: String??
    var wakeUps: Int??
    var notes: String??
}

/// Declared in an extension so the memberwise initializer survives.
extension SleepUpdate {
    private enum CodingKeys: String, CodingKey {
        case durationMinutes, quality, entryDate, bedtime, wakeTime, wakeUps, notes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        durationMinutes = try container.decodeIfPresent(Int.self, forKey: .durationMinutes)
        quality = try container.decodeIfPresent(Double.self, forKey: .quality)
        entryDate = try container.decodeIfPresent(String.self, forKey: .entryDate)
        bedtime = try container.decodeNullable(String.self, forKey: .bedtime)
        wakeTime = try container.decodeNullable(String.self, forKey: .wakeTime)
        wakeUps = try container.decodeNullable(Int.self, forKey: .wakeUps)
        notes = try container.decodeNullable(String.self, forKey: .notes)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(durationMinutes, forKey: .durationMinutes)
        try container.encodeIfPresent(quality, forKey: .quality)
        try container.encodeIfPresent(entryDate, forKey: .entryDate)
        try container.encodeNullable(bedtime, forKey: .bedtime)
        try container.encodeNullable(wakeTime, forKey: .wakeTime)
        try container.encodeNullable(wakeUps, forKey: .wakeUps)
        try container.encodeNullable(notes, forKey: .notes)
    }
}

struct SleepEntriesResponse: Codable {
    let entries: [SleepEntry]
}

struct SleepEntryResponse: Codable {
    let entry: SleepEntry
}
