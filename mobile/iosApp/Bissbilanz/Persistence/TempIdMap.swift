import Foundation

/// Durable `temp_` → server id lookup for foods and recipes whose queued
/// create has drained. `LocalRemap` rewrites the local rows and the queued ops
/// when that happens, but anything that captured the temp id beforehand (an
/// open detail screen, a log sheet, a background labelling task) still holds
/// the dead id afterwards; repositories and the sync queue resolve it through
/// here instead of acting on an id the server never had. Bounded, oldest
/// mappings dropped first.
@MainActor
enum TempIdMap {
    private static let key = "temp_id_resolutions"
    private static let capacity = 500
    private static let fromKey = "from"
    private static let toKey = "to"

    static func record(from tempId: String, to serverId: String) {
        guard LocalStore.isTempId(tempId), tempId != serverId else { return }
        var pairs = stored().filter { $0[fromKey] != tempId }
        pairs.append([fromKey: tempId, toKey: serverId])
        if pairs.count > capacity {
            pairs.removeFirst(pairs.count - capacity)
        }
        UserDefaults.standard.set(pairs, forKey: key)
    }

    static func lookup(_ id: String) -> String? {
        guard LocalStore.isTempId(id) else { return nil }
        return stored().last { $0[fromKey] == id }?[toKey]
    }

    static func resolved(_ id: String) -> String {
        lookup(id) ?? id
    }

    private static func stored() -> [[String: String]] {
        UserDefaults.standard.array(forKey: key) as? [[String: String]] ?? []
    }
}
