import AppIntents
@testable import Bissbilanz
import SwiftUI
import Testing

/// What can be checked below iOS 27: that the on-screen-awareness modifier
/// builds for every annotated entity type. The iOS 27 pieces
/// (`OwnershipProvidingEntity`, `IndexedEntityQuery`) are compiled out on the
/// SDKs this suite runs against and are exercised by the system, not by a
/// test.
@MainActor
struct SiriEntityAnnotationTests {
    @Test func annotatesEveryEntityTypeTheViewsUse() {
        _ = Text("day").siriEntity(DaySummaryEntity.self, id: "2026-09-16")
        _ = Text("weight").siriEntity(WeightEntity.self, id: "weight-1")
        _ = Text("sleep").siriEntity(SleepEntity.self, id: "sleep-1")
    }
}
