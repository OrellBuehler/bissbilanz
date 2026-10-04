import PhotosUI
import SwiftUI

/// Longest side of an uploaded step photo. The server keeps a `recipe_step`
/// upload's aspect ratio and only shrinks it to 1280 px (`RECIPE_STEP_MAX_DIM`),
/// so sending more than that would just be thrown away.
private let maxStepPhotoDimension: CGFloat = 1280
private let stepPhotoQuality: CGFloat = 0.85

/// The optional photo of one recipe step in the editor: a thumbnail with a
/// remove button, and one menu offering the camera (where there is one) and the
/// photo library.
///
/// Unlike `FoodImageField` there is no square crop — a step photo is shown
/// whole in cooking mode. A picked photo goes through `PhotoReviewSheet` (a
/// look at the whole picture and the "Remove background" switch), then is
/// stored the way a food's is: uploaded with `purpose=recipe_step` when signed in, written
/// into `LocalImageStore` as a `file://` URL in Local mode (which is what lets
/// `LocalDataMigrator` re-upload it on sign-in). The new URL, or nil once the
/// photo is removed, goes out through `onChange`; the field holds no copy of it,
/// so a step that was deleted or moved while an upload was in flight can never
/// be written to through a stale binding.
struct RecipeStepPhotoField: View {
    let imageUrl: String?
    let stepNumber: Int
    let onChange: (String?) -> Void

    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appMode
    @Environment(FoodImageLoader.self) private var imageLoader

    @State private var photoItem: PhotosPickerItem?
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var reviewCandidate: ReviewCandidate?
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isSaving || imageUrl != nil {
                thumbnail
            }

            Menu {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button {
                        showCamera = true
                    } label: {
                        Label(L10n.takePhoto, systemImage: "camera")
                    }
                }
                Button {
                    showLibrary = true
                } label: {
                    Label(L10n.choosePhoto, systemImage: "photo.on.rectangle")
                }
            } label: {
                Label(
                    imageUrl == nil ? L10n.recipeStepAddPhoto : L10n.recipeStepReplacePhoto,
                    systemImage: "photo.badge.plus"
                )
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isSaving)
            .accessibilityHint(L10n.recipeStepNumber(stepNumber))

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .photosPicker(isPresented: $showLibrary, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await loadFromLibrary(item) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(
                onImage: { image in
                    showCamera = false
                    reviewCandidate = ReviewCandidate(image: image.uprightened())
                },
                onCancel: { showCamera = false }
            )
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $reviewCandidate) { candidate in
            PhotoReviewSheet(
                image: candidate.image,
                onCancel: { reviewCandidate = nil },
                onConfirm: { photo, transparent in
                    reviewCandidate = nil
                    Task { await store(photo, transparent: transparent) }
                }
            )
        }
    }

    /// Fitted, not filled: the photo keeps the framing it was taken with.
    private var thumbnail: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.tertiarySystemFill))
                if isSaving {
                    ProgressView()
                } else {
                    FoodImageView(imageUrl: imageUrl, contentMode: .fit)
                }
            }
            .frame(maxWidth: 240, minHeight: 96, maxHeight: 160)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if imageUrl != nil, !isSaving {
                Button(role: .destructive) {
                    onChange(nil)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white, .black.opacity(0.5))
                        // Same 44pt target as `FoodImageField`'s remove button.
                        .frame(width: 44, height: 44, alignment: .topTrailing)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.removePhoto)
                .accessibilityHint(L10n.recipeStepNumber(stepNumber))
                .padding(4)
            }
        }
        .frame(maxWidth: 240)
    }

    private func loadFromLibrary(_ item: PhotosPickerItem) async {
        photoItem = nil
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data)
        else {
            errorMessage = L10n.photoSaveFailed
            return
        }
        reviewCandidate = ReviewCandidate(image: image.uprightened())
    }

    private func store(_ image: UIImage, transparent: Bool) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        guard let photo = image.downscaledEncodedPhoto(
            maxDimension: maxStepPhotoDimension, quality: stepPhotoQuality, transparent: transparent
        ) else {
            errorMessage = L10n.photoSaveFailed
            return
        }
        let data = photo.data

        if appMode.isLocal {
            guard let url = LocalImageStore.writeLocalPhoto(data, fileExtension: photo.fileExtension) else {
                errorMessage = L10n.photoSaveFailed
                return
            }
            onChange(url)
            return
        }

        do {
            let url = try await api.uploadImage(data, filename: photo.filename, purpose: "recipe_step")
            // Seed the cache with the bytes already in hand so the thumbnail
            // (and cooking mode, offline) needs no round trip.
            imageLoader.seed(data, for: url)
            onChange(url)
        } catch {
            ErrorReporter.captureWarning(
                "Recipe step photo upload failed",
                context: ["reason": ErrorReporter.reason(for: error)]
            )
            errorMessage = L10n.photoSaveFailed
        }
    }
}

/// `fullScreenCover(item:)` needs an Identifiable, and UIImage is not one.
private struct ReviewCandidate: Identifiable {
    let id = UUID()
    let image: UIImage
}
