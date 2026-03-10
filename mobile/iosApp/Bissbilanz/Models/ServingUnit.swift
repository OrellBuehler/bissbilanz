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
        case .g: return "g"
        case .kg: return "kg"
        case .ml: return "ml"
        case .l: return "L"
        case .oz: return "oz"
        case .lb: return "lb"
        case .flOz: return "fl oz"
        case .cup: return "cup"
        case .tbsp: return "tbsp"
        case .tsp: return "tsp"
        }
    }
}
