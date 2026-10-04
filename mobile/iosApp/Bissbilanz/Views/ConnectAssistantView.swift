import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct ConnectAssistantView: View {
    @Environment(\.openURL) private var openURL
    @Environment(McpConnectionStatus.self) private var mcpConnectionStatus
    @ScaledMetric(relativeTo: .body) private var qrSize: CGFloat = 180
    @ScaledMetric(relativeTo: .subheadline) private var stepBadgeSize: CGFloat = 22

    private enum CopyTarget: Equatable {
        case serverURL
        case chatGptServerURL
        case installLink
        case claudeCodeCommand
    }

    @State private var copiedTarget: CopyTarget?
    @State private var qrImage: UIImage?

    /// Permanent Claude directory page for the connector, once the listing is
    /// approved. When set, it replaces the prefilled "add custom connector"
    /// link everywhere (button, copy link, QR code).
    nonisolated static let directoryListingURL: URL? = nil

    nonisolated static let chatGptPluginsURL = URL(string: "https://chatgpt.com/plugins")!

    nonisolated static var serverURL: String {
        "\(BissbilanzAPI.defaultBaseURL)/api/mcp"
    }

    nonisolated static func claudeInstallURL(
        serverURL: String = ConnectAssistantView.serverURL,
        directoryListingURL: URL? = ConnectAssistantView.directoryListingURL
    ) -> URL {
        if let directoryListingURL { return directoryListingURL }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "claude.ai"
        components.path = "/customize/connectors"
        components.percentEncodedQueryItems = [
            URLQueryItem(name: "modal", value: "add-custom-connector"),
            URLQueryItem(name: "connectorName", value: "Bissbilanz"),
            URLQueryItem(name: "connectorUrl", value: percentEncoded(serverURL)),
        ]
        return components.url!
    }

    nonisolated private static func percentEncoded(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    /// Native-resolution QR image (one pixel per module); the view scales it
    /// up with `.interpolation(.none)` so the modules stay sharp.
    nonisolated static func qrCodeImage(for text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        guard let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    private var serverURL: String { Self.serverURL }

    private var installURL: URL { Self.claudeInstallURL() }

    private var claudeCodeCommand: String {
        "claude mcp add --transport http bissbilanz \(serverURL)"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text(L10n.connectAssistantIntro)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                statusCard
                claudeCard
                chatGptCard
                geminiCard
                desktopCard
                moreCard
            }
            .padding()
        }
        .navigationTitle(L10n.connectAssistantTitle)
        .task { await mcpConnectionStatus.refresh() }
        .onAppear {
            if qrImage == nil { qrImage = Self.qrCodeImage(for: installURL.absoluteString) }
        }
    }

    private var statusCard: some View {
        CardView {
            HStack(spacing: 12) {
                Image(systemName: mcpConnectionStatus.isConnected ? "checkmark.circle.fill" : "circle.dashed")
                    .font(.title2)
                    .foregroundStyle(mcpConnectionStatus.isConnected ? Color.green : Color.secondary)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.connectAssistantStatusTitle)
                        .font(.headline)
                    Text(statusText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var statusText: String {
        mcpConnectionStatus.isConnected
            ? L10n.connectAssistantConnected(mcpConnectionStatus.clientNames)
            : L10n.connectAssistantNotConnected
    }

    private var claudeCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.connectAssistantClaudeTitle)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Button {
                    openURL(installURL)
                } label: {
                    Text(L10n.connectAssistantClaudeButton)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityHint(L10n.connectAssistantOpensInBrowser)

                Text(L10n.connectAssistantClaudeNote)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var chatGptCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L10n.connectAssistantChatGptTitle)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Text(L10n.connectAssistantChatGptIntro)
                    .font(.subheadline)

                VStack(alignment: .leading, spacing: 12) {
                    stepRow(1, L10n.connectAssistantChatGptStep1)
                    stepRow(2, L10n.connectAssistantChatGptStep2)
                    stepRow(3, L10n.connectAssistantChatGptStep3)
                    stepRow(4, L10n.connectAssistantChatGptStep4)
                    stepRow(5, L10n.connectAssistantChatGptStep5)
                }

                Button {
                    openURL(Self.chatGptPluginsURL)
                } label: {
                    Text(L10n.connectAssistantChatGptOpen)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityHint(L10n.connectAssistantOpensInBrowser)

                Button {
                    copy(serverURL, target: .chatGptServerURL)
                } label: {
                    Label(
                        copiedTarget == .chatGptServerURL
                            ? L10n.connectAssistantCopied
                            : L10n.connectAssistantCopyUrl,
                        systemImage: "doc.on.doc"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)

                Text(L10n.connectAssistantChatGptNote)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var geminiCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 8) {
                Text(L10n.connectAssistantGeminiTitle)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Text(L10n.connectAssistantGeminiNote)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var desktopCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L10n.connectAssistantDesktopTitle)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Text(L10n.connectAssistantDesktopBody)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if let qrImage {
                    Image(uiImage: qrImage)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: qrSize, height: qrSize)
                        .padding(12)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .frame(maxWidth: .infinity)
                        .accessibilityLabel(L10n.connectAssistantQrLabel)
                        .accessibilityAddTraits(.isImage)
                }

                Button {
                    copy(installURL.absoluteString, target: .installLink)
                } label: {
                    Label(
                        copiedTarget == .installLink ? L10n.connectAssistantCopied : L10n.connectAssistantCopyLink,
                        systemImage: "link"
                    )
                }
                .buttonStyle(.bordered)

                Divider()

                Text(L10n.connectAssistantServerUrlTitle)
                    .font(.subheadline.weight(.semibold))

                Text(serverURL)
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    copy(serverURL, target: .serverURL)
                } label: {
                    Label(
                        copiedTarget == .serverURL ? L10n.connectAssistantCopied : L10n.connectAssistantCopy,
                        systemImage: "doc.on.doc"
                    )
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var moreCard: some View {
        CardView {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 12) {
                    Text(L10n.connectAssistantClaudeCodeTitle)
                        .font(.subheadline.weight(.semibold))

                    Text(claudeCodeCommand)
                        .font(.system(.footnote, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        copy(claudeCodeCommand, target: .claudeCodeCommand)
                    } label: {
                        Label(
                            copiedTarget == .claudeCodeCommand
                                ? L10n.connectAssistantCopied
                                : L10n.connectAssistantCopy,
                            systemImage: "doc.on.doc"
                        )
                    }
                    .buttonStyle(.bordered)

                    Text(L10n.connectAssistantClaudeCodeThenMcp)
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Divider()

                    Text(L10n.connectAssistantOtherClientsTitle)
                        .font(.subheadline.weight(.semibold))

                    Text(L10n.connectAssistantOtherClientsBody)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 12)
            } label: {
                Text(L10n.connectAssistantMoreTitle)
                    .font(.headline)
            }
        }
    }

    private func stepRow(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: stepBadgeSize, height: stepBadgeSize)
                .background(Circle().fill(Color.accentColor))
            Text(text)
                .font(.subheadline)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func copy(_ text: String, target: CopyTarget) {
        UIPasteboard.general.string = text
        copiedTarget = target
        Task {
            try? await Task.sleep(for: .seconds(2))
            if copiedTarget == target { copiedTarget = nil }
        }
    }
}
