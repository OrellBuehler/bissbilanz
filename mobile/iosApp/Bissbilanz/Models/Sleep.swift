import Foundation

struct SleepEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let entryDate: String
    let durationMinutes: Int
    let quality: Int
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
    let quality: Int
    let entryDate: String
    var bedtime: String?
    var wakeTime: String?
    var wakeUps: Int?
    var notes: String?
}

struct SleepUpdate: Codable {
    var durationMinutes: Int?
    var quality: Int?
    var entryDate: String?
    var bedtime: String?
    var wakeTime: String?
    var wakeUps: Int?
    var notes: String?
}

struct SleepEntriesResponse: Codable {
    let entries: [SleepEntry]
}

struct SleepEntryResponse: Codable {
    let entry: SleepEntry
}
