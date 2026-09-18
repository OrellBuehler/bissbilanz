import Foundation

/// The sentences Siri speaks for the weight and sleep read intents. Kept apart
/// from the intents themselves, like `DaySummaryDialog`, so both answers phrase
/// numbers the same way and the wording can be asserted in tests without
/// running an intent.
enum BodyDialog {
    /// Below this the delta renders as "0.0 kg", so it is spoken as unchanged
    /// rather than as a movement of nothing.
    private static let steadyThresholdKg = 0.05

    /// "Your latest weight is 76.4 kg, logged Tuesday. Down 0.6 kg over the
    /// last 7 days." `isLatest` is false when the user asked for a specific
    /// entry, which then opens with the day instead.
    static func weight(for entry: WeightEntity, trend: WeightTrendSummary, isLatest: Bool) -> String {
        let locale = DaySummaryFormat.locale
        let day = DaySummaryFormat.dayLabel(dateString: entry.entryDate, date: entry.date, locale: locale)
        let weight = DaySummaryFormat.kilograms(entry.weightKg, locale: locale)
        var text = isLatest
            ? L10n.intentWeightLatest(weight: weight, day: day)
            : L10n.intentWeightOn(weight: weight, day: day)
        guard trend.hasTrend else { return text }
        let delta = trend.deltaKg
        let value = DaySummaryFormat.kilograms(abs(delta), locale: locale)
        if abs(delta) < steadyThresholdKg {
            text += " " + L10n.intentWeightTrendSteady(days: trend.days)
        } else if delta > 0 {
            text += " " + L10n.intentWeightTrendUp(value: value, days: trend.days)
        } else {
            text += " " + L10n.intentWeightTrendDown(value: value, days: trend.days)
        }
        return text
    }

    /// "Last night you slept 7 hours 10 minutes, bedtime 23:10, woke 06:20."
    /// plus the window average. The opening clause only says "last night" for
    /// an entry dated today — the app dates a night by the morning it ended.
    static func sleep(for entry: SleepEntity, stats: SleepStats, isLatest: Bool) -> String {
        let locale = DaySummaryFormat.locale
        let duration = DaySummaryFormat.spokenDuration(minutes: entry.durationMinutes)
        let day = DaySummaryFormat.dayLabel(dateString: entry.entryDate, date: entry.date, locale: locale)
        var clauses = [
            isLatest && entry.entryDate == DateFormatting.today
                ? L10n.intentSleepLastNight(duration: duration)
                : L10n.intentSleepOn(duration: duration, day: day),
        ]
        if let bedtime = entry.bedtime {
            clauses.append(L10n.intentSleepBedtime(DaySummaryFormat.time(bedtime, locale: locale)))
        }
        if let wakeTime = entry.wakeTime {
            clauses.append(L10n.intentSleepWokeAt(DaySummaryFormat.time(wakeTime, locale: locale)))
        }
        var text = clauses.joined(separator: ", ") + "."
        if stats.nights > 1 {
            text += " " + L10n.intentSleepAverage(
                duration: DaySummaryFormat.spokenDuration(minutes: stats.averageDurationMinutes),
                nights: stats.nights
            )
        }
        return text
    }
}
