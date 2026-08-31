import PhotosUI
import SwiftUI

/// Mirrors MAX_AI_TASK_PHOTOS on the server.
private let maxAiTaskPhotos = 5

/// Entry point for AI-assisted meal logging: a free-text description (and
/// optionally up to five photos) can either be estimated on-device via `MealEstimator`
/// — pushing `AIMealReviewView` within this sheet's stack — or queued as an
/// `AiTask` for the MCP assistant to pick up later. On-device estimation only
/// runs on Apple Intelligence devices (iOS 26+, see `MealEstimatorAvailability`);
/// queueing needs only a server connection, so it's shown in Synced mode as a
/// secondary action where estimation is available and as the only action where
/// it isn't. Local (anonymous) mode has no server, so queueing is hidden there.
struct AIMealSheet: View {
    @Environment(MealEstimator.self) private var mealEstimator
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appMode
    @Environment(\.dismiss) private var dismiss

    let date: String
    var onLogged: (Int) -> Void = { _ in }
    var onQueued: () -> Void = {}

    @State private var description = ""
    @State private var mealType: String
    @State private var isEstimating = false
    @State private var errorMessage: String?
    @State private var estimate: MealEstimate?

    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var attachedImages: [UIImage] = []
    @State private var showCamera = false
    @State private var isSendingToAssistant = false
    @State private var pendingTaskCount: Int?
    @State private var detent: PresentationDetent = .medium

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    init(date: String, onLogged: @escaping (Int) -> Void = { _ in }, onQueued: @escaping () -> Void = {}) {
        self.date = date
        self.onLogged = onLogged
        self.onQueued = onQueued
        _mealType = State(initialValue: Self.mealForCurrentTime())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section(L10n.aiMealWhatDidYouEat) {
                    TextField(L10n.aiMealDescriptionPlaceholder, text: $description, axis: .vertical)
                        .lineLimit(4 ... 8)
                }

                if !appMode.isLocal {
                    Section(L10n.aiTaskPhotoSectionTitle) {
                        photoAttachmentRow
                    }
                }

                if mealEstimator.availability == .available {
                    Section {
                        Button {
                            Task { await runEstimate() }
                        } label: {
                            HStack {
                                Spacer()
                                if isEstimating {
                                    ProgressView()
                                    Text(L10n.aiMealEstimating)
                                } else {
                                    Text(L10n.aiMealEstimateButton)
                                }
                                Spacer()
                            }
                        }
                        .disabled(trimmedDescription.isEmpty || isEstimating || isSendingToAssistant)
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    Section {
                        Label {
                            Text(availabilityMessage)
                        } icon: {
                            Image(systemName: "sparkles")
                        }
                        .foregroundStyle(.secondary)
                    }
                }

                if !appMode.isLocal {
                    Section {
                        sendToAssistantButton

                        if let pendingTaskCount, pendingTaskCount > 0 {
                            Text(L10n.aiTaskPendingCount(pendingTaskCount))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .keyboardDismissable()
            .navigationTitle(L10n.aiMealEstimate)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
            // The review pushes within this sheet's stack instead of stacking
            // a second sheet; Back returns to the form, and a successful log
            // captures this sheet's dismiss to close the whole flow.
            // (isPresented: rather than item-based because MealEstimate isn't
            // Hashable.)
            .navigationDestination(isPresented: .init(
                get: { estimate != nil },
                set: { if !$0 { estimate = nil } }
            )) {
                if let estimate {
                    AIMealReviewView(estimate: estimate, date: date, mealType: mealType) { count in
                        onLogged(count)
                        dismiss()
                    }
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker(
                    onImage: { image in
                        showCamera = false
                        if attachedImages.count < maxAiTaskPhotos { attachedImages.append(image) }
                    },
                    onCancel: { showCamera = false }
                )
                .ignoresSafeArea()
            }
            .onChange(of: selectedPhotoItems) { _, items in
                guard !items.isEmpty else { return }
                loadPhotos(items)
            }
            .onAppear { mealEstimator.prewarm() }
            .task { await loadPendingCount() }
        }
        .presentationDetents([.medium, .large], selection: $detent)
    }

    /// `.buttonStyle(.bordered)` and `.buttonStyle(.borderedProminent)` are
    /// distinct concrete types, so the style can't be chosen with a ternary —
    /// branching the whole button through `@ViewBuilder` is the pattern that
    /// type-checks.
    @ViewBuilder
    private var sendToAssistantButton: some View {
        let button = Button {
            Task { await sendToAssistant() }
        } label: {
            HStack {
                Spacer()
                if isSendingToAssistant {
                    ProgressView()
                    Text(L10n.aiTaskSending)
                } else {
                    Text(L10n.aiTaskSendButton)
                }
                Spacer()
            }
        }
        .disabled(!canSendToAssistant || isSendingToAssistant || isEstimating)

        if mealEstimator.availability == .available {
            button.buttonStyle(.bordered)
        } else {
            button.buttonStyle(.borderedProminent)
        }
    }

    @ViewBuilder
    private var photoAttachmentRow: some View {
        if !attachedImages.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(attachedImages.enumerated()), id: \.offset) { index, image in
                        ZStack(alignment: .topTrailing) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 80, height: 80)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .clipped()
                            Button(role: .destructive) {
                                attachedImages.remove(at: index)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.white, .black.opacity(0.5))
                            }
                            .buttonStyle(.plain)
                            .padding(4)
                        }
                    }
                }
            }
        }

        if attachedImages.count < maxAiTaskPhotos {
            HStack(spacing: 12) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button {
                        showCamera = true
                    } label: {
                        Label(L10n.takePhoto, systemImage: "camera")
                    }
                    .buttonStyle(.bordered)
                }

                PhotosPicker(
                    selection: $selectedPhotoItems,
                    maxSelectionCount: maxAiTaskPhotos - attachedImages.count,
                    matching: .images
                ) {
                    Label(L10n.choosePhoto, systemImage: "photo.on.rectangle")
                }
                .buttonStyle(.bordered)
            }
        }

        Text(L10n.aiTaskPhotoHint(maxAiTaskPhotos))
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    private var trimmedDescription: String {
        description.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSendToAssistant: Bool {
        !trimmedDescription.isEmpty || !attachedImages.isEmpty
    }

    private var availabilityMessage: String {
        switch mealEstimator.availability {
        case .available: ""
        case .deviceNotEligible: L10n.aiMealDeviceNotEligible
        case .appleIntelligenceDisabled: L10n.aiMealAppleIntelligenceDisabled
        case .modelNotReady: L10n.aiMealModelNotReady
        case .osUnsupported: L10n.aiMealOsUnsupported
        }
    }

    private func runEstimate() async {
        isEstimating = true
        errorMessage = nil
        do {
            estimate = try await mealEstimator.estimate(description: trimmedDescription)
            // The pushed review is cramped at medium height — promote the
            // sheet once there is something to review.
            detent = .large
        } catch let error as MealEstimatorError {
            errorMessage = error.localizedMessage
        } catch {
            errorMessage = error.localizedDescription
        }
        isEstimating = false
    }

    private func loadPhotos(_ items: [PhotosPickerItem]) {
        Task {
            var loaded: [UIImage] = []
            for item in items {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data)
                else { continue }
                loaded.append(image)
            }
            let room = maxAiTaskPhotos - attachedImages.count
            attachedImages.append(contentsOf: loaded.prefix(room))
            // The picker keeps its selection, so clearing it is what lets the
            // same photo be picked again after a removal.
            selectedPhotoItems = []
        }
    }

    private func loadPendingCount() async {
        guard !appMode.isLocal else { return }
        pendingTaskCount = try? await api.listAiTasks(status: "pending", limit: 1).total
    }

    private func sendToAssistant() async {
        isSendingToAssistant = true
        errorMessage = nil
        do {
            var parts: [(data: Data, filename: String)] = []
            for (index, image) in attachedImages.enumerated() {
                if let data = image.downscaledJPEGData(maxDimension: 1600, quality: 0.8) {
                    parts.append((data: data, filename: "meal_\(index).jpg"))
                }
            }
            let photoUrls = parts.isEmpty ? nil : try await api.uploadAiTaskPhotos(parts)
            let task = AiTaskCreate(
                description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                photoUrls: photoUrls,
                date: date,
                mealType: mealType,
                source: "ios"
            )
            _ = try await api.createAiTask(task, idempotencyKey: UUID().uuidString)
            isSendingToAssistant = false
            onQueued()
            dismiss()
        } catch let error as APIError {
            isSendingToAssistant = false
            errorMessage = error.localizedDescription
        } catch {
            isSendingToAssistant = false
            errorMessage = error.localizedDescription
        }
    }

    private static func mealForCurrentTime() -> String {
        MealTiming.mealForCurrentTime()
    }
}
