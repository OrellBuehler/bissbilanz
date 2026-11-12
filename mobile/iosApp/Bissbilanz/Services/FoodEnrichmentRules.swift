import Foundation

enum FoodEnrichmentRules {
    static let recheckInterval: TimeInterval = 30 * 24 * 60 * 60
    static let requestSpacing: TimeInterval = 1
    static let maxAttempts = 4
    static let maxConsecutiveFailures = 5
    static let pollInterval: TimeInterval = 3
    static let maxPollFailures = 3
    static let imageHosts: Set<String> = ["images.openfoodfacts.org", "images.openfoodfacts.net"]

    static func needsEnrichment(_ food: Food, now: Date = Date()) -> Bool {
        guard hasText(food.barcode) else { return false }
        guard food.nutriScore == nil || food.novaGroup == nil || !hasText(food.ingredientsText) else { return false }
        return !isRecentlyChecked(food, now: now)
    }

    static func isRecentlyChecked(_ food: Food, now: Date) -> Bool {
        guard let checkedAt = food.offCheckedAt.flatMap(DateFormatting.isoDateTime(from:)) else { return false }
        return checkedAt >= now.addingTimeInterval(-recheckInterval)
    }

    static func nutrientScale(servingSize: Double, unit: ServingUnit) -> Double? {
        let basePerUnit: Double? = switch unit {
        case .g, .ml: 1
        case .kg, .l: 1000
        case .cl: 10
        case .oz: 28.349523125
        case .lb: 453.59237
        case .flOz: 29.5735295625
        case .cup, .tbsp, .tsp: nil
        }
        guard let basePerUnit, servingSize > 0, servingSize.isFinite else { return nil }
        return servingSize * basePerUnit / 100
    }

    static func productImageUrl(_ value: String?) -> String? {
        guard let value, value.count <= 2048, let url = URL(string: value), url.scheme == "https",
              let host = url.host()?.lowercased(), imageHosts.contains(host)
        else { return nil }
        return value
    }

    static func patch(for food: Food, product: Food) throws -> [String: Any] {
        var patch: [String: Any] = [:]
        if let nutriScore = product.nutriScore, !nutriScore.isEmpty, nutriScore != food.nutriScore {
            patch["nutriScore"] = nutriScore
        }
        if let novaGroup = product.novaGroup, novaGroup != food.novaGroup {
            patch["novaGroup"] = novaGroup
        }
        if let additives = product.additives, !additives.isEmpty, food.additives?.isEmpty ?? true {
            patch["additives"] = additives
        }
        if let ingredientsText = product.ingredientsText, hasText(ingredientsText), !hasText(food.ingredientsText) {
            patch["ingredientsText"] = ingredientsText
        }
        if !hasText(food.imageUrl), let imageUrl = productImageUrl(product.imageUrl) {
            patch["imageUrl"] = imageUrl
        }
        guard let scale = nutrientScale(servingSize: food.servingSize, unit: food.servingUnit) else { return patch }
        let stored = try JSONPatch.dictionary(of: food)
        let offered = try JSONPatch.dictionary(of: product)
        for key in NutrientCatalog.all.map(\.key) where stored[key] == nil {
            guard let value = (offered[key] as? NSNumber)?.doubleValue, value.isFinite, value >= 0 else { continue }
            patch[key] = (value * scale * 10000).rounded() / 10000
        }
        return patch
    }

    static func editPatch(_ patch: [String: Any], onto food: Food) -> [String: Any] {
        guard let barcode = patch["barcode"] as? String, barcode != food.barcode else { return patch }
        var edited = patch
        edited["offCheckedAt"] = NSNull()
        return edited
    }

    static func backoff(attempt: Int, retryAfter: TimeInterval?) -> TimeInterval {
        let base: TimeInterval = 5
        let exponential = base * pow(3, Double(max(attempt, 1) - 1))
        let delay = retryAfter.map { max($0, base) } ?? exponential
        return min(delay, 120)
    }

    static func pollDelay(failures: Int, rateLimitedFor: TimeInterval?) -> TimeInterval {
        let delay = failures == 0 ? pollInterval : pollInterval * 2
        return max(delay, rateLimitedFor ?? 0)
    }

    static func runToRefresh(_ status: FoodEnrichmentStatus, refreshed: String?) -> String? {
        guard let job = status.job, !job.phase.isActive, job.updated > 0 else { return nil }
        let run = "\(job.startedAt ?? "")|\(job.finishedAt ?? "")"
        return run == refreshed ? nil : run
    }

    static func hasText(_ value: String?) -> Bool {
        !(value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }
}
