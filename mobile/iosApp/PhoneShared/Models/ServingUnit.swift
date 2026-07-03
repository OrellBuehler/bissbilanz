import Foundation

enum ServingUnit: String, Codable, CaseIterable {
    case g
    case kg
    case ml
    case cl
    case l
    case oz
    case lb
    case flOz = "fl_oz"
    case cup
    case tbsp
    case tsp

    var displayName: String {
        switch self {
        case .g: "g"
        case .kg: "kg"
        case .ml: "ml"
        case .cl: "cl"
        case .l: "L"
        case .oz: "oz"
        case .lb: "lb"
        case .flOz: "fl oz"
        case .cup: "cup"
        case .tbsp: "tbsp"
        case .tsp: "tsp"
        }
    }

    /// Volume units label the per-100 macro basis as 100 ml instead of 100 g.
    var isVolume: Bool {
        switch self {
        case .ml, .cl, .l, .flOz, .cup, .tbsp, .tsp: true
        case .g, .kg, .oz, .lb: false
        }
    }

    /// Grams (mass) or milliliters (volume) in one unit, so a serving amount
    /// can be normalized to the 100 g/ml basis the packaging label uses.
    var baseUnitsPerUnit: Double {
        switch self {
        case .g, .ml: 1
        case .kg, .l: 1000
        case .cl: 10
        case .oz: 28.35
        case .lb: 453.59
        case .flOz: 29.57
        case .cup: 240
        case .tbsp: 15
        case .tsp: 5
        }
    }
}
