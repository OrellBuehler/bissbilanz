import SwiftUI

/// Surfaces offline edits that lost last-write-wins, or that targeted a record
/// deleted on another device. The sync manager records these while draining;
/// before this banner existed nothing read them, so the resolution was silent
/// and the user never learned their change had been dropped. Mirrors the web
/// PWA's SyncConflictBanner.
///
/// Renders nothing when there are no notices, so it costs no space as a
/// `safeAreaInset` on the tab view.
///
/// The notice text itself comes from the sync manager in English, matching how
/// the pending-changes screen already reports sync errors.
struct SyncConflictBanner: View {
    @Environment(SyncManager.self) private var syncManager

    var body: some View {
        if let first = syncManager.conflictNotices.first {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: "info.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.syncConflictBanner(syncManager.conflictNoticeCount))
                        .font(.subheadline.weight(.semibold))
                    Text(first)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Button(L10n.dismiss) {
                    syncManager.clearConflictNotices()
                }
                .font(.subheadline.weight(.medium))
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
            }
            .padding(12)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
            .padding(.top, 4)
            .padding(.bottom, 8)
        }
    }
}
