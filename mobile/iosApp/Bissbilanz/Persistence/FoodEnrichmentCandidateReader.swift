import Foundation
import SwiftData

struct FoodEnrichmentCandidate: Sendable, Equatable {
    let id: String
    let name: String
}

@ModelActor
actor FoodEnrichmentCandidateReader {
    static func read(container: ModelContainer, now: Date = Date()) async throws -> [FoodEnrichmentCandidate] {
        try await Task.detached(priority: .userInitiated) {
            try await FoodEnrichmentCandidateReader(modelContainer: container).candidates(now: now)
        }.value
    }

    func candidates(now: Date) throws -> [FoodEnrichmentCandidate] {
        let descriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate { $0.barcode != nil },
            sortBy: [SortDescriptor(\.name)]
        )
        return try modelContext.fetch(descriptor).compactMap { row -> FoodEnrichmentCandidate? in
            guard let food = row.toFood(), FoodEnrichmentRules.needsEnrichment(food, now: now) else { return nil }
            return FoodEnrichmentCandidate(id: food.id, name: food.name)
        }
    }
}
