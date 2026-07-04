import Foundation

struct WeightEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let weightKg: Double
    let entryDate: String
    let loggedAt: String?
    let notes: String?
    let createdAt: String?
    let updatedAt: String?
}

struct WeightCreate: Codable {
    let weightKg: Double
    let entryDate: String
    var notes: String?
}

struct WeightUpdate: Codable {
    var weightKg: Double?
    var entryDate: String?
    var notes: String?
}

struct WeightEntriesResponse: Codable {
    let entries: [WeightEntry]
}

struct WeightEntryResponse: Codable {
    let entry: WeightEntry
}

/// Weight projections computed on-device — there is no server stats endpoint.
/// Mirrors the web chart's projection: a least-squares regression over the
/// last 90 days of entries (at least 3 points), extrapolated from the newest
/// entry's day.
struct WeightStats {
    let projected14d: Double?
    let projected30d: Double?
    let projected60d: Double?

    static func computed(from entries: [WeightEntry]) -> WeightStats? {
        let dated = entries.compactMap { entry -> (date: Date, kg: Double)? in
            guard let date = DateFormatting.date(from: entry.entryDate) else { return nil }
            return (date, entry.weightKg)
        }
        guard let newest = dated.map(\.date).max() else { return nil }
        let window = dated.filter { newest.timeIntervalSince($0.date) / 86400 <= 90 }
        guard window.count >= 3, let first = window.map(\.date).min() else { return nil }

        let points = window.map { (x: $0.date.timeIntervalSince(first) / 86400, y: $0.kg) }
        let n = Double(points.count)
        let sumX = points.reduce(0.0) { $0 + $1.x }
        let sumY = points.reduce(0.0) { $0 + $1.y }
        let sumXY = points.reduce(0.0) { $0 + $1.x * $1.y }
        let sumX2 = points.reduce(0.0) { $0 + $1.x * $1.x }
        let denom = n * sumX2 - sumX * sumX
        guard denom != 0 else { return nil }
        let slope = (n * sumXY - sumX * sumY) / denom
        let intercept = (sumY - slope * sumX) / n

        let lastX = newest.timeIntervalSince(first) / 86400
        func project(_ days: Double) -> Double {
            ((slope * (lastX + days) + intercept) * 10).rounded() / 10
        }
        return WeightStats(
            projected14d: project(14),
            projected30d: project(30),
            projected60d: project(60)
        )
    }
}
