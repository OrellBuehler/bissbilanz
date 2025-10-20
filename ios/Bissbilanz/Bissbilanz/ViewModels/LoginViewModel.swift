import Foundation
import Combine

@MainActor
final class LoginViewModel: ObservableObject {
    @Published var email: String = ""
    @Published var password: String = ""
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var token: String?
    @Published private(set) var errorMessage: String?

    private let client: APIClientProtocol

    init(client: APIClientProtocol = APIClient()) {
        self.client = client
    }

    var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !isLoading
    }

    func login() {
        guard canSubmit else { return }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                let response = try await client.login(email: email, password: password)
                token = response.token
                errorMessage = nil
            } catch {
                if let apiError = error as? APIClient.APIError {
                    errorMessage = apiError.localizedDescription
                } else {
                    errorMessage = "Something went wrong. Please try again."
                }
                token = nil
            }
            isLoading = false
        }
    }
}
