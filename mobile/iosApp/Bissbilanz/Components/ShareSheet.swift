import SwiftUI
import UIKit

/// A file written to the temporary directory, ready to hand to the share sheet.
struct ExportedArchive: Identifiable {
    let url: URL
    var id: String { url.path }
}

/// The system share sheet for one file (Messages, Mail, WhatsApp, Files, …).
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context _: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_: UIActivityViewController, context _: Context) {}
}
