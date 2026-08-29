import Foundation

struct AccountUser: Codable {
    let email: String?
    let name: String?
    let createdAt: String?
}

/// Earliest/latest dated row in the account. The download bounds itself with
/// this rather than with `createdAt`: entry, sleep, weight and day-property
/// dates are client-chosen, so imported or backfilled days can predate the
/// account and a device ahead of UTC can log past the server's "today".
struct AccountDataRange: Codable {
    let earliest: String?
    let latest: String?
}

struct AccountResponse: Codable {
    let user: AccountUser
    let dataRange: AccountDataRange
}
