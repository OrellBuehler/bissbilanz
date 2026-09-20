import AppIntents
import CoreSpotlight
import Foundation

/// One logged night — length, quality and the clock times around it — exposed
/// to Siri, Spotlight and Shortcuts.
///
/// Conforms to `IndexedEntity` so a night can be pushed into the Spotlight
/// index (iOS 18): `attributeSet.contentDescription` is written as a natural
/// sentence because that text is what a spoken question is matched against.
/// The id is the stored entry's id; `date` is the entry's day, which the app
/// records as the morning the user woke up.
struct SleepEntity: AppEntity, IndexedEntity {
    let id: String

    @Property(title: "Date")
    var date: Date

    @Property(title: "Duration")
    var durationMinutes: Int

    /// The app's 1–10 scale (manual entries are whole numbers, imported ones
    /// can carry a decimal).
    @Property(title: "Quality")
    var quality: Double

    /// The day as stored ("2026-09-16") plus the optional context. Plain stored
    /// values rather than `@Property`, like `DaySummaryEntity`'s goals: a night
    /// without a bedtime must read as "not recorded" instead of midnight, and
    /// neither value is something a Shortcuts filter can usefully compare.
    let entryDate: String
    let bedtime: Date?
    let wakeTime: Date?
    let notes: String?

    /// The plain stored properties are assigned first on purpose: the
    /// `@Property` ones are written through the wrapper's setter, which counts
    /// as a use of `self` and is only allowed once every other stored property
    /// holds a value.
    init(entry: SleepEntry) {
        id = entry.id
        entryDate = entry.entryDate
        bedtime = entry.bedtime.flatMap { DateFormatting.isoDateTime(from: $0) }
        wakeTime = entry.wakeTime.flatMap { DateFormatting.isoDateTime(from: $0) }
        notes = entry.notes
        date = DateFormatting.date(from: entry.entryDate) ?? Date()
        durationMinutes = entry.durationMinutes
        quality = entry.quality
    }

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        // App Intents metadata is extracted statically, so this stays an
        // English literal — the spoken result is localized via `L10n`.
        TypeDisplayRepresentation(name: "Sleep Entry")
    }

    static let defaultQuery = SleepEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        let locale = DaySummaryFormat.locale
        return DisplayRepresentation(
            title: "\(DaySummaryFormat.duration(minutes: durationMinutes, locale: locale))",
            subtitle: "\(DaySummaryFormat.longDate(date, locale: locale))",
            image: .init(systemName: "bed.double")
        )
    }

    /// Spotlight metadata. `contentDescription` is a full sentence on purpose:
    /// the semantic index matches a question against this text, so it spells
    /// out the length, the clock times and the quality.
    var attributeSet: CSSearchableItemAttributeSet {
        let locale = DaySummaryFormat.locale
        let day = DaySummaryFormat.longDate(date, locale: locale)
        let set = defaultAttributeSet
        set.title = DaySummaryFormat.duration(minutes: durationMinutes, locale: locale)
        set.contentDescription = indexDescription(day: day, locale: locale)
        set.keywords = [day, entryDate, L10n.sleep]
        set.contentCreationDate = date
        set.startDate = date
        return set
    }

    private func indexDescription(day: String, locale: Locale) -> String {
        var parts = [
            L10n.intentSleepIndexText(
                duration: DaySummaryFormat.spokenDuration(minutes: durationMinutes),
                day: day
            ),
        ]
        if let bedtime {
            parts.append(L10n.intentSleepBedtime(DaySummaryFormat.time(bedtime, locale: locale)))
        }
        if let wakeTime {
            parts.append(L10n.intentSleepWokeAt(DaySummaryFormat.time(wakeTime, locale: locale)))
        }
        if quality > 0 {
            parts.append(L10n.intentSleepQualityOf(DaySummaryFormat.decimal(
                quality,
                fractionDigits: quality == quality.rounded() ? 0 : 1,
                locale: locale
            )))
        }
        if let notes, !notes.isEmpty {
            parts.append(notes)
        }
        return parts.joined(separator: ", ")
    }
}
