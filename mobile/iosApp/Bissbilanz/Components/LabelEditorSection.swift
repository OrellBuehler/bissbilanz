import SwiftUI

/// The labels section of an edit form: the current labels with remove buttons, a
/// field to add one, and an optional "Suggest labels" button. Shared by the food and
/// recipe editors, since both write the same English nouns. A label is normalized on
/// add so what the user sees is exactly what the server stores.
struct LabelEditorSection: View {
    @Binding var labels: [String]
    let hint: String
    let suggestHint: String
    let canSuggest: Bool
    let isSuggesting: Bool
    let suggestError: String?
    let onSuggest: () -> Void

    @State private var labelInput = ""

    var body: some View {
        Section {
            ForEach(labels, id: \.self) { label in
                LabeledContent(label) {
                    Button(role: .destructive) {
                        labels.removeAll { $0 == label }
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("\(L10n.removeLabel): \(label)")
                }
            }
            HStack {
                TextField(L10n.addLabel, text: $labelInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(addLabel)
                Button(action: addLabel) {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(labelInput.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityLabel(L10n.addLabel)
            }

            if canSuggest {
                Button(action: onSuggest) {
                    if isSuggesting {
                        HStack {
                            ProgressView()
                            Text(L10n.suggestingLabels)
                        }
                    } else {
                        Label(L10n.suggestLabels, systemImage: "sparkles")
                    }
                }
                .disabled(isSuggesting)
                Text(suggestHint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let suggestError {
                Text(suggestError)
                    .foregroundStyle(.red)
                    .font(.caption)
            }
        } header: {
            Text(L10n.labels)
        } footer: {
            Text(hint)
        }
    }

    private func addLabel() {
        defer { labelInput = "" }
        guard let value = LabelNormalizer.normalize(labelInput),
              !labels.contains(value),
              labels.count < LabelNormalizer.maxLabelsPerFood
        else { return }
        labels.append(value)
    }
}
