import Foundation

protocol APIClientProtocol {
    func login(email: String, password: String) async throws -> LoginResponse
}

struct APIClient: APIClientProtocol {
    enum APIError: LocalizedError {
        case invalidURL
        case invalidResponse
        case decodingFailed
        case unauthorized
        case server(message: String?)

        var errorDescription: String? {
            switch self {
            case .invalidURL:
                return "The login endpoint could not be reached."
            case .invalidResponse:
                return "Received an unexpected response from the server."
            case .decodingFailed:
                return "Failed to decode the response from the server."
            case .unauthorized:
                return "Invalid email or password."
            case .server(let message):
                return message ?? "The server reported an error."
            }
        }
    }

    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL = URL(string: "http://localhost:3000")!, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func login(email: String, password: String) async throws -> LoginResponse {
        let endpoint = baseURL.appendingPathComponent("auth/login")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload = LoginRequest(email: email, password: password)
        do {
            request.httpBody = try JSONEncoder().encode(payload)
        } catch {
            throw APIError.invalidURL
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.server(message: error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200:
            do {
                return try JSONDecoder().decode(LoginResponse.self, from: data)
            } catch {
                throw APIError.decodingFailed
            }
        case 400:
            let message = String(data: data, encoding: .utf8)
            throw APIError.server(message: message)
        case 401:
            throw APIError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8)
            throw APIError.server(message: message)
        }
    }
}
