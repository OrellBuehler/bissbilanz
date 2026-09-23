import PhotosUI
import SwiftUI

/// The server thumbnails to 512×512 (`THUMBNAIL_MAX_DIM`), so 800 px leaves
/// headroom for a future retina bump while staying below the 1024 px the
/// AI-task path uploads (`AiTaskStore.uploadMaxDimension`, matching the
/// server's `AI_PHOTO_MAX_DIM`) — that one has to stay legible enough for a
/// model to read a label, this one only has to fill a thumbnail.
private let maxUploadDimension: CGFloat = 800
private let uploadQuality: CGFloat = 0.85

/// Side of the preview square: large enough to judge the photo at a glance,
/// and it gives the section something to sit against while it is still empty.
private let previewSize: CGFloat = 96

/// The image row of the food form: shows the current photo, and offers camera,
/// library and removal. Everything from capture through square crop, downscale
/// and upload happens here; `imageUrl` receives the URL to store on the food
/// (nil once the user removes the image).
struct FoodImageField: View {
    @Binding var imageUrl: String?

    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appMode
    @Environment(FoodImageLoader.self) private var imageLoader

    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var cropCandidate: CropCandidate?
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            preview
            actionRow

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(.vertical, 4)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await loadFromLibrary(item) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(
                onImage: { image in
                    showCamera = false
                    cropCandidate = CropCandidate(image: image.uprightened())
                },
                onCancel: { showCamera = false }
            )
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $cropCandidate) { candidate in
            ImageCropSheet(
                image: candidate.image,
                onCancel: { cropCandidate = nil },
                onCropped: { cropped in
                    cropCandidate = nil
                    Task { await store(cropped) }
                }
            )
        }
    }

    /// The photo, or — while there is none — a placeholder square, so the row
    /// reads as a photo slot rather than as empty space with two controls
    /// adrift in it. Removal sits on the corner of the picture it removes:
    /// as a text link below it was read as a caption, not as an action.
    private var preview: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.tertiarySystemFill))

                if isSaving {
                    ProgressView()
                } else if imageUrl == nil {
                    Image(systemName: "photo")
                        .font(.system(size: 30))
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                } else {
                    FoodImageView(imageUrl: imageUrl)
                }
            }
            .frame(width: previewSize, height: previewSize)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if imageUrl != nil, !isSaving {
                Button(role: .destructive) {
                    imageUrl = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white, .black.opacity(0.5))
                        // The glyph on its own is a ~22pt target, half of what
                        // a finger needs. The box behind it grows inwards from
                        // the corner, so the icon stays where it is drawn and
                        // the corner still takes a thumb.
                        .frame(width: 44, height: 44, alignment: .topTrailing)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.removePhoto)
                .padding(4)
            }
        }
    }

    /// Two equal, titled buttons filling the width — the same pair the AI meal
    /// sheet offers. Once a photo is attached they replace it.
    ///
    /// Both labels fill the row's height, so when the longer title ("Choose
    /// Photo" at larger text sizes, longer still in German) wraps, the other
    /// button grows with it instead of sitting a line shorter beside it.
    private var actionRow: some View {
        HStack(spacing: 12) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button {
                    showCamera = true
                } label: {
                    Label(L10n.takePhoto, systemImage: "camera")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isSaving)
            }

            // Titled rather than icon-only: `LabelStyle.iconOnly` is not an
            // option here anyway, because the PhotosPicker label closure is
            // @Sendable and that style is main-actor isolated in the iOS 18
            // SDK, so referencing it fails to compile (the CodeQL job builds
            // against that SDK even though the newer one the build job uses
            // accepts it).
            PhotosPicker(selection: $photoItem, matching: .images) {
                Label(L10n.choosePhoto, systemImage: "photo.on.rectangle")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(isSaving)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func loadFromLibrary(_ item: PhotosPickerItem) async {
        photoItem = nil
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data)
        else {
            errorMessage = L10n.photoSaveFailed
            return
        }
        cropCandidate = CropCandidate(image: image.uprightened())
    }

    /// In Local mode there is no server, so the JPEG is written into
    /// `LocalImageStore` and referenced by a `file://` URL — the same shape the
    /// account downgrade produces, which is what lets `LocalDataMigrator`
    /// re-upload it if the user later signs in.
    private func store(_ cropped: UIImage) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        guard let data = cropped.downscaledJPEGData(
            maxDimension: maxUploadDimension, quality: uploadQuality
        ) else {
            errorMessage = L10n.photoSaveFailed
            return
        }

        if appMode.isLocal {
            guard let url = LocalImageStore.writeLocalPhoto(data) else {
                errorMessage = L10n.photoSaveFailed
                return
            }
            imageUrl = url
            return
        }

        do {
            let url = try await api.uploadImage(data)
            // Seed the cache with the bytes we already hold, so the image
            // renders straight away instead of after a round trip.
            imageLoader.seed(data, for: url)
            imageUrl = url
        } catch {
            ErrorReporter.captureWarning("Food image upload failed", context: ["reason": ErrorReporter.reason(for: error)])
            errorMessage = L10n.photoSaveFailed
        }
    }
}

/// `fullScreenCover(item:)` needs an Identifiable, and UIImage is not one.
private struct CropCandidate: Identifiable {
    let id = UUID()
    let image: UIImage
}
