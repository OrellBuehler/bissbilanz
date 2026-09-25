import SafariServices
import SwiftUI

/// Minimal in-app browser for the public help center, shared by every tip's
/// "Learn more" action and the Settings help row.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context _: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_: SFSafariViewController, context _: Context) {}
}
