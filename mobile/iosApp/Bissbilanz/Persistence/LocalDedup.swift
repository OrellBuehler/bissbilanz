import Foundation
import SwiftData

/// De-duplicates the singleton / natural-key models after CloudKit sync.
///
/// A CloudKit schema has no unique constraints, so if two devices each create a
/// row with the same logical key while offline (e.g. both set goals, or both
/// mark the same supplement taken on the same day), CloudKit delivers *both* —
/// the per-device "fetch by id before insert" guard can't prevent it. This
/// sweep keeps the most recently modified row per key and deletes the rest. The
/// survivor is chosen deterministically (highest `modifiedAt`, ties broken by
/// payload bytes), so every device picks the same one and the deletions
/// propagate through CloudKit until all devices converge on a single row.
///
/// Only the four collision-prone models need this — the rest are keyed by a
/// per-creation UUID, which never collides across devices. Runs only in Local
/// mode (the only mode that uses CloudKit) and is safe to call repeatedly.
enum LocalDedup {
    @MainActor
    static func sweep(in context: ModelContext) {
        collapse(LocalGoals.self, key: \.id, modifiedAt: \.modifiedAt, payload: \.jsonData, in: context)
        collapse(LocalPreferences.self, key: \.id, modifiedAt: \.modifiedAt, payload: \.jsonData, in: context)
        collapse(LocalSupplementLog.self, key: \.id, modifiedAt: \.modifiedAt, payload: \.jsonData, in: context)
        collapse(LocalDayProperties.self, key: \.date, modifiedAt: \.modifiedAt, payload: \.jsonData, in: context)
        try? context.save()
    }

    /// Keeps the best row per `key` and deletes the rest. Returns the number of
    /// rows deleted. Exposed for testing.
    @MainActor
    @discardableResult
    static func collapse<T: PersistentModel>(
        _: T.Type,
        key: KeyPath<T, String>,
        modifiedAt: KeyPath<T, Double>,
        payload: KeyPath<T, Data>,
        in context: ModelContext
    ) -> Int {
        let rows = (try? context.fetch(FetchDescriptor<T>())) ?? []
        guard rows.count > 1 else { return 0 }

        var survivor: [String: T] = [:]
        for row in rows {
            let k = row[keyPath: key]
            if let current = survivor[k] {
                if prefers(row, over: current, modifiedAt: modifiedAt, payload: payload) {
                    survivor[k] = row
                }
            } else {
                survivor[k] = row
            }
        }

        var deleted = 0
        for row in rows where survivor[row[keyPath: key]] !== row {
            context.delete(row)
            deleted += 1
        }
        return deleted
    }

    /// `lhs` wins if it is newer; on an exact tie, the row with the larger
    /// payload bytes wins so the choice is identical on every device.
    private static func prefers<T: PersistentModel>(
        _ lhs: T,
        over rhs: T,
        modifiedAt: KeyPath<T, Double>,
        payload: KeyPath<T, Data>
    ) -> Bool {
        let lhsModified = lhs[keyPath: modifiedAt]
        let rhsModified = rhs[keyPath: modifiedAt]
        if lhsModified != rhsModified { return lhsModified > rhsModified }
        return rhs[keyPath: payload].lexicographicallyPrecedes(lhs[keyPath: payload])
    }
}
