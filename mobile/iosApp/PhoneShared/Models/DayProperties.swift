import Foundation

/// Matches the server's day-properties response object (camelCase, no
/// userId): `{ date, isFastingDay, notes, waterMl, activityCalories,
/// activityNote }` — see src/lib/server/day-properties.ts `DayPropertiesRow`.
/// The four extra fields are always present in a real response but may be
/// null; they stay plain optionals here (rather than double optionals) since
/// decode only ever needs to distinguish "absent" from "null" on write paths,
/// not on read. Because they're plain `Optional`, an older cached `jsonData`
/// blob from before these fields existed still decodes fine — a missing key
/// resolves to `nil`.
struct DayProperties: Codable {
    let date: String
    let isFastingDay: Bool
    let notes: String?
    let waterMl: Int?
    let activityCalories: Int?
    let activityNote: String?

    init(
        date: String,
        isFastingDay: Bool,
        notes: String? = nil,
        waterMl: Int? = nil,
        activityCalories: Int? = nil,
        activityNote: String? = nil
    ) {
        self.date = date
        self.isFastingDay = isFastingDay
        self.notes = notes
        self.waterMl = waterMl
        self.activityCalories = activityCalories
        self.activityNote = activityNote
    }
}

struct DayPropertiesRangeResponse: Codable {
    let data: [DayProperties]
}

struct DayPropertiesResponse: Codable {
    let properties: DayProperties?
}

/// A partial change to a day's properties: an omitted field keeps its stored
/// value, an explicit null clears it — mirrors `dayPropertiesSetSchema`'s
/// PATCH-style contract server-side. `isFastingDay` is never nullable
/// server-side, so it stays a plain optional (omit vs. provide, never clear).
/// Shared between the queued sync operation payload and the local optimistic
/// merge (`JSONPatch.merged`, see `EntryRepository.setDayProperties`) — the
/// same trick `PreferencesUpdate`/`EntryUpdate` use for their clearable
/// fields.
struct DayPropertiesPatch: Codable {
    var isFastingDay: Bool?
    var notes: String??
    var waterMl: Int??
    var activityCalories: Int??
    var activityNote: String??

    init(
        isFastingDay: Bool? = nil,
        notes: String?? = nil,
        waterMl: Int?? = nil,
        activityCalories: Int?? = nil,
        activityNote: String?? = nil
    ) {
        self.isFastingDay = isFastingDay
        self.notes = notes
        self.waterMl = waterMl
        self.activityCalories = activityCalories
        self.activityNote = activityNote
    }
}

extension DayPropertiesPatch {
    private enum CodingKeys: String, CodingKey {
        case isFastingDay, notes, waterMl, activityCalories, activityNote
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        isFastingDay = try container.decodeIfPresent(Bool.self, forKey: .isFastingDay)
        notes = try container.decodeNullable(String.self, forKey: .notes)
        waterMl = try container.decodeNullable(Int.self, forKey: .waterMl)
        activityCalories = try container.decodeNullable(Int.self, forKey: .activityCalories)
        activityNote = try container.decodeNullable(String.self, forKey: .activityNote)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(isFastingDay, forKey: .isFastingDay)
        try container.encodeNullable(notes, forKey: .notes)
        try container.encodeNullable(waterMl, forKey: .waterMl)
        try container.encodeNullable(activityCalories, forKey: .activityCalories)
        try container.encodeNullable(activityNote, forKey: .activityNote)
    }
}

/// Wire body for `PUT /api/day-properties`: the date travels in the body
/// alongside the patch fields (see `dayPropertiesSetSchema`).
struct DayPropertiesSet: Codable {
    let date: String
    var isFastingDay: Bool?
    var notes: String??
    var waterMl: Int??
    var activityCalories: Int??
    var activityNote: String??

    init(date: String, patch: DayPropertiesPatch = DayPropertiesPatch()) {
        self.date = date
        isFastingDay = patch.isFastingDay
        notes = patch.notes
        waterMl = patch.waterMl
        activityCalories = patch.activityCalories
        activityNote = patch.activityNote
    }

    /// Convenience for the common single-field write (fasting-day toggle).
    init(date: String, isFastingDay: Bool) {
        self.init(date: date, patch: DayPropertiesPatch(isFastingDay: isFastingDay))
    }
}

extension DayPropertiesSet {
    private enum CodingKeys: String, CodingKey {
        case date, isFastingDay, notes, waterMl, activityCalories, activityNote
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = try container.decode(String.self, forKey: .date)
        isFastingDay = try container.decodeIfPresent(Bool.self, forKey: .isFastingDay)
        notes = try container.decodeNullable(String.self, forKey: .notes)
        waterMl = try container.decodeNullable(Int.self, forKey: .waterMl)
        activityCalories = try container.decodeNullable(Int.self, forKey: .activityCalories)
        activityNote = try container.decodeNullable(String.self, forKey: .activityNote)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(date, forKey: .date)
        try container.encodeIfPresent(isFastingDay, forKey: .isFastingDay)
        try container.encodeNullable(notes, forKey: .notes)
        try container.encodeNullable(waterMl, forKey: .waterMl)
        try container.encodeNullable(activityCalories, forKey: .activityCalories)
        try container.encodeNullable(activityNote, forKey: .activityNote)
    }
}
