import ActivityKit
import Foundation
import SwiftData
import WidgetKit

/// The store writes performed when a fast starts or ends outside the app UI
/// (`FastingControlToggleIntent`, `EndFastIntent`). Mirrors `QuickAddWriter`:
/// it must not depend on app-only types (`EntryRepository`, `SyncManager`), so
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
        ControlCenter.shared.reloadControls(ofKind: ControlKind.fasting)
        return session
    }

    /// Starts a fast — the Control Center toggle's "on" action
    /// (`FastingControlToggleIntent`). Mirrors `FastingTimerManager.start()`'s
    /// session-store write and Live Activity request, minus the
    /// `@Observable` UI state (there is none outside the app). A no-op if a
    /// fast is already running, matching the manager's own guard so a stale
    /// toggle re-tap can't clobber the running session's start time.
    @MainActor
    @discardableResult
    static func startFast(targetHours: Int, startedAt: Date = Date()) -> FastingSession? {
        guard FastingSessionStore.loadCurrent() == nil else { return nil }
        let session = FastingSession(startedAt: min(startedAt, Date()), targetHours: targetHours)
        FastingSessionStore.saveCurrent(session)
        if ActivityAuthorizationInfo().areActivitiesEnabled {
            let attributes = FastingActivityAttributes(startDate: session.startedAt, targetHours: session.targetHours)
            let state = FastingActivityAttributes.ContentState(
                startDate: session.startedAt,
                targetEndDate: session.targetEndDate
            )
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
            } catch {
                // The fast itself is unaffected — the session in the store is
                // canonical; only the lock-screen surface is missing. Mirrors
                // `FastingTimerManager.startActivity`'s own best-effort catch.
                QuickAddDiagnostics.record(phase: "fasting_start_activity", error: error)
            }
        }
        ControlCenter.shared.reloadControls(ofKind: ControlKind.fasting)
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
