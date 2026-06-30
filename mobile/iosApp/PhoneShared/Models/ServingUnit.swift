import Foundation

enum ServingUnit: String, Codable, CaseIterable {
    case g
    case kg
    case ml
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
        case .l: "L"
        case .oz: "oz"
        case .lb: "lb"
        case .flOz: "fl oz"
        case .cup: "cup"
        case .tbsp: "tbsp"
        case .tsp: "tsp"
        }
    }
}
