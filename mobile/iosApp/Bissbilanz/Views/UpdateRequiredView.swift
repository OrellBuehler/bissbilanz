import SwiftUI

/// Root-level replacement for the entire app once `UpdateRequiredGate` trips —
/// shown ahead of the normal login/app/migration routing in `BissbilanzApp`,
/// since none of those screens are safe to keep using against a server that
/// has already refused this build. Mirrors `LoginView`'s plain centered layout
/// (the other pre-auth root screen) rather than `MigrationView`'s card, since
/// there is nothing to choose between here — just one action.
struct UpdateRequiredView: View {
    let minVersion: String

    private static let appStoreURL = URL(string: "https://apps.apple.com/app/id6780591258")

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(MacroColors.calories)
                    .accessibilityHidden(true)

                Text(L10n.updateRequiredTitle)
                    .font(.title2)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)

                Text(L10n.updateRequiredMessage(minVersion: minVersion))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Button {
                openAppStore()
            } label: {
                Text(L10n.updateRequiredButton)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer()
        }
        .padding(32)
    }

    private func openAppStore() {
        guard let url = Self.appStoreURL else { return }
        UIApplication.shared.open(url)
    }
}
