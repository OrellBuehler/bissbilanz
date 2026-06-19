import SwiftUI

/// Shown when a user signs in while in Local mode: uploads the local data to
/// the account (or lets the user discard it when the account already has
/// data). Routing leaves this screen automatically once the app mode flips to
/// Synced. Mirrors the Android `MigrationScreen`.
struct MigrationView: View {
    @Environment(LocalDataMigrator.self) private var migrator
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(AuthManager.self) private var authManager

    @State private var phase: Phase = .deciding
    @State private var showDiscardConfirmation = false

    private enum Phase: Equatable {
        case deciding
        case choice(localItemCount: Int)
        case migrating
        case preflightFailed(String)
    }

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground)
                .ignoresSafeArea()

            content
                .padding(24)
        }
        .task { await decide() }
        .confirmationDialog(L10n.migrationDiscardTitle, isPresented: $showDiscardConfirmation) {
            Button(L10n.discard, role: .destructive) {
                migrator.discardLocalData()
            }
            Button(L10n.cancel, role: .cancel) {}
        } message: {
            Text(L10n.migrationDiscardMessage)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .deciding:
            ProgressView()

        case let .choice(localItemCount):
            choiceCard(localItemCount: localItemCount)

        case let .preflightFailed(message):
            failureCard(message: message)

        case .migrating:
            switch migrator.state {
            case let .running(done, total, step):
                progressCard(done: done, total: total, step: step)
            case let .failed(message):
                failureCard(message: message)
            case .idle, .completed:
                // Idle: migrate() is about to start. Completed: the mode flips
                // to Synced and the root routing leaves this screen.
                ProgressView()
            }
        }
    }

    // MARK: - Cards

    private func choiceCard(localItemCount: Int) -> some View {
        card {
            Text(L10n.migrationAccountHasData)
                .font(.title3)
                .fontWeight(.bold)

            Text(L10n.migrationChoiceDescription)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(spacing: 8) {
                Button {
                    Task { await startUpload() }
                } label: {
                    Text(L10n.migrationUploadItems(localItemCount))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    showDiscardConfirmation = true
                } label: {
                    Text(L10n.migrationStartFresh)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(.top, 8)
        }
    }

    private func progressCard(done: Int, total: Int, step: MigrationStep) -> some View {
        card(alignment: .center) {
            Text(L10n.migrationUploading)
                .font(.title3)
                .fontWeight(.bold)

            ProgressView(value: total > 0 ? Double(done) / Double(total) : 0)
                .progressViewStyle(.linear)

            Text("\(L10n.migrationStepLabel(step)) (\(done)/\(total))…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func failureCard(message: String) -> some View {
        card {
            Text(L10n.migrationFailedTitle)
                .font(.title3)
                .fontWeight(.bold)

            Text(L10n.migrationFailureSafe)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(message)
                .font(.caption)
                .foregroundStyle(.red)

            VStack(spacing: 8) {
                Button {
                    Task { await retry() }
                } label: {
                    Text(L10n.retry)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    // Abandons the sign-in: the mode stays Local, the local
                    // data is kept and routing returns to the anonymous app.
                    // The normalization marker must not survive the abandoned
                    // run — a later sign-in (possibly a different account)
                    // needs a fresh normalization pass.
                    migrator.abandonMigration()
                    authManager.logout()
                } label: {
                    Text(L10n.continueWithoutAccount)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(.top, 8)
        }
    }

    private func card(
        alignment: HorizontalAlignment = .leading,
        @ViewBuilder content: () -> some View
    ) -> some View {
        VStack(alignment: alignment, spacing: 12) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: alignment == .center ? .center : .leading)
        .padding(24)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Flow

    /// Nothing local → flip straight to Synced; account already has data →
    /// ask the user; otherwise start uploading immediately (Android parity).
    private func decide() async {
        phase = .deciding
        let localItemCount = migrator.plan().total
        if localItemCount == 0 {
            appModeManager.setMode(.synced)
            return
        }
        do {
            if try await migrator.serverHasData() {
                phase = .choice(localItemCount: localItemCount)
            } else {
                await startUpload()
            }
        } catch {
            phase = .preflightFailed(error.localizedDescription)
        }
    }

    private func startUpload() async {
        phase = .migrating
        await migrator.migrate()
    }

    private func retry() async {
        if phase == .migrating {
            await startUpload()
        } else {
            await decide()
        }
    }
}
