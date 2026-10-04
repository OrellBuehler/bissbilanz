import SwiftUI
import UIKit

/// Minimal still-photo camera capture, shared by every feature that needs a
/// live photo (nutrition label scanning, AI meal task photos). `PhotosPicker`
/// covers the library; this covers live capture, which `PhotosPicker` cannot do.
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIImagePickerController, context _: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onImage: onImage, onCancel: onCancel)
    }

    @MainActor
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let onImage: (UIImage) -> Void
        private let onCancel: () -> Void

        init(onImage: @escaping (UIImage) -> Void, onCancel: @escaping () -> Void) {
            self.onImage = onImage
            self.onCancel = onCancel
        }

        func imagePickerController(
            _: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                onImage(image)
            } else {
                onCancel()
            }
        }

        func imagePickerControllerDidCancel(_: UIImagePickerController) {
            onCancel()
        }
    }
}

extension UIImage {
    /// Re-encodes the image upright (fixing camera-capture orientation, same
    /// approach as `NutritionLabelScanView.uprightImageData()`) and downscaled
    /// to at most `maxDimension` on the longest side, so a full-resolution
    /// photo doesn't balloon the upload for a task the assistant only needs to
    /// glance at.
    /// Redraws the image with `.up` orientation. `CGImage` ignores EXIF
    /// orientation, so anything that works in pixel space — cropping, above all
    /// — sees a rotated photo unless it is normalized first.
    func uprightened() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }

    func downscaledJPEGData(maxDimension: CGFloat, quality: CGFloat) -> Data? {
        downscaledRendering(maxDimension: maxDimension, opaque: true).jpegData(compressionQuality: quality)
    }

    /// Same downscale as `downscaledJPEGData`, but lossless and with the
    /// alpha channel kept, for a cut-out whose transparent surroundings JPEG
    /// would turn black.
    func downscaledPNGData(maxDimension: CGFloat) -> Data? {
        downscaledRendering(maxDimension: maxDimension, opaque: false).pngData()
    }

    /// PNG when the photo carries a transparent cut-out, JPEG otherwise.
    /// Decided by the caller rather than sniffed from the pixels: every image
    /// redrawn through a renderer has an alpha channel, opaque or not.
    func downscaledEncodedPhoto(maxDimension: CGFloat, quality: CGFloat, transparent: Bool) -> EncodedPhoto? {
        if transparent {
            return downscaledPNGData(maxDimension: maxDimension).map { EncodedPhoto(data: $0, isPNG: true) }
        }
        return downscaledJPEGData(maxDimension: maxDimension, quality: quality)
            .map { EncodedPhoto(data: $0, isPNG: false) }
    }

    private func downscaledRendering(maxDimension: CGFloat, opaque: Bool) -> UIImage {
        let longestSide = max(size.width, size.height)
        let scale = longestSide > maxDimension ? maxDimension / longestSide : 1
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = opaque
        return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}

/// An encoded photo plus the filename and MIME type its upload needs.
struct EncodedPhoto {
    let data: Data
    let isPNG: Bool

    var fileExtension: String { isPNG ? "png" : "jpg" }
    var filename: String { "food.\(fileExtension)" }
}
