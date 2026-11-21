import Foundation

// Strings for the photo count and limit of an AI task. Kept in their own file
// for the same merge-conflict reason as `Localization+Claude.swift`.
extension L10n {
    static func aiTaskPhotoCount(_ count: Int, _ max: Int) -> String {
        localized(
            "ai_task_photo_count",
            en: "\(count) of \(max) photos",
            de: "\(count) von \(max) Fotos"
        )
    }

    static func aiTaskPhotoLimitReached(_ max: Int) -> String {
        localized(
            "ai_task_photo_limit_reached",
            en: "\(max) photos is the limit. Remove one to add another.",
            de: "\(max) Fotos sind das Maximum. Entferne eines, um ein anderes hinzuzufügen."
        )
    }

    static func aiMealEstimateUsesFirstPhotos(_ count: Int) -> String {
        localized(
            "ai_meal_estimate_uses_first_photos",
            en: "An estimate on this iPhone reads the first \(count) photos. Sending to your assistant includes all of them.",
            de: "Eine Schätzung auf diesem iPhone liest die ersten \(count) Fotos. Beim Senden an deinen Assistenten sind alle dabei."
        )
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
