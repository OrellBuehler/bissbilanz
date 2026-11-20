import PhotosUI
import SwiftUI

/// Text (and photos) to put in the composer: a suggestion to finish, or a
/// message that did not go out, handed back.
struct ChatComposerSeed: Equatable {
    let id = UUID()
    var text: String
    var images: [UIImage] = []
}

/// The message box: multi-line text, photos (camera or library, within the
/// per-message and per-conversation caps), and Send — or Stop while the
/// assistant is answering. The text and photos are kept per conversation in
/// the store, so leaving the screen keeps the draft.
struct ChatComposer: View {
    let conversationId: String
    let isEnabled: Bool
    /// A message of this chat is still on its way: one at a time.
    let isSending: Bool
    /// The run is queued or running: Stop instead of Send.
    let isAnswering: Bool
    /// The run waits for a confirmation: Stop is offered while the box is empty.
    let isWaiting: Bool
    let isStopping: Bool
    @Binding var seed: ChatComposerSeed?
    let onSend: (String, [UIImage]) -> Void
    let onStop: () -> Void

    @Environment(ChatStore.self) private var store
    @State private var text = ""
    @State private var images: [UIImage] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @FocusState private var isFocused: Bool

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var length: Int {
        ChatLimits.length(trimmed)
    }

    private var isTooLong: Bool {
        length > ChatLimits.maxTextLength
    }

    private var photoRoom: Int {
        max(0, store.photoRoom(in: conversationId) - images.count)
    }

    private var canSend: Bool {
        isEnabled && !isSending && !isAnswering && !trimmed.isEmpty && !isTooLong
    }

    private var showsStop: Bool {
        isAnswering || (isWaiting && trimmed.isEmpty)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !images.isEmpty {
                attachmentStrip
            }
            HStack(alignment: .bottom, spacing: 8) {
                attachButton
                field
                trailingButton
            }
            if isTooLong {
                Text(L10n.chatTextTooLong(ChatLimits.maxTextLength))
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .onAppear {
            text = store.draft(for: conversationId)
            images = store.attachments(for: conversationId)
        }
        .onChange(of: text) { _, newValue in
            store.setDraft(newValue, for: conversationId)
        }
        .onChange(of: images) { _, newValue in
            store.setAttachments(newValue, for: conversationId)
        }
        .onChange(of: seed) { _, newValue in
            guard let newValue else { return }
            text = newValue.text
            if !newValue.images.isEmpty {
                images += newValue.images.prefix(photoRoom)
            }
            seed = nil
            isFocused = true
        }
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            loadPhotos(items)
        }
        .photosPicker(
            isPresented: $showPhotoPicker,
            selection: $pickerItems,
            maxSelectionCount: max(1, photoRoom),
            matching: .images
        )
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(
                onImage: { image in
                    showCamera = false
                    if photoRoom > 0 { images.append(image) }
                },
                onCancel: { showCamera = false }
            )
            .ignoresSafeArea()
        }
    }

    private var field: some View {
        VStack(alignment: .trailing, spacing: 2) {
            TextField(L10n.chatComposerPlaceholder, text: $text, axis: .vertical)
                .lineLimit(1 ... 6)
                .focused($isFocused)
                .disabled(!isEnabled)
            if length > ChatLimits.maxTextLength - 500 {
                Text(verbatim: "\(length)/\(ChatLimits.maxTextLength)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(isTooLong ? Color.red : Color.secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
    }

    private var attachButton: some View {
        Menu {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button {
                    showCamera = true
                } label: {
                    Label(L10n.takePhoto, systemImage: "camera")
                }
            }
            Button {
                showPhotoPicker = true
            } label: {
                Label(L10n.choosePhoto, systemImage: "photo.on.rectangle")
            }
        } label: {
            Image(systemName: "photo.badge.plus")
                .font(.title3)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .disabled(!isEnabled || photoRoom == 0)
        .accessibilityLabel(L10n.chatAttachPhoto)
        .accessibilityHint(photoRoom == 0 ? L10n.chatConversationPhotosFull : L10n.chatPhotoLimit(ChatLimits.maxPhotosPerMessage))
    }

    @ViewBuilder
    private var trailingButton: some View {
        if showsStop {
            Button(action: onStop) {
                Image(systemName: isStopping ? "hourglass" : "stop.circle.fill")
                    .font(.title)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .disabled(isStopping)
            .accessibilityLabel(isStopping ? L10n.chatStopping : L10n.chatStop)
        } else {
            Button(action: send) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .disabled(!canSend)
            .accessibilityLabel(L10n.chatSend)
        }
    }

    private var attachmentStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .accessibilityLabel(L10n.chatPhoto(index + 1))
                        Button {
                            images.remove(at: index)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.white, .black.opacity(0.55))
                        }
                        .buttonStyle(.plain)
                        .padding(3)
                        .accessibilityLabel(L10n.removePhoto)
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func send() {
        guard canSend else { return }
        let message = trimmed
        let photos = images
        text = ""
        images = []
        onSend(message, photos)
    }

    private func loadPhotos(_ items: [PhotosPickerItem]) {
        Task {
            var loaded: [UIImage] = []
            for item in items {
                do {
                    guard let data = try await item.loadTransferable(type: Data.self),
                          let image = UIImage(data: data)
                    else { continue }
                    loaded.append(image)
                } catch {
                    ErrorReporter.addBreadcrumb("Chat photo could not be loaded", category: "chat", data: [
                        "reason": ErrorReporter.reason(for: error)
                    ])
                }
            }
            images.append(contentsOf: loaded.prefix(photoRoom))
            // The picker keeps its selection; clearing it lets the same photo
            // be picked again after a removal.
            pickerItems = []
        }
    }
}
