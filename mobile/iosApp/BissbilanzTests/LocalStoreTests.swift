@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Local store")
@MainActor
struct LocalStoreTests {
    // MARK: - Cross-device de-duplication

    //
    // Without `@Attribute(.unique)` (CloudKit forbids it) two devices can each
    // create a row with the same logical key offline; CloudKit then delivers
    // both. `LocalDedup` keeps the newest and drops the rest.

    @Test("Dedup keeps the newest row per key and deletes the rest")
    func dedupKeepsNewest() throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let context = container.mainContext
        let older = LocalGoals(goals: .defaults)
        older.modifiedAt = 100
        let newer = LocalGoals(goals: .defaults)
        newer.modifiedAt = 200
        context.insert(older)
        context.insert(newer)
        try context.save()

        let deleted = LocalDedup.collapse(
            LocalGoals.self, key: \.id, modifiedAt: \.modifiedAt, payload: \.jsonData, in: context
        )

        #expect(deleted == 1)
        let remaining = try context.fetch(FetchDescriptor<LocalGoals>())
        #expect(remaining.count == 1)
        #expect(remaining.first?.modifiedAt == 200)
        withExtendedLifetime(container) {}
    }

    @Test("Dedup leaves rows with distinct keys untouched")
    func dedupLeavesDistinctKeys() throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let context = container.mainContext
        context.insert(LocalDayProperties(properties: dayProperties("2026-06-01", fasting: true)))
        context.insert(LocalDayProperties(properties: dayProperties("2026-06-02", fasting: false)))
        try context.save()

        let deleted = LocalDedup.collapse(
            LocalDayProperties.self, key: \.date, modifiedAt: \.modifiedAt, payload: \.jsonData, in: context
        )

        #expect(deleted == 0)
        #expect(try context.fetchCount(FetchDescriptor<LocalDayProperties>()) == 2)
        withExtendedLifetime(container) {}
    }

    @Test("Sweep collapses same-key duplicates, keeping the newest value")
    func sweepCollapsesDuplicates() throws {
        let container = try LocalStore.makeContainer(inMemory: true)
        let context = container.mainContext
        let stale = LocalDayProperties(properties: dayProperties("2026-06-01", fasting: false))
        stale.modifiedAt = 1
        let fresh = LocalDayProperties(properties: dayProperties("2026-06-01", fasting: true))
        fresh.modifiedAt = 2
        context.insert(stale)
        context.insert(fresh)
        try context.save()

        LocalDedup.sweep(in: context)

        let rows = try context.fetch(FetchDescriptor<LocalDayProperties>())
        #expect(rows.count == 1)
        #expect(rows.first?.isFastingDay == true)
        withExtendedLifetime(container) {}
    }

    private func dayProperties(_ date: String, fasting: Bool) -> DayProperties {
        DayProperties(date: date, isFastingDay: fasting)
    }
}
