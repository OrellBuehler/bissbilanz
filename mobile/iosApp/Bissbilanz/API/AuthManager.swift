import Foundation
import AuthenticationServices
import Security

enum AuthState {
    case unauthenticated
    case authenticated
    case refreshing
}

@MainActor
class AuthManager: ObservableObject {
    @Published var authState: AuthState = .unauthenticated

    private let baseURL: String
    private let clientId: String
    private let redirectURI = "bissbilanz://oauth/callback"

    private var codeVerifier: String?

    private static let accessTokenKey = "bissbilanz_access_token"
    private static let refreshTokenKey = "bissbilanz_refresh_token"

    var isAuthenticated: Bool { authState == .authenticated }

    init(baseURL: String = "https://bissbilanz.orell.ch", clientId: String = "bissbilanz-ios") {
        self.baseURL = baseURL
        self.clientId = clientId
        if KeychainHelper.load(key: Self.accessTokenKey) != nil {
            authState = .authenticated
        }
    }

    var accessToken: String? {
        KeychainHelper.load(key: Self.accessTokenKey)
    }

    func buildAuthorizationURL() -> URL? {
        let verifier = generateCodeVerifier()
        codeVerifier = verifier
        guard let challenge = generateCodeChallenge(verifier: verifier) else { return nil }
        let state = UUID().uuidString

        var components = URLComponents(string: "\(baseURL)/api/oauth/authorize")
        components?.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        return components?.url
    }

    func handleCallback(url: URL) async -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
              let verifier = codeVerifier else {
            return false
        }
        codeVerifier = nil

        guard let tokenURL = URL(string: "\(baseURL)/api/oauth/token") else { return false }

        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type=authorization_code",
            "code=\(code)",
            "redirect_uri=\(redirectURI.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? redirectURI)",
            "client_id=\(clientId)",
            "code_verifier=\(verifier)",
        ].joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)
            KeychainHelper.save(key: Self.accessTokenKey, value: tokenResponse.accessToken)
            if let refresh = tokenResponse.refreshToken {
                KeychainHelper.save(key: Self.refreshTokenKey, value: refresh)
            }
            authState = .authenticated
            return true
        } catch {
            return false
        }
    }

    func refreshAccessToken() async -> Bool {
        guard let refreshToken = KeychainHelper.load(key: Self.refreshTokenKey) else {
            authState = .unauthenticated
            return false
        }

        authState = .refreshing

        guard let tokenURL = URL(string: "\(baseURL)/api/oauth/token") else {
            authState = .unauthenticated
            return false
        }

        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type=refresh_token",
            "refresh_token=\(refreshToken)",
            "client_id=\(clientId)",
        ].joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)
            KeychainHelper.save(key: Self.accessTokenKey, value: tokenResponse.accessToken)
            if let refresh = tokenResponse.refreshToken {
                KeychainHelper.save(key: Self.refreshTokenKey, value: refresh)
            }
            authState = .authenticated
            return true
        } catch {
            authState = .unauthenticated
            return false
        }
    }

    func logout() {
        KeychainHelper.delete(key: Self.accessTokenKey)
        KeychainHelper.delete(key: Self.refreshTokenKey)
        authState = .unauthenticated
    }

    private func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded
    }

    private func generateCodeChallenge(verifier: String) -> String? {
        guard let data = verifier.data(using: .ascii) else { return nil }
        var hash = [UInt8](repeating: 0, count: 32)
        _ = CC_SHA256(Array(data), CC_LONG(data.count), &hash)
        return Data(hash).base64URLEncoded
    }
}

private struct TokenResponse: Codable {
    let accessToken: String
    let refreshToken: String?
    let tokenType: String
    let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
    }
}

extension Data {
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum KeychainHelper {
    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
