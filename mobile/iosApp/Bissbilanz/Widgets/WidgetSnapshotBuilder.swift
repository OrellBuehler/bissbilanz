import Foundation
import SwiftData

/// Runs the widget-snapshot and watch-state fetches on a background
/// `ModelContext` of its own, off the main actor.
///
/// `WidgetSnapshotWriter.write` used to do these half-dozen SwiftData fetches
/// on the main context — after every repository save (debounced) and at the
/// end of every background refresh. On a store with a year of entries that is
/// a multi-second main-thread stall, and when it landed inside a BGAppRefresh
/// run the watchdog killed the app for it (Sentry BISSBILANZ-39, fatal hang in
/// `WidgetSnapshotWriter.watchWeight`; BISSBILANZ-34 is the same stall behind
/// a save). The builders only read, so a throwaway context on the actor's
/// executor sees the same committed rows without touching the main thread.
@ModelActor
actor WidgetSnapshotBuilder {
    func build(localeCode: String) -> (snapshot: WidgetSnapshot, watchState: WatchState) {
        let snapshot = WidgetSnapshotWriter.buildSnapshot(context: modelContext, localeCode: localeCode)
        let watchState = WidgetSnapshotWriter.buildWatchState(
            context: modelContext,
            snapshot: snapshot,
            localeCode: localeCode
        )
        return (snapshot, watchState)
    }
}
