import Foundation

enum ReminderKind: String, Codable {
    case weight
    case meal
    case sleep
}

struct Reminder: Codable, Identifiable {
    let id: String
    let userId: String
    let kind: ReminderKind
    let mealType: String?
    let time: String
    let weekdays: [Int]
    let enabled: Bool
    let createdAt: String?
    let updatedAt: String?
}

struct ReminderCreate: Codable {
    let kind: ReminderKind
    var mealType: String?
    let time: String
    var weekdays: [Int]?
    var enabled: Bool?
}

/// Partial PATCH body for `/api/reminders/{id}`.
///
/// `mealType` is a double optional on purpose — see `EntryUpdate` in Entry.swift
/// for the full rationale. `nil` omits the key (leave the stored value alone),
/// `.some(nil)` sends an explicit JSON null (clear it, required when switching
/// `kind` away from `meal`). The other fields aren't nullable server-side, so
/// they stay plain optionals.
struct ReminderUpdate: Codable {
    var kind: ReminderKind?
    var mealType: String??
    var time: String?
    var weekdays: [Int]?
    var enabled: Bool?
}

/// Declared in an extension so the memberwise initializer survives.
extension ReminderUpdate {
    private enum CodingKeys: String, CodingKey {
        case kind, mealType, time, weekdays, enabled
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decodeIfPresent(ReminderKind.self, forKey: .kind)
        mealType = try container.decodeNullable(String.self, forKey: .mealType)
        time = try container.decodeIfPresent(String.self, forKey: .time)
        weekdays = try container.decodeIfPresent([Int].self, forKey: .weekdays)
        enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(kind, forKey: .kind)
        try container.encodeNullable(mealType, forKey: .mealType)
        try container.encodeIfPresent(time, forKey: .time)
        try container.encodeIfPresent(weekdays, forKey: .weekdays)
        try container.encodeIfPresent(enabled, forKey: .enabled)
    }
}

struct RemindersListResponse: Codable {
    let reminders: [Reminder]
}

struct ReminderResponse: Codable {
    let reminder: Reminder
}
