import Foundation

struct AccountUser: Codable {
    let email: String?
    let name: String?
    let createdAt: String?
}

struct AccountResponse: Codable {
    let user: AccountUser
}
