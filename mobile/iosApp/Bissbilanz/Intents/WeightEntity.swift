import AppIntents
import CoreSpotlight
import Foundation

/// One weight entry — the value, its day and how it moved — exposed to Siri,
/// Spotlight and Shortcuts.
///
/// Conforms to `IndexedEntity` so an entry can be pushed into the Spotlight
/// index (iOS 18): `attributeSet.contentDescription` is written as a natural
/// sentence because that text is what a spoken question is matched against.
/// The id is the stored entry's id, so `entities(for:)` resolves it without a
/// lookup table.
struct WeightEntity: AppEntity, IndexedEntity {
    let id: String

    @Property(title: "Date")
    var date: Date

    @Property(title: "Weight")
    var weightKg: Double

    /// The day as stored ("2026-09-16"), the note, and the value logged before
    /// this one. Plain stored values rather than `@Property`, like
    /// `DaySummaryEntity`'s goals: an optional has no comparator or sort the
    /// system could offer, and a missing note must read as "no note" instead
    /// of an empty string.
    let entryDate: String
    let note: String?
    let previousKg: Double?

    /// The plain stored properties are assigned first on purpose: the
    /// `@Property` ones are written through the wrapper's setter, which counts
    /// as a use of `self` and is only allowed once every other stored property
    /// holds a value.
    init(entry: WeightEntry, previous: WeightEntry? = nil) {
        id = entry.id
        entryDate = entry.entryDate
        note = entry.notes
        previousKg = previous?.weightKg
        date = DateFormatting.date(from: entry.entryDate) ?? Date()
        weightKg = entry.weightKg
    }

    /// Change against the entry logged before this one, `nil` when the caller
    /// had no predecessor to hand (a single entry, or an id resolved on its
    /// own).
    var deltaKg: Double? {
        previousKg.map { weightKg - $0 }
    }

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        // App Intents metadata is extracted statically, so this stays an
        // English literal — the spoken result is localized via `L10n`.
        TypeDisplayRepresentation(name: "Weight Entry")
    }

    static let defaultQuery = WeightEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        let locale = DaySummaryFormat.locale
        return DisplayRepresentation(
            title: "\(DaySummaryFormat.kilograms(weightKg, locale: locale))",
            subtitle: "\(DaySummaryFormat.longDate(date, locale: locale))",
            image: .init(systemName: "scalemass")
        )
    }

    /// Spotlight metadata. `contentDescription` is a full sentence on purpose:
    /// the semantic index matches a question against this text, so it names the
    /// value and its movement instead of abbreviating them.
    var attributeSet: CSSearchableItemAttributeSet {
        let locale = DaySummaryFormat.locale
        let day = DaySummaryFormat.longDate(date, locale: locale)
        let weight = DaySummaryFormat.kilograms(weightKg, locale: locale)
        let set = defaultAttributeSet
        set.title = weight
        set.contentDescription = indexDescription(day: day, weight: weight, locale: locale)
        set.keywords = [day, entryDate, weight, L10n.weight]
        set.contentCreationDate = date
        set.startDate = date
        return set
    }

    private func indexDescription(day: String, weight: String, locale: Locale) -> String {
        var text = L10n.intentWeightIndexText(day: day, weight: weight)
        if let deltaKg, deltaKg != 0 {
            let value = DaySummaryFormat.kilograms(abs(deltaKg), locale: locale)
            text += ", " + (deltaKg > 0 ? L10n.intentWeightChangeUp(value) : L10n.intentWeightChangeDown(value))
        }
        if let note, !note.isEmpty {
            text += ", " + note
        }
        return text
    }
}
