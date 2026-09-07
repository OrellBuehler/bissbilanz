import Foundation
import SwiftData

/// The store writes performed when a fast ends outside the app UI
/// (`EndFastIntent` from the Live Activity). Mirrors `QuickAddWriter`: it
/// must not depend on app-only types (`EntryRepository`, `SyncManager`), so
/// it opens its own SwiftData container against the shared App Group store
/// and produces the same optimistic-write shape
/// `EntryRepository.setDayProperties` does — upsert `LocalDayProperties`
/// plus, in Synced mode, a queued `PendingSyncOperation` the app drains on
/// next foreground.
enum FastingWriter {
    /// Ends the running fast: moves it to history, clears the current-session
    /// slot, queues the finished fast for upload and marks the day it ended as
    /// a fasting day. Returns the ended session, or nil when no fast was running.
    @MainActor
    @discardableResult
    static func endCurrentFast(at endDate: Date = Date()) -> FastingSession? {
        guard var session = FastingSessionStore.loadCurrent() else { return nil }
        session.endedAt = endDate
        FastingSessionStore.appendToHistory(session)
        FastingSessionStore.clearCurrent()
        markFastingDay(date: DateFormatting.isoString(from: endDate), ended: session)
        return session
    }

    @MainActor
    private static func markFastingDay(date: String, ended: FastingSession) {
        let isLocal = AppModeSnapshot.isLocal
        let container = LocalStore.extensionContainer(
            cloudKitEnabled: isLocal,
            onError: { error, context in
                QuickAddDiagnostics.record(phase: context["phase"] as? String ?? "container", error: error)
            }
        )
        let context = ModelContext(container)

        // Merge onto whatever the day already has (notes/water/activity)
        // rather than replacing the row outright — the same reasoning as
        // `EntryRepository.setDayProperties`.
        let patch = DayPropertiesPatch(isFastingDay: true)
        var descriptor = FetchDescriptor<LocalDayProperties>(predicate: #Predicate { $0.date == date })
        descriptor.fetchLimit = 1
        let existingRow = (try? context.fetch(descriptor))?.first
        let current = existingRow?.toDayProperties() ?? DayProperties(date: date, isFastingDay: false)
        let dict = (try? JSONPatch.dictionary(of: patch)) ?? [:]
        let merged = (try? JSONPatch.merged(DayProperties.self, base: current, patch: dict)) ?? current
        if let existingRow {
            existingRow.update(from: merged)
        } else {
            context.insert(LocalDayProperties(properties: merged))
        }

        if !isLocal {
            var seq = PendingSyncOperation.nextSeq(in: context)
            if let body = ended.upsertBody, let id = body.id {
                context.insert(PendingSyncOperation(seq: seq, operation: .upsertFast(id: id, body: body)))
                seq += 1
            }
            let operation = SyncOperation.setDayProperties(date: date, patch: patch)
            context.insert(PendingSyncOperation(seq: seq, operation: operation))
        }

        do {
            try context.save()
        } catch {
            QuickAddDiagnostics.record(phase: "fasting_day_mark", error: error)
        }
    }
}
