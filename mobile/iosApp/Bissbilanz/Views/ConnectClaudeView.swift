import SwiftUI
import UIKit

struct ConnectClaudeView: View {
    @Environment(\.openURL) private var openURL

    private enum CopyTarget: Equatable {
        case serverURL
        case claudeCodeCommand
    }

    @State private var copiedTarget: CopyTarget?

    private var serverURL: String {
        "\(BissbilanzAPI.defaultBaseURL)/api/mcp"
    }

    private var claudeCodeCommand: String {
        "claude mcp add --transport http bissbilanz \(serverURL)"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text(L10n.connectClaudeIntro)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                serverUrlCard
                claudeAppCard
                claudeCodeCard
                otherClientsCard
            }
            .padding()
        }
        .navigationTitle(L10n.connectClaudeTitle)
    }

    private var serverUrlCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.connectClaudeServerUrlTitle)
                    .font(.headline)

                Text(serverURL)
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    copy(serverURL, target: .serverURL)
                } label: {
                    Label(
                        copiedTarget == .serverURL ? L10n.connectClaudeCopied : L10n.connectClaudeCopy,
                        systemImage: "doc.on.doc"
                    )
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var claudeAppCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L10n.connectClaudeAppTitle)
                    .font(.headline)

                VStack(alignment: .leading, spacing: 12) {
                    stepRow(1, L10n.connectClaudeStep1)
                    stepRow(2, L10n.connectClaudeStep2)
                    stepRow(3, L10n.connectClaudeStep3)
                    stepRow(4, L10n.connectClaudeStep4)
                }

                Button {
                    if let url = URL(string: "https://claude.ai/settings/connectors") {
                        openURL(url)
                    }
                } label: {
                    Text(L10n.connectClaudeOpenClaude)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    copy(serverURL, target: .serverURL)
                } label: {
                    Label(
                        copiedTarget == .serverURL ? L10n.connectClaudeCopied : L10n.connectClaudeCopyUrl,
                        systemImage: "doc.on.doc"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
    }

    private var claudeCodeCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.connectClaudeCodeTitle)
                    .font(.headline)

                Text(claudeCodeCommand)
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    copy(claudeCodeCommand, target: .claudeCodeCommand)
                } label: {
                    Label(
                        copiedTarget == .claudeCodeCommand ? L10n.connectClaudeCopied : L10n.connectClaudeCopy,
                        systemImage: "doc.on.doc"
                    )
                }
                .buttonStyle(.bordered)

                Text(L10n.connectClaudeCodeThenMcp)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var otherClientsCard: some View {
        CardView {
            VStack(alignment: .leading, spacing: 8) {
                Text(L10n.connectClaudeOtherClientsTitle)
                    .font(.headline)

                Text(L10n.connectClaudeOtherClientsBody)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func stepRow(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Color.accentColor))
            Text(text)
                .font(.subheadline)
            Spacer(minLength: 0)
        }
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
