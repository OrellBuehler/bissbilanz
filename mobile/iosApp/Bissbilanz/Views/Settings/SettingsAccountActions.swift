import SwiftData
import SwiftUI

/// Account actions — signed-in only; sign-in itself sits in the status section
/// at the top.
struct SettingsAccountActionsSection: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AuthManager.self) private var authManager
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(SyncManager.self) private var syncManager
    @Environment(BulkUploadManager.self) private var bulkUploadManager
    @Environment(\.modelContext) private var modelContext
    @Environment(LocalDataMigrator.self) private var migrator
    @Environment(FoodImageLoader.self) private var foodImageLoader
    @Environment(FoodEnrichmentController.self) private var foodEnrichment
    @Environment(FoodLabelSweepController.self) private var foodLabelSweep
    @Environment(AiTaskStore.self) private var aiTaskStore
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Binding var errorMessage: String?

    @State private var showLogoutConfirmation = false
    @State private var showDeleteAccountConfirmation = false
    @State private var isDeletingAccount = false
    @State private var isExportingData = false
    @State private var exportedArchive: ExportedArchive?
    @State private var showDowngradeSheet = false
    @State private var downgradePhase: AccountDowngrader.Phase?
    @State private var downgradeFinished = false
    @State private var downgradeError: String?

    var body: some View {
        if !appModeManager.isLocal {
            Section(L10n.account) {
                exportButton
                signOutButton
                deleteAccountButton
            }
        }
    }

    private var exportButton: some View {
        Button {
            exportData()
        } label: {
            HStack {
                Label(L10n.exportData, systemImage: "square.and.arrow.up")
                if isExportingData {
                    Spacer()
                    ProgressView()
                }
            }
        }
        .disabled(isExportingData)
    }

    /// What signing out costs: the local data, and imported foods that never reached the server.
    private var signOutMessage: String {
        guard bulkUploadManager.hasWork else { return L10n.signOutConfirmation }
        let unsynced = bulkUploadManager.pendingCount + bulkUploadManager.failedCount
        return L10n.signOutConfirmation + "\n\n" + L10n.signOutBulkWarning(unsynced)
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            showLogoutConfirmation = true
        } label: {
            Label(L10n.signOut, systemImage: "rectangle.portrait.and.arrow.right")
        }
        // Anchor the confirmation to the sign-out button itself —
        // attached to the enclosing List it presents as a popover
        // pointing at an unrelated row.
        .confirmationDialog(
            L10n.signOut + "?",
            isPresented: $showLogoutConfirmation,
            titleVisibility: .visible
        ) {
            Button(L10n.signOut, role: .destructive) {
                tearDownAccount()
            }
            Button(L10n.cancel, role: .cancel) {}
        } message: {
            Text(signOutMessage)
        }
    }

    private var deleteAccountButton: some View {
        Button(role: .destructive) {
            showDeleteAccountConfirmation = true
        } label: {
            Label(L10n.deleteAccount, systemImage: "trash")
        }
        .disabled(isDeletingAccount)
        .confirmationDialog(
            L10n.deleteAccountTitle,
            isPresented: $showDeleteAccountConfirmation,
            titleVisibility: .visible
        ) {
            Button(L10n.downgradeOption) {
                showDowngradeSheet = true
            }
            Button(L10n.exportDataFirst) {
                exportData()
            }
            Button(L10n.deleteAccountConfirm, role: .destructive) {
                deleteAccount()
            }
            Button(L10n.cancel, role: .cancel) {}
        } message: {
            Text(L10n.deleteAccountConfirmation)
        }
        .sheet(item: $exportedArchive) { archive in
            ShareSheet(url: archive.url)
        }
        .sheet(isPresented: $showDowngradeSheet) {
            SettingsDowngradeSheet(
                isFinished: downgradeFinished,
                phase: downgradePhase,
                error: downgradeError,
                onConfirm: { downgradeToLocal() },
                onClose: { showDowngradeSheet = false }
            )
        }
    }

    /// The local store and pending queue belong to the signed-out account —
    /// wipe them so nothing leaks into the next session (Local mode or
    /// another account), then flip the auth state.
    private func tearDownAccount() {
        bulkUploadManager.reset()
        foodEnrichment.reset()
        foodLabelSweep.reset()
        aiTaskStore.resetAccountState()
        migrator.wipeLocalData()
        preferencesRepository.clearClaudeCapability()
        // wipeLocalData clears the files; this also drops the decoded images
        // the loader still holds in memory, which outlive them.
        foodImageLoader.clear()
        authManager.logout()
        // Reset the mode so the next start shows the login screen with the
        // mode choice again.
        appModeManager.clear()
    }

    private func downgradeToLocal() {
        guard downgradePhase == nil else { return }
        downgradeError = nil
        downgradePhase = .syncing
        Task {
            do {
                let downgrader = AccountDowngrader(
                    api: api,
                    context: modelContext,
                    syncManager: syncManager,
                    authManager: authManager,
                    appModeManager: appModeManager
                )
                try await downgrader.downgrade { phase in
                    downgradePhase = phase
                }
                downgradeFinished = true
            } catch let error as AccountDowngrader.DowngradeError {
                ErrorReporter.captureWarning(
                    "Account downgrade blocked by pending changes",
                    context: ["reason": ErrorReporter.reason(for: error)]
                )
                downgradeError = L10n.downgradePendingChanges
            } catch {
                ErrorReporter.captureWarning(
                    "Account downgrade failed",
                    context: ["reason": ErrorReporter.reason(for: error)]
                )
                downgradeError = L10n.downgradeFailed
            }
            downgradePhase = nil
        }
    }

    private func exportData() {
        guard !isExportingData else { return }
        isExportingData = true
        Task {
            defer { isExportingData = false }
            do {
                let data = try await api.exportAccountData()
                let date = Date().ISO8601Format().prefix(10)
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("bissbilanz-export-\(date).zip")
                try data.write(to: url, options: .atomic)
                exportedArchive = ExportedArchive(url: url)
            } catch {
                ErrorReporter.captureWarning(
                    "Account data export failed",
                    context: ["reason": ErrorReporter.reason(for: error)]
                )
                errorMessage = L10n.exportDataFailed
            }
        }
    }

    private func deleteAccount() {
        isDeletingAccount = true
        Task {
            do {
                try await api.deleteAccount()
                tearDownAccount()
            } catch {
                ErrorReporter.captureWarning(
                    "Account deletion failed",
                    context: ["reason": ErrorReporter.reason(for: error)]
                )
                errorMessage = L10n.deleteAccountFailed
            }
            isDeletingAccount = false
        }
    }
}

private struct SettingsDowngradeSheet: View {
    let isFinished: Bool
    let phase: AccountDowngrader.Phase?
    let error: String?
    let onConfirm: () -> Void
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if isFinished {
                    Label(L10n.downgradeDone, systemImage: "checkmark.circle")
                    Button(L10n.close) {
                        onClose()
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                } else if let phase {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text(phaseLabel(phase))
                    }
                } else {
                    Text(L10n.downgradeMessage)
                    if let error {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                    Button(L10n.downgradeConfirm) {
                        onConfirm()
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    Button(L10n.cancel) {
                        onClose()
                    }
                    .frame(maxWidth: .infinity)
                }
                Spacer()
            }
            .padding()
            .navigationTitle(L10n.downgradeTitle)
            .navigationBarTitleDisplayMode(.inline)
        }
        .interactiveDismissDisabled(phase != nil)
        .presentationDetents([.medium])
    }

    private func phaseLabel(_ phase: AccountDowngrader.Phase) -> String {
        switch phase {
        case .syncing: L10n.downgradeProgressSync
        case .downloading: L10n.downgradeProgressDownload
        case .deleting: L10n.downgradeProgressDelete
        }
    }
}
