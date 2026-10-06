import SwiftUI

/// Progress of the background upload of a bulk import ("Syncing 12,340 / 48,000 foods"), with
/// pause and resume and the Wi-Fi-only choice. Shown wherever the user is while foods remain
/// to upload, above the tab bar like `SyncConflictBanner`; nothing when there are none.
struct BulkUploadBanner: View {
    @Environment(BulkUploadManager.self) private var manager
    @Environment(AppModeManager.self) private var appMode
    @Environment(ConnectivityMonitor.self) private var connectivity

    var body: some View {
        @Bindable var manager = manager
        if manager.hasWork, !appMode.isLocal {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 12) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.title3)
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                        if let detail {
                            Text(detail)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if manager.pendingCount > 0 {
                        Button(manager.isPaused ? L10n.bulkUploadResume : L10n.bulkUploadPause) {
                            if manager.isPaused { manager.resume() } else { manager.pause() }
                        }
                        .font(.subheadline.weight(.medium))
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)
                    }
                    Menu {
                        Toggle(L10n.bulkUploadWifiOnly, isOn: $manager.wifiOnly)
                        if manager.failedCount > 0 {
                            Button(L10n.bulkUploadRetryFailed) { manager.retryFailed() }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                    }
                    .accessibilityLabel(L10n.bulkUploadOptions)
                }
                if manager.pendingCount > 0 {
                    ProgressView(value: Double(manager.uploadedCount), total: Double(max(manager.total, 1)))
                }
            }
            .padding(12)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 4)
        }
    }

    private var title: String {
        if manager.pendingCount == 0, manager.failedCount > 0 {
            return L10n.bulkUploadFailed(manager.failedCount)
        }
        return L10n.bulkUploadBanner(done: manager.uploadedCount, total: manager.total)
    }

    /// Why nothing is moving, when nothing is.
    private var detail: String? {
        guard manager.pendingCount > 0 else { return nil }
        if manager.isPaused { return L10n.bulkUploadPaused }
        if !connectivity.isOnline { return L10n.bulkUploadOffline }
        if manager.wifiOnly, connectivity.isExpensive { return L10n.bulkUploadWaitingForWifi }
        if manager.rateLimitedUntil != nil { return L10n.bulkUploadRateLimited }
        return manager.lastError
    }
}
