import PhotosUI
import SwiftUI

/// The server thumbnails to 400×400, so 800 px leaves headroom for a future
/// retina bump while roughly quartering the upload against the AI-task path
/// (which needs 1600 px only because a model has to read a label).
private let maxUploadDimension: CGFloat = 800
private let uploadQuality: CGFloat = 0.85

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
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                ZStack {
                    if isSaving {
                        ProgressView()
                    } else {
                        FoodImageView(imageUrl: imageUrl)
                    }
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button {
                                showCamera = true
                            } label: {
                                Image(systemName: "camera")
                            }
                            .buttonStyle(.bordered)
                            .accessibilityLabel(L10n.takePhoto)
                            .disabled(isSaving)
                        }

                        // A bare Image rather than an icon-only Label: the
                        // PhotosPicker label closure is @Sendable, and
                        // `LabelStyle.iconOnly` is main-actor isolated in the
                        // iOS 18 SDK, so referencing it there fails to compile
                        // (the CodeQL job builds against that SDK even though
                        // the newer one the build job uses accepts it).
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Image(systemName: "photo.on.rectangle")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityLabel(L10n.choosePhoto)
                        .disabled(isSaving)
                    }

                    if imageUrl != nil, !isSaving {
                        Button(L10n.removePhoto, role: .destructive) {
                            imageUrl = nil
                        }
                        .font(.caption)
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
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
            errorMessage = L10n.photoSaveFailed
        }
    }
}

/// `fullScreenCover(item:)` needs an Identifiable, and UIImage is not one.
private struct CropCandidate: Identifiable {
    let id = UUID()
    let image: UIImage
}
