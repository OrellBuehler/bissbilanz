import Foundation

struct FoodEnrichmentJob: Decodable, Equatable {
    let state: String
    let total: Int
    let processed: Int
    let updated: Int
    let notFound: Int
    let failed: Int
    let startedAt: String?
    let finishedAt: String?

    var phase: FoodEnrichmentPhase {
        FoodEnrichmentPhase(state)
    }
}

enum FoodEnrichmentPhase: Equatable {
    case queued
    case running
    case completed
    case cancelled
    case failed
    case unknown

    init(_ state: String) {
        switch state {
        case "queued": self = .queued
        case "running": self = .running
        case "completed": self = .completed
        case "cancelled": self = .cancelled
        case "failed": self = .failed
        default: self = .unknown
        }
    }

    var isActive: Bool {
        switch self {
        case .queued, .running: true
        case .completed, .cancelled, .failed, .unknown: false
        }
    }
}

struct FoodEnrichmentStatus: Decodable, Equatable {
    let candidates: Int
    let job: FoodEnrichmentJob?

    var isActive: Bool {
        job?.phase.isActive ?? false
    }
}

enum FoodEnrichOutcome: Equatable {
    case updated
    case unchanged
    case notFound

    init(_ outcome: String) {
        switch outcome {
        case "updated": self = .updated
        case "not_found": self = .notFound
        default: self = .unchanged
        }
    }
}

struct FoodEnrichResponse: Decodable {
    let food: Food
    let outcome: String
}

struct FoodEnrichErrorBody: Decodable {
    let error: String
    let code: String?
}

struct FoodEnrichResult {
    let food: Food
    let outcome: FoodEnrichOutcome
}

enum FoodEnrichmentFailure: Error, Equatable {
    case rateLimited(retryAfter: TimeInterval)
    case noBarcode
    case foodNotFound
    case foodChanged
    case offInvalidResponse
    case offUnavailable(retryAfter: TimeInterval?)
    case pendingChanges
    case failed(status: Int)

    init(status: Int, body: Data, retryAfter: String?) {
        let code = (try? JSONDecoder().decode(FoodEnrichErrorBody.self, from: body))?.code
        self = Self.classify(status: status, code: code, retryAfter: retryAfter)
    }

    static func classify(status: Int, code: String?, retryAfter: String?) -> FoodEnrichmentFailure {
        if status == 429 {
            return .rateLimited(retryAfter: AiTaskRequestInProgress.retryDelay(header: retryAfter))
        }
        switch code {
        case "no_barcode"?: return .noBarcode
        case "food_not_found"?: return .foodNotFound
        case "food_changed"?: return .foodChanged
        case "off_invalid_response"?: return .offInvalidResponse
        case "off_unavailable"?:
            return .offUnavailable(retryAfter: retryAfter.map { AiTaskRequestInProgress.retryDelay(header: $0) })
        default: return status == 404 ? .foodNotFound : .failed(status: status)
        }
    }

    var isExpected: Bool {
        switch self {
        case .failed: false
        case .rateLimited, .noBarcode, .foodNotFound, .foodChanged, .offInvalidResponse, .offUnavailable,
             .pendingChanges: true
        }
    }
}
