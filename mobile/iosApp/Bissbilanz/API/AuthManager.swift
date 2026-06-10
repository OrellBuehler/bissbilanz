import AuthenticationServices
import Foundation
import Observation
import Security

enum AuthState {
    case unauthenticated
    case authenticated
    case refreshing
    /// Was signed in, but the server definitively rejected the refresh token.
    /// The user keeps the app (all data is local) and is prompted to sign in
    /// again — never kicked back to the login screen.
    case expired
}

@MainActor
@Observable
final class AuthManager {
    var authState: AuthState = .unauthenticated

    private let baseURL: String
    private var pendingState: String?
    /// In-flight refresh, shared by concurrent callers. Refresh tokens rotate
    /// on use, so two parallel refreshes would invalidate each other and kill
    /// the session.
    private var refreshTask: Task<Bool, Never>?

    private static let accessTokenKey = "bissbilanz_access_token"
    private static let refreshTokenKey = "bissbilanz_refresh_token"

    var isAuthenticated: Bool {
        authState == .authenticated
    }

    init(baseURL: String = "https://bissbilanz.orellbuehler.ch") {
        self.baseURL = baseURL
        if KeychainHelper.load(key: Self.accessTokenKey) != nil {
            authState = .authenticated
        }
    }

    var accessToken: String? {
        KeychainHelper.load(key: Self.accessTokenKey)
    }

    func buildLoginURL() -> URL? {
        let state = UUID().uuidString
        pendingState = state
        return URL(string: "\(baseURL)/api/auth/mobile/login?state=\(state)")
    }

    @discardableResult
    func handleCallback(url: URL) async -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
              let state = components.queryItems?.first(where: { $0.name == "state" })?.value,
              state == pendingState
        else {
            return false
        }
        pendingState = nil

        guard let tokenURL = URL(string: "\(baseURL)/api/auth/mobile/token") else { return false }

        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["code": code]
        request.httpBody = try? JSONEncoder().encode(body)

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

    @discardableResult
    func refreshAccessToken() async -> Bool {
        if let task = refreshTask {
            return await task.value
        }
        let task = Task { await performRefresh() }
        refreshTask = task
        let result = await task.value
        refreshTask = nil
        return result
    }

    /// Only an explicit rejection of the refresh token ends the session
    /// (`.expired`). Transient failures — offline, 5xx, malformed response —
    /// keep the user signed in; the next API call retries the refresh.
    private func performRefresh() async -> Bool {
        guard let refreshToken = KeychainHelper.load(key: Self.refreshTokenKey) else {
            authState = accessToken != nil ? .expired : .unauthenticated
            return false
        }

        authState = .refreshing

        guard let tokenURL = URL(string: "\(baseURL)/api/auth/mobile/token") else {
            authState = .expired
            return false
        }

        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["refresh_token": refreshToken]
        request.httpBody = try? JSONEncoder().encode(body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                authState = .authenticated
                return false
            }
            switch http.statusCode {
            case 200 ..< 300:
                guard let tokenResponse = try? JSONDecoder().decode(TokenResponse.self, from: data) else {
                    authState = .authenticated
                    return false
                }
                KeychainHelper.save(key: Self.accessTokenKey, value: tokenResponse.accessToken)
                if let refresh = tokenResponse.refreshToken {
                    KeychainHelper.save(key: Self.refreshTokenKey, value: refresh)
                }
                authState = .authenticated
                return true
            case 400, 401, 403:
                authState = .expired
                return false
            default:
                authState = .authenticated
                return false
            }
        } catch {
            authState = .authenticated
            return false
        }
    }

    func logout() {
        KeychainHelper.delete(key: Self.accessTokenKey)
        KeychainHelper.delete(key: Self.refreshTokenKey)
        authState = .unauthenticated
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
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
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
