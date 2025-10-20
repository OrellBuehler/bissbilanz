import Foundation

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Decodable {
    let token: String
    let user: UserProfile
}

struct UserProfile: Decodable {
    let id: String
    let email: String
    let displayName: String
}
