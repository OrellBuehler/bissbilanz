import SwiftUI

/// The lines under an AI task's photo row: how many photos are attached, and
/// once the limit is reached, that no more fit. Shared by the capture sheet and
/// the edit sheet.
struct AiTaskPhotoNote: View {
    let count: Int
    /// Set when an on-device estimate would read fewer photos than are attached.
    var estimateLimit: Int?

    private var isFull: Bool {
        count >= AiTaskLimits.maxPhotos
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if count > 0 {
                Text(L10n.aiTaskPhotoCount(count, AiTaskLimits.maxPhotos))
                    .monospacedDigit()
            }
            if isFull {
                Label(L10n.aiTaskPhotoLimitReached(AiTaskLimits.maxPhotos), systemImage: "info.circle")
                    .foregroundStyle(.primary)
            } else {
                Text(L10n.aiTaskPhotoHint(AiTaskLimits.maxPhotos))
            }
            if let estimateLimit, count > estimateLimit {
                Text(L10n.aiMealEstimateUsesFirstPhotos(estimateLimit))
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }
}
