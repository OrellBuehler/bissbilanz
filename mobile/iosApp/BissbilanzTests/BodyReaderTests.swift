import AppIntents
@testable import Bissbilanz
import CoreSpotlight
import Foundation
import SwiftData
import Testing

@MainActor
struct BodyReaderTests {
    private func makeReader(_ harness: RepositoryHarness) -> BodyReader {
        BodyReader(
            weightRepository: harness.weightRepository,
            sleepRepository: harness.sleepRepository
        )
    }

    // MARK: - Seeding

    private func weightRow(id: String, date: String, kg: Double, notes: String? = nil) throws -> WeightEntry {
        var payload: [String: Any] = [
            "id": id,
            "userId": "u1",
            "weightKg": kg,
            "entryDate": date,
        ]
        if let notes {
            payload["notes"] = notes
        }
        return try JSONPatch.decode(WeightEntry.self, from: payload)
    }

    @discardableResult
    private func seedWeight(
        _ harness: RepositoryHarness,
        id: String,
        date: String,
        kg: Double,
        notes: String? = nil
    ) throws -> WeightEntry {
        let entry = try weightRow(id: id, date: date, kg: kg, notes: notes)
        harness.context.insert(LocalWeightEntry(entry: entry))
        try harness.context.save()
        return entry
    }

    private func sleepRow(
        id: String,
        date: String,
        minutes: Int,
        quality: Double = 7,
        bedtime: String? = nil,
        wakeTime: String? = nil,
        notes: String? = nil
    ) throws -> SleepEntry {
        var payload: [String: Any] = [
            "id": id,
            "userId": "u1",
            "entryDate": date,
            "durationMinutes": minutes,
            "quality": quality,
        ]
        if let bedtime {
            payload["bedtime"] = bedtime
        }
        if let wakeTime {
            payload["wakeTime"] = wakeTime
        }
        if let notes {
            payload["notes"] = notes
        }
        return try JSONPatch.decode(SleepEntry.self, from: payload)
    }

    @discardableResult
    private func seedSleep(
        _ harness: RepositoryHarness,
        id: String,
        date: String,
        minutes: Int,
        quality: Double = 7,
        bedtime: String? = nil,
        wakeTime: String? = nil
    ) throws -> SleepEntry {
        let entry = try sleepRow(
            id: id, date: date, minutes: minutes, quality: quality, bedtime: bedtime, wakeTime: wakeTime
        )
        harness.context.insert(LocalSleepEntry(entry: entry))
        try harness.context.save()
        return entry
    }

    private var locale: Locale {
        DaySummaryFormat.locale
    }

    // MARK: - Weight trend

    @Test("weightTrend measures the window's oldest against its newest entry")
    func weightTrendOverWindow() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedWeight(harness, id: "w1", date: "2026-09-10", kg: 80.0)
        try seedWeight(harness, id: "w2", date: "2026-09-13", kg: 79.5)
        try seedWeight(harness, id: "w3", date: "2026-09-16", kg: 79.0)
        // Outside the seven-day window ending on the 16th.
        try seedWeight(harness, id: "old", date: "2026-08-01", kg: 85.0)

        let trend = makeReader(harness).weightTrend(days: 7, now: now)

        #expect(trend.count == 3)
        #expect(trend.days == 7)
        #expect(trend.firstDate == "2026-09-10")
        #expect(trend.lastDate == "2026-09-16")
        #expect(trend.firstKg == 80.0)
        #expect(trend.lastKg == 79.0)
        #expect(trend.deltaKg == -1.0)
        #expect(trend.averageKg == 79.5)
        #expect(trend.hasTrend)
    }

    @Test("A window with nothing in it reports empty rather than dividing by zero")
    func weightTrendEmptyWindow() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedWeight(harness, id: "old", date: "2026-01-01", kg: 85.0)

        let trend = makeReader(harness).weightTrend(days: 7, now: now)

        #expect(trend.isEmpty)
        #expect(!trend.hasTrend)
        #expect(trend.deltaKg == 0)
        #expect(trend.averageKg == 0)
    }

    @Test("A single entry is a value, not a trend")
    func weightTrendSingleEntry() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedWeight(harness, id: "w1", date: "2026-09-16", kg: 79.0)

        let trend = makeReader(harness).weightTrend(days: 7, now: now)

        #expect(trend.count == 1)
        #expect(!trend.hasTrend)
        #expect(trend.deltaKg == 0)
    }

    // MARK: - Weight resolution

    @Test("weightEntity(for:) answers with the nearest logged day")
    func weightClosestDay() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedWeight(harness, id: "w1", date: "2026-09-10", kg: 80.0)
        try seedWeight(harness, id: "w2", date: "2026-09-16", kg: 79.0)
        let reader = makeReader(harness)

        #expect(reader.weightEntity(for: "2026-09-16")?.id == "w2")
        #expect(reader.weightEntity(for: "2026-09-15")?.id == "w2")
        #expect(reader.weightEntity(for: "2026-09-12")?.id == "w1")
        // Past the newest entry still resolves — "today" must answer with the
        // last value rather than nothing.
        #expect(reader.weightEntity(for: "2026-10-01")?.id == "w2")
    }

    @Test("The string query resolves spoken days to the nearest entry")
    func weightMatchingDatePhrase() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedWeight(harness, id: "w1", date: "2026-09-14", kg: 80.0)
        try seedWeight(harness, id: "w2", date: "2026-09-16", kg: 79.0)
        let reader = makeReader(harness)

        #expect(reader.weights(matching: "today", now: now).map(\.id) == ["w2"])
        #expect(reader.weights(matching: "Monday", now: now).map(\.id) == ["w1"])
        #expect(reader.weights(matching: "2026-09-14", now: now).map(\.id) == ["w1"])
        #expect(reader.weights(matching: "   ", now: now).isEmpty)
    }

    @Test("A spoken number matches the entries within half a kilo, newest first")
    func weightMatchingNumber() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedWeight(harness, id: "low", date: "2026-09-10", kg: 76.4)
        try seedWeight(harness, id: "mid", date: "2026-09-12", kg: 76.2)
        try seedWeight(harness, id: "high", date: "2026-09-14", kg: 79.0)
        let reader = makeReader(harness)

        #expect(reader.weights(matching: "76", now: now).map(\.id) == ["mid", "low"])
        #expect(reader.weights(matching: "79 kg", now: now).map(\.id) == ["high"])
        #expect(reader.weights(matching: "60", now: now).isEmpty)
        #expect(reader.weights(matching: "pizza", now: now).isEmpty)
    }

    @Test("Spoken weights are read with either decimal separator and unit")
    func weightValueParsing() {
        #expect(BodyReader.weightValue(in: "76.4") == 76.4)
        #expect(BodyReader.weightValue(in: "76,4") == 76.4)
        #expect(BodyReader.weightValue(in: "76.4 kg") == 76.4)
        #expect(BodyReader.weightValue(in: "76.4 Kilogramm") == 76.4)
        #expect(BodyReader.weightValue(in: "pizza") == nil)
        #expect(BodyReader.weightValue(in: "") == nil)
        // A negative or zero weight is never a real entry.
        #expect(BodyReader.weightValue(in: "0") == nil)
    }

    @Test("Entries carry the change against the entry logged before them")
    func weightDelta() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedWeight(harness, id: "w1", date: "2026-09-10", kg: 80.0)
        try seedWeight(harness, id: "w2", date: "2026-09-16", kg: 79.5)
        let reader = makeReader(harness)

        let latest = try #require(reader.latestWeight())
        #expect(latest.id == "w2")
        #expect(latest.deltaKg == -0.5)
        // The oldest entry has nothing to compare against.
        let oldest = try #require(reader.weight(id: "w1"))
        #expect(oldest.deltaKg == nil)
        #expect(reader.weight(id: "missing") == nil)
        #expect(reader.weights(ids: ["w2", "w1"]).map(\.id) == ["w2", "w1"])
    }

    @Test("Range and recency reads stay inside their bounds")
    func weightRanges() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedWeight(harness, id: "w1", date: "2026-09-10", kg: 80.0)
        try seedWeight(harness, id: "w2", date: "2026-09-13", kg: 79.5)
        try seedWeight(harness, id: "w3", date: "2026-09-16", kg: 79.0)
        let reader = makeReader(harness)

        #expect(reader.weights(from: "2026-09-11", to: "2026-09-16").map(\.id) == ["w3", "w2"])
        #expect(reader.weights(lastDays: 4, now: now).map(\.id) == ["w3", "w2"])
        #expect(reader.recentWeights(limit: 2).map(\.id) == ["w3", "w2"])
        #expect(reader.recentWeights(limit: 0).isEmpty)
    }

    // MARK: - Sleep

    @Test("sleepStats averages the window and names the best and worst night")
    func sleepStatsOverWindow() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedSleep(harness, id: "s1", date: "2026-09-14", minutes: 420, quality: 6)
        try seedSleep(harness, id: "s2", date: "2026-09-15", minutes: 480, quality: 8)
        try seedSleep(harness, id: "s3", date: "2026-09-16", minutes: 450, quality: 7)
        // Outside the seven-day window ending on the 16th.
        try seedSleep(harness, id: "old", date: "2026-08-01", minutes: 600, quality: 10)

        let stats = makeReader(harness).sleepStats(days: 7, now: now)

        #expect(stats.nights == 3)
        #expect(stats.averageDurationMinutes == 450)
        #expect(stats.averageQuality == 7)
        #expect(stats.bestDurationMinutes == 480)
        #expect(stats.bestDate == "2026-09-15")
        #expect(stats.worstDurationMinutes == 420)
        #expect(stats.worstDate == "2026-09-14")
    }

    @Test("An unlogged window reports empty sleep stats")
    func sleepStatsEmptyWindow() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))

        let stats = makeReader(harness).sleepStats(days: 7, now: now)

        #expect(stats.isEmpty)
        #expect(stats.averageDurationMinutes == 0)
        #expect(stats.averageQuality == 0)
    }

    @Test("Nights without a quality are left out of the quality average")
    func sleepStatsIgnoresUnratedNights() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedSleep(harness, id: "s1", date: "2026-09-15", minutes: 400, quality: 0)
        try seedSleep(harness, id: "s2", date: "2026-09-16", minutes: 500, quality: 8)

        let stats = makeReader(harness).sleepStats(days: 7, now: now)

        #expect(stats.nights == 2)
        #expect(stats.averageDurationMinutes == 450)
        #expect(stats.averageQuality == 8)
    }

    @Test("Sleep resolves by id, by nearest day and by spoken day")
    func sleepResolution() throws {
        let harness = try RepositoryHarness(mode: .local)
        let now = try #require(DateFormatting.date(from: "2026-09-16"))
        try seedSleep(harness, id: "s1", date: "2026-09-13", minutes: 420)
        try seedSleep(harness, id: "s2", date: "2026-09-16", minutes: 450)
        let reader = makeReader(harness)

        #expect(reader.sleep(id: "s1")?.durationMinutes == 420)
        #expect(reader.sleep(id: "missing") == nil)
        #expect(reader.latestSleep()?.id == "s2")
        #expect(reader.sleepEntity(for: "2026-09-15")?.id == "s2")
        #expect(reader.sleeps(matching: "Monday", now: now).map(\.id) == ["s1"])
        #expect(reader.sleeps(matching: "pizza", now: now).isEmpty)
        #expect(reader.sleeps(ids: ["s2"]).map(\.id) == ["s2"])
        #expect(reader.sleeps(from: "2026-09-15", to: "2026-09-16").map(\.id) == ["s2"])
        #expect(reader.recentSleeps(limit: 1).map(\.id) == ["s2"])
    }

    // MARK: - Property queries

    @Test("Weight comparators filter and sort the entry list")
    func weightPropertyQuery() throws {
        let entries = try [
            WeightEntity(entry: weightRow(id: "w1", date: "2026-09-10", kg: 80.0)),
            WeightEntity(entry: weightRow(id: "w2", date: "2026-09-13", kg: 79.5)),
            WeightEntity(entry: weightRow(id: "w3", date: "2026-09-16", kg: 81.0)),
        ]
        let cutoff = try #require(DateFormatting.date(from: "2026-09-12"))

        #expect(
            WeightEntityQuery.filter(entries, comparators: [.weightAbove(79.8)], mode: .and).map(\.id)
                == ["w1", "w3"]
        )
        #expect(
            WeightEntityQuery.filter(entries, comparators: [.dateAfter(cutoff)], mode: .and).map(\.id)
                == ["w2", "w3"]
        )
        #expect(
            WeightEntityQuery.filter(
                entries,
                comparators: [.dateAfter(cutoff), .weightBelow(80)],
                mode: .and
            ).map(\.id) == ["w2"]
        )
        #expect(
            WeightEntityQuery.filter(
                entries,
                comparators: [.weightAbove(80.5), .weightBelow(79.8)],
                mode: .or
            ).map(\.id) == ["w2", "w3"]
        )
        // No comparators means the whole window, not nothing.
        #expect(WeightEntityQuery.filter(entries, comparators: [], mode: .or).count == 3)
        // Default sort is newest first.
        #expect(WeightEntityQuery.sort(entries, by: []).map(\.id) == ["w3", "w2", "w1"])
    }

    @Test("Sleep comparators filter the night list")
    func sleepPropertyQuery() throws {
        let nights = try [
            SleepEntity(entry: sleepRow(id: "s1", date: "2026-09-14", minutes: 380)),
            SleepEntity(entry: sleepRow(id: "s2", date: "2026-09-15", minutes: 460)),
            SleepEntity(entry: sleepRow(id: "s3", date: "2026-09-16", minutes: 520)),
        ]
        let cutoff = try #require(DateFormatting.date(from: "2026-09-15"))

        #expect(
            SleepEntityQuery.filter(nights, comparators: [.durationAbove(450)], mode: .and).map(\.id)
                == ["s2", "s3"]
        )
        #expect(
            SleepEntityQuery.filter(nights, comparators: [.durationBelow(400)], mode: .and).map(\.id)
                == ["s1"]
        )
        #expect(
            SleepEntityQuery.filter(nights, comparators: [.dateEqualTo(cutoff)], mode: .and).map(\.id)
                == ["s2"]
        )
        #expect(SleepEntityQuery.filter(nights, comparators: [], mode: .or).count == 3)
        #expect(SleepEntityQuery.sort(nights, by: []).map(\.id) == ["s3", "s2", "s1"])
    }

    // MARK: - Spotlight text

    @Test("The weight index sentence names the value and its movement")
    func weightIndexDescription() throws {
        let previous = try weightRow(id: "w1", date: "2026-09-10", kg: 76.1)
        let entry = try WeightEntity(
            entry: weightRow(id: "w2", date: "2026-09-16", kg: 76.4, notes: "after the gym"),
            previous: previous
        )

        let text = try #require(entry.attributeSet.contentDescription)

        #expect(text.contains(DaySummaryFormat.kilograms(76.4, locale: locale)))
        // The delta, formatted exactly like the value itself.
        #expect(text.contains(DaySummaryFormat.kilograms(0.3, locale: locale)))
        #expect(text.contains(DaySummaryFormat.longDate(entry.date, locale: locale)))
        #expect(text.contains("after the gym"))
        #expect(entry.attributeSet.title == DaySummaryFormat.kilograms(76.4, locale: locale))
    }

    @Test("The sleep index sentence names the length, the clock times and the quality")
    func sleepIndexDescription() throws {
        let bedtimeString = "2026-09-15T23:10:00Z"
        let wakeString = "2026-09-16T06:20:00Z"
        let entry = try SleepEntity(entry: sleepRow(
            id: "s1",
            date: "2026-09-16",
            minutes: 430,
            quality: 8,
            bedtime: bedtimeString,
            wakeTime: wakeString
        ))
        let bedtime = try #require(DateFormatting.isoDateTime(from: bedtimeString))
        let wakeTime = try #require(DateFormatting.isoDateTime(from: wakeString))

        let text = try #require(entry.attributeSet.contentDescription)

        #expect(text.contains(DaySummaryFormat.spokenDuration(minutes: 430)))
        #expect(text.contains(DaySummaryFormat.time(bedtime, locale: locale)))
        #expect(text.contains(DaySummaryFormat.time(wakeTime, locale: locale)))
        #expect(text.contains(DaySummaryFormat.longDate(entry.date, locale: locale)))
        #expect(text.contains(DaySummaryFormat.decimal(8, fractionDigits: 0, locale: locale)))
        #expect(entry.attributeSet.title == DaySummaryFormat.duration(minutes: 430, locale: locale))
    }

    // MARK: - Formatting

    @Test("Durations read out as words and render compactly")
    func durationFormatting() {
        #expect(DaySummaryFormat.spokenDuration(minutes: 430) == L10n.intentSleepDurationSpoken(hours: 7, minutes: 10))
        #expect(DaySummaryFormat.spokenDuration(minutes: 420) == L10n.intentSleepDurationSpoken(hours: 7, minutes: 0))
        #expect(DaySummaryFormat.spokenDuration(minutes: -5) == L10n.intentSleepDurationSpoken(hours: 0, minutes: 0))
        #expect(DaySummaryFormat.duration(minutes: 420, locale: locale) == "7 \(L10n.intentUnitHourShort)")
        #expect(DaySummaryFormat.duration(minutes: 45, locale: locale) == "45 \(L10n.intentUnitMinuteShort)")
    }

    @Test("Weights keep one decimal and a non-finite value can't trap the intent")
    func kilogramFormatting() {
        #expect(DaySummaryFormat.kilograms(76.44, locale: Locale(identifier: "en_US")) == "76.4 kg")
        #expect(DaySummaryFormat.kilograms(76.0, locale: Locale(identifier: "en_US")) == "76.0 kg")
        #expect(DaySummaryFormat.kilograms(76.44, locale: Locale(identifier: "de_DE")) == "76,4 kg")
        #expect(DaySummaryFormat.decimal(.nan, fractionDigits: 1, locale: Locale(identifier: "en_US")) == "0.0")
    }

    @Test("A window is bounded by the search limit")
    func windowBounds() throws {
        let now = try #require(DateFormatting.date(from: "2026-09-16"))

        #expect(BodyReader.window(days: 1, now: now).start == "2026-09-16")
        #expect(BodyReader.window(days: 7, now: now).start == "2026-09-10")
        #expect(BodyReader.window(days: 7, now: now).end == "2026-09-16")
        // Never further back than the declared search window.
        let capped = BodyReader.window(days: 10000, now: now)
        #expect(capped.start == DateFormatting.isoString(
            from: now.adding(days: -(BodyReader.searchWindowDays - 1))
        ))
    }
}
