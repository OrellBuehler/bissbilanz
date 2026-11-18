import Foundation

enum SignInPrompt: String, Identifiable {
    case choose
    case apple

    var id: String {
        rawValue
    }

    func webProviders(enabled: Set<String>) -> [SignInProvider] {
        switch self {
        case .choose: SignInProvider.allCases.filter { enabled.contains($0.rawValue) }
        case .apple: []
        }
    }

    func showsApple(enabled: Set<String>) -> Bool {
        switch self {
        case .choose: enabled.contains(SignInPlan.appleProviderID)
        case .apple: true
        }
    }

    var loadsEnabledProviders: Bool {
        self == .choose
    }
}

enum SignInPlan: Equatable {
    case web(SignInProvider)
    case prompt(SignInPrompt)

    static let appleProviderID = "apple"

    static func resolve(lastProvider: String?, isLocalMode: Bool) -> SignInPlan {
        guard !isLocalMode, let lastProvider else { return .prompt(.choose) }
        if lastProvider == appleProviderID { return .prompt(.apple) }
        if let provider = SignInProvider(rawValue: lastProvider) { return .web(provider) }
        return .prompt(.choose)
    }
}
