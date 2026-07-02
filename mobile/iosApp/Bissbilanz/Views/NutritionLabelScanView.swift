import PhotosUI
import SwiftUI

/// Captures or picks a photo of a nutrition-facts panel, runs on-device OCR,
/// and hands the parsed values back for confirmation in `FoodEditSheet`.
///
/// A library photo needs no camera permission (`PhotosPicker` is out of
/// process); the camera path reuses the existing `NSCameraUsageDescription`.
struct NutritionLabelScanView: View {
    @Environment(\.dismiss) private var dismiss
    let onParsed: (ParsedNutrition) -> Void

    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var isProcessing = false
    @State private var errorMessage: String?

    private let scanner = NutritionLabelScanner()

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "doc.text.viewfinder")
                    .font(.system(size: 56))
                    .foregroundStyle(.secondary)

                VStack(spacing: 6) {
                    Text(L10n.scanLabel)
                        .font(.headline)
                    Text(L10n.scanLabelHint)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if isProcessing {
                    ProgressView(L10n.scanningLabel)
                        .padding(.top, 8)
                } else {
                    VStack(spacing: 12) {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button {
                                showCamera = true
                            } label: {
                                Label(L10n.takePhoto, systemImage: "camera")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                        }

                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Label(L10n.choosePhoto, systemImage: "photo.on.rectangle")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.horizontal, 40)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Spacer()
            }
            .padding()
            .navigationTitle(L10n.scanLabel)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker(
                    onImage: { image in
                        showCamera = false
                        process(image)
                    },
                    onCancel: { showCamera = false }
                )
                .ignoresSafeArea()
            }
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                loadPhoto(item)
            }
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem) {
        isProcessing = true
        errorMessage = nil
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data)
            else {
                fail(L10n.scanLabelFailed)
                return
            }
            process(image)
        }
    }

    private func process(_ image: UIImage) {
        isProcessing = true
        errorMessage = nil
        guard let data = image.uprightImageData() else {
            fail(L10n.scanLabelFailed)
            return
        }
        Task {
            do {
                let parsed = try await scanner.scan(data)
                if parsed.isEmpty {
                    fail(L10n.scanLabelNoData)
                } else {
                    onParsed(parsed)
                    dismiss()
                }
            } catch {
                fail(L10n.scanLabelFailed)
            }
        }
    }

    private func fail(_ message: String) {
        errorMessage = message
        isProcessing = false
        photoItem = nil
    }
}

private extension UIImage {
    /// Re-encodes the image with an upright (.up) orientation so Vision reads
    /// text the right way up regardless of how the photo was taken.
    func uprightImageData() -> Data? {
        if imageOrientation == .up {
            return jpegData(compressionQuality: 0.9)
        }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        let upright = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
        return upright.jpegData(compressionQuality: 0.9)
    }
}
