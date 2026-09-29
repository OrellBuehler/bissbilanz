import SwiftUI

/// Root-level replacement for the whole app when the on-device database cannot be
/// opened in Local (anonymous) mode. The device holds the only copy of that data,
/// so the app must not carry on against an empty stand-in store: it says what
/// happened and leaves the original files untouched. Same plain centered layout
/// as `UpdateRequiredView`.
struct StoreUnavailableView: View {
    let hasBackup: Bool

    private static let supportURL = URL(string: "https://bissbilanz.orellbuehler.ch/support")

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(MacroColors.calories)
                    .accessibilityHidden(true)

                Text(L10n.storeUnavailableTitle)
                    .font(.title2)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)

                Text(L10n.storeUnavailableMessage)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if hasBackup {
                    Text(L10n.storeUnavailableBackupNote)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            if let url = Self.supportURL {
                Link(destination: url) {
                    Text(L10n.storeUnavailableSupport)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }

            Spacer()
        }
        .padding(32)
    }
}
