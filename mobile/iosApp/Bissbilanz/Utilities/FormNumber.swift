import Foundation

enum FormNumber: Equatable {
    case blank
    case value(Double)
    case invalid

    static func parse(_ text: String) -> FormNumber {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .blank }
        guard let value = Double.parseUserInput(trimmed), value.isFinite else { return .invalid }
        return .value(value)
    }

    var number: Double? {
        switch self {
        case let .value(number): number
        case .blank, .invalid: nil
        }
    }
}
