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
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 1) {
                    Text(L10n.syncConflictBanner(syncManager.conflictNoticeCount))
                        .font(.caption.weight(.medium))
                    Text(first)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Button(L10n.dismiss) {
                    syncManager.clearConflictNotices()
                }
                .font(.caption)
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        }
    }
}
