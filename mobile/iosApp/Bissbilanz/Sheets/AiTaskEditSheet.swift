import PhotosUI
import SwiftUI

/// Mirrors MAX_AI_TASK_PHOTOS on the server.
private let maxAiTaskPhotos = 5
/// Mirrors the description limit in the server's AI task validation.
private let maxAiTaskDescriptionLength = 2000

/// Edits an open (`pending`) AI task: description, photos, date, time and meal.
/// Completed/dismissed tasks are read-only and never reach this sheet — the
/// list only offers it while the task is still pending.
struct AiTaskEditSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AiTaskStore.self) private var aiTaskStore
    @Environment(\.dismiss) private var dismiss

    let task: AiTask
    var onSaved: (AiTask) -> Void = { _ in }

    @State private var description: String
    @State private var existingPhotoUrls: [String]
    @State private var newImages: [UIImage] = []
    @State private var taskDate: Date
    @State private var mealType: String?
    // Off means the task keeps no specific time — matches the capture sheet's
    // "off means when I sent it" convention, but here off always clears it.
    @State private var setsTime: Bool
    @State private var eatenTime: Date
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    /// The server downsizes every AI task photo to 1024px regardless — mirrors
    /// `AiTaskStore.uploadMaxDimension`/`uploadQuality`.
    private static let uploadMaxDimension: CGFloat = 1024
    private static let uploadQuality: CGFloat = 0.75

    init(task: AiTask, onSaved: @escaping (AiTask) -> Void = { _ in }) {
        self.task = task
        self.onSaved = onSaved
        _description = State(initialValue: task.description ?? "")
        _existingPhotoUrls = State(initialValue: task.photoUrls)
        _taskDate = State(initialValue: DateFormatting.date(from: task.date) ?? Date())
        _mealType = State(initialValue: task.mealType)
        let eatenDate = task.eatenAt.flatMap { DateFormatting.isoDateTime(from: $0) }
        _setsTime = State(initialValue: eatenDate != nil)
        _eatenTime = State(initialValue: eatenDate ?? Date())
    }

    /// The task's own meal type first, in case it's a custom name the fixed
    /// picker below wouldn't otherwise offer.
    private var mealTypeOptions: [String] {
        guard let existing = task.mealType, !mealTypes.contains(existing) else { return mealTypes }
        return mealTypes + [existing]
    }

    private var totalPhotoCount: Int {
        existingPhotoUrls.count + newImages.count
    }

    private var trimmedDescription: String {
        description.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The server requires a task to keep a description or at least one photo.
    private var canSave: Bool {
        !trimmedDescription.isEmpty || totalPhotoCount > 0
    }

    private var dayLabel: String {
        L10n.dayLabel(taskDate)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker(
                        L10n.date, selection: $taskDate,
                        in: DateFormatting.entryDateRange, displayedComponents: .date
                    )
                    Picker(L10n.meal, selection: $mealType) {
                        Text(L10n.aiTaskMealNone).tag(nil as String?)
                        ForEach(mealTypeOptions, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal as String?)
                        }
                    }
                    .pickerStyle(.menu)
                    Toggle(L10n.aiTaskSetTime, isOn: $setsTime)
                    if setsTime {
                        TimePickerRow(L10n.time, selection: $eatenTime, caption: dayLabel)
                    }
                } footer: {
                    if setsTime {
                        Text(L10n.aiTaskTimeOnDayHint(dayLabel))
                    }
                }

                Section(L10n.aiMealWhatDidYouEat) {
                    TextField(L10n.aiMealDescriptionPlaceholder, text: $description, axis: .vertical)
                        .lineLimit(4 ... 8)
                        .onChange(of: description) { _, newValue in
                            if newValue.count > maxAiTaskDescriptionLength {
                                description = String(newValue.prefix(maxAiTaskDescriptionLength))
                            }
                        }
                }

                Section {
                    photoAttachmentRow
                } header: {
                    Text(L10n.aiTaskPhotoSectionTitle)
                } footer: {
                    if !canSave {
                        Text(L10n.aiTaskDescriptionOrPhotoRequired)
                    }
                }
            }
            .keyboardDismissable()
            .navigationTitle(L10n.aiTaskEditTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await save() }
                    }
                    .disabled(isSaving || !canSave)
                    .fontWeight(.semibold)
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
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker(
                    onImage: { image in
                        showCamera = false
                        if totalPhotoCount < maxAiTaskPhotos { newImages.append(image) }
                    },
                    onCancel: { showCamera = false }
                )
                .ignoresSafeArea()
            }
            .onChange(of: selectedPhotoItems) { _, items in
                guard !items.isEmpty else { return }
                loadPhotos(items)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var photoAttachmentRow: some View {
        if !existingPhotoUrls.isEmpty || !newImages.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(existingPhotoUrls.enumerated()), id: \.offset) { index, url in
                        ZStack(alignment: .topTrailing) {
                            FoodImageView(imageUrl: url)
                                .frame(width: 80, height: 80)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .accessibilityHidden(true)
                            Button {
                                existingPhotoUrls.remove(at: index)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.white, .black.opacity(0.5))
                            }
                            .buttonStyle(.plain)
                            .padding(4)
                            .accessibilityLabel(L10n.removePhoto)
                        }
                    }
                    ForEach(Array(newImages.enumerated()), id: \.offset) { index, image in
                        ZStack(alignment: .topTrailing) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 80, height: 80)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .clipped()
                                .accessibilityHidden(true)
                            Button {
                                newImages.remove(at: index)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.white, .black.opacity(0.5))
                            }
                            .buttonStyle(.plain)
                            .padding(4)
                            .accessibilityLabel(L10n.removePhoto)
                        }
                    }
                }
            }
        }

        if totalPhotoCount < maxAiTaskPhotos {
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
                    maxSelectionCount: maxAiTaskPhotos - totalPhotoCount,
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

    private func loadPhotos(_ items: [PhotosPickerItem]) {
        Task {
            var loaded: [UIImage] = []
            for item in items {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data)
                else { continue }
                loaded.append(image)
            }
            let room = maxAiTaskPhotos - totalPhotoCount
            newImages.append(contentsOf: loaded.prefix(room))
            // The picker keeps its selection, so clearing it is what lets the
            // same photo be picked again after a removal.
            selectedPhotoItems = []
        }
    }

    private func save() async {
        guard canSave else { return }
        isSaving = true
        do {
            let uploadedUrls = try await uploadNewPhotos()
            var update = AiTaskUpdate(
                photoUrls: existingPhotoUrls + uploadedUrls, date: taskDate.isoDateString
            )
            // Always sent, never omitted: an emptied description has to reach
            // the server as an explicit null, matching `EntryEditSheet.notes`.
            let storedDescription: String? = trimmedDescription.isEmpty ? nil : trimmedDescription
            update.description = .some(storedDescription)
            update.mealType = .some(mealType)
            update.eatenAt = eatenAtPatchValue()
            let updated = try await aiTaskStore.update(id: task.id, update)
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func uploadNewPhotos() async throws -> [String] {
        guard !newImages.isEmpty else { return [] }
        let maxDimension = Self.uploadMaxDimension
        let quality = Self.uploadQuality
        let encoded = newImages.compactMap { $0.downscaledJPEGData(maxDimension: maxDimension, quality: quality) }
        return try await api.uploadAiTaskPhotos(
            encoded.enumerated().map { (data: $0.element, filename: "task_\($0.offset).jpg") }
        )
    }

    /// `.some(nil)` clears `eatenAt`; `.some(value)` sets it. Plain `nil` (time
    /// stays on but the components can't be combined) leaves it untouched
    /// rather than guessing, mirroring `EntryEditSheet.eatenAtString()`.
    private func eatenAtPatchValue() -> String?? {
        guard setsTime else { return .some(nil) }
        guard let value = DateFormatting.eatenAtString(time: eatenTime, on: taskDate) else { return nil }
        return .some(value)
    }
}
