import Foundation

struct SleepEntry: Codable, Identifiable {
    let id: String
    let userId: String?
    let entryDate: String
    let durationMinutes: Int
    let quality: Int
    let bedtime: String?
    let wakeTime: String?
    let wakeUps: Int?
    let notes: String?
    let loggedAt: String?
    let createdAt: String?
    let updatedAt: String?
}

struct SleepCreate: Codable {
    let entryDate: String
    let durationMinutes: Int
    let quality: Int
    var bedtime: String?
    var wakeTime: String?
    var wakeUps: Int?
    var notes: String?
}

struct SleepUpdate: Codable {
    var entryDate: String?
    var durationMinutes: Int?
    var quality: Int?
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
