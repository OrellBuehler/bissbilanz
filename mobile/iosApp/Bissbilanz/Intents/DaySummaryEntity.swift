import AppIntents
import CoreSpotlight
import Foundation

/// One day of the diary — totals, goals and the fasting flag — exposed to Siri,
/// Spotlight and Shortcuts.
///
/// Conforms to `IndexedEntity` so a day can be pushed into the Spotlight index
/// (iOS 18): `attributeSet.contentDescription` is written as a natural sentence
/// because that text is what a spoken question is matched against. The id is the
/// day's ISO date ("2026-09-16"), so a day keeps its identity across re-indexing
/// and `entities(for:)` can resolve it without a lookup table.
struct DaySummaryEntity: AppEntity, IndexedEntity {
    let id: String

    @Property(title: "Date")
    var date: Date

    @Property(title: "Calories")
    var calories: Double

    @Property(title: "Protein")
    var protein: Double

    @Property(title: "Carbs")
    var carbs: Double

    @Property(title: "Fat")
    var fat: Double

    @Property(title: "Fiber")
    var fiber: Double

    @Property(title: "Entries")
    var entryCount: Int

    @Property(title: "Fasting Day")
    var isFastingDay: Bool

    /// The goals in force when the summary was built. Plain stored values rather
    /// than `@Property`: they describe the target, not the day, and a day
    /// without goals must read as "no goal" instead of zero.
    let calorieGoal: Double?
    let proteinGoal: Double?
    let carbGoal: Double?
    let fatGoal: Double?
    let fiberGoal: Double?

    /// The plain stored properties are assigned first on purpose: the
    /// `@Property` ones are written through the wrapper's setter, which counts
    /// as a use of `self` and is only allowed once every other stored property
    /// holds a value.
    init(dateString: String, entries: [Entry], isFastingDay: Bool, goals: Goals?) {
        id = dateString
        calorieGoal = goals?.calorieGoal
        proteinGoal = goals?.proteinGoal
        carbGoal = goals?.carbGoal
        fatGoal = goals?.fatGoal
        fiberGoal = goals?.fiberGoal
        date = DateFormatting.date(from: dateString) ?? Date()
        calories = entries.reduce(0) { $0 + $1.totalCalories }
        protein = entries.reduce(0) { $0 + $1.totalProtein }
        carbs = entries.reduce(0) { $0 + $1.totalCarbs }
        fat = entries.reduce(0) { $0 + $1.totalFat }
        fiber = entries.reduce(0) { $0 + $1.totalFiber }
        entryCount = entries.count
        self.isFastingDay = isFastingDay
    }

    /// The day's ISO date — the same value as `id`, named for readability at
    /// the call sites that pass it back into the repositories.
    var dateString: String {
        id
    }

    /// Calories left against the goal, negative once the goal is passed. `nil`
    /// when no goals are set.
    var remainingCalories: Double? {
        calorieGoal.map { $0 - calories }
    }

    /// True only when a goal exists and the day stayed within it — an empty day
    /// is not a met goal.
    var metCalorieGoal: Bool {
        guard let calorieGoal, calorieGoal > 0, calories > 0 else { return false }
        return calories <= calorieGoal
    }

    var isEmpty: Bool {
        entryCount == 0
    }

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        // App Intents metadata is extracted statically, so this stays an
        // English literal — the spoken result is localized via `L10n`.
        TypeDisplayRepresentation(name: "Day")
    }

    static let defaultQuery = DaySummaryQuery()

    var displayRepresentation: DisplayRepresentation {
        let locale = DaySummaryFormat.locale
        let subtitle = [
            "\(DaySummaryFormat.number(calories, locale: locale)) kcal",
            "P \(DaySummaryFormat.number(protein, locale: locale)) g",
            "C \(DaySummaryFormat.number(carbs, locale: locale)) g",
            "F \(DaySummaryFormat.number(fat, locale: locale)) g",
        ].joined(separator: " · ")
        return DisplayRepresentation(
            title: "\(DaySummaryFormat.longDate(date, locale: locale))",
            subtitle: "\(subtitle)",
            image: .init(systemName: "calendar")
        )
    }

    /// Spotlight metadata. `contentDescription` is a full sentence on purpose:
    /// the semantic index matches a question against this text, so it names
    /// every number instead of abbreviating it.
    var attributeSet: CSSearchableItemAttributeSet {
        let locale = DaySummaryFormat.locale
        let day = DaySummaryFormat.longDate(date, locale: locale)
        let set = defaultAttributeSet
        set.title = day
        set.contentDescription = indexDescription(day: day, locale: locale)
        set.keywords = [day, dateString, L10n.calories, L10n.protein, L10n.carbs, L10n.fat]
        set.contentCreationDate = date
        set.startDate = date
        return set
    }

    private func indexDescription(day: String, locale: Locale) -> String {
        guard !isEmpty || isFastingDay else {
            return L10n.intentDayNothingLogged(day)
        }
        var text = L10n.intentDayIndexText(
            day: day,
            calories: DaySummaryFormat.number(calories, locale: locale),
            protein: DaySummaryFormat.number(protein, locale: locale),
            carbs: DaySummaryFormat.number(carbs, locale: locale),
            fat: DaySummaryFormat.number(fat, locale: locale),
            fiber: DaySummaryFormat.number(fiber, locale: locale),
            entries: entryCount
        )
        if calorieGoal != nil, !isEmpty {
            text += ", " + (metCalorieGoal ? L10n.intentDayGoalMet : L10n.intentDayGoalExceeded)
        }
        if isFastingDay {
            text += ", " + L10n.fastingDay
        }
        return text
    }
}

/// Number and date formatting for everything the system speaks or shows for a
/// day: the entity itself, the read intents' dialog and their snippet views.
/// Formatted in the app's own locale (`L10n.currentLocale`) rather than the
/// device's, so a German user with an English phone still hears German.
enum DaySummaryFormat {
    static var locale: Locale {
        Locale(identifier: L10n.currentLocale.rawValue)
    }

    /// Rounded to a whole number with the locale's grouping separator
    /// ("2,140" / "2.140") — these values are read out, not typed into a field.
    /// Clamped before the `Int` conversion: a corrupted row must not trap the
    /// whole intent while Siri is waiting on it.
    static func number(_ value: Double, locale: Locale) -> String {
        let rounded = value.isFinite ? value.rounded() : 0
        return Int(min(max(rounded, -1_000_000_000), 1_000_000_000)).formatted(.number.locale(locale))
    }

    /// "Tuesday, 16 September 2026" in the app's locale.
    static func longDate(_ date: Date, locale: Locale) -> String {
        date.formatted(Date.FormatStyle(date: .complete, locale: locale))
    }

    /// "Today" / "Yesterday" where they apply, the long date otherwise — what
    /// a spoken answer should open with.
    static func dayLabel(dateString: String, date: Date, locale: Locale) -> String {
        if dateString == DateFormatting.today { return L10n.today }
        if dateString == DateFormatting.isoString(from: Date().adding(days: -1)) {
            return L10n.yesterday
        }
        return longDate(date, locale: locale)
    }

    static func dayLabel(_ summary: DaySummaryEntity, locale: Locale) -> String {
        dayLabel(dateString: summary.dateString, date: summary.date, locale: locale)
    }

    /// A fixed number of decimals in the app's locale ("76.4" / "76,4"). The
    /// weight answers need one decimal, which `number` (whole numbers with a
    /// grouping separator) deliberately drops. Non-finite and absurd values are
    /// clamped rather than trapped: a corrupted row must not take down an
    /// intent Siri is waiting on.
    static func decimal(_ value: Double, fractionDigits: Int, locale: Locale) -> String {
        let safe = value.isFinite ? min(max(value, -1_000_000), 1_000_000) : 0
        return safe.formatted(.number.locale(locale).precision(.fractionLength(fractionDigits)))
    }

    /// "76.4 kg" — one decimal, the same precision the weight screens show.
    static func kilograms(_ value: Double, locale: Locale) -> String {
        "\(decimal(value, fractionDigits: 1, locale: locale)) kg"
    }

    /// "23:10" / "11:10 PM" in the app's locale.
    static func time(_ date: Date, locale: Locale) -> String {
        date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: locale))
    }

    /// "7 h 10 min" — the compact sleep length for titles and cards.
    static func duration(minutes: Int, locale: Locale) -> String {
        let clamped = min(max(minutes, 0), 60 * 24 * 7)
        let hours = clamped / 60
        let remainder = clamped % 60
        let minutesText = "\(number(Double(remainder), locale: locale)) \(L10n.intentUnitMinuteShort)"
        guard hours > 0 else { return minutesText }
        let hoursText = "\(number(Double(hours), locale: locale)) \(L10n.intentUnitHourShort)"
        return remainder == 0 ? hoursText : "\(hoursText) \(minutesText)"
    }

    /// "7 hours 10 minutes" — the spoken sleep length.
    static func spokenDuration(minutes: Int) -> String {
        let clamped = min(max(minutes, 0), 60 * 24 * 7)
        return L10n.intentSleepDurationSpoken(hours: clamped / 60, minutes: clamped % 60)
    }
}
