import CoreImage
import UIKit
import Vision

/// Longest side Vision analyses. A 12 MP camera photo gains nothing from a
/// full-size pass for a picture that is uploaded at 800 px, and the masked
/// buffer costs memory in proportion to the input.
private let cutoutAnalysisMaxDimension: CGFloat = 1600

/// Transparent room kept around the subject on each side, as a fraction of the
/// subject's longest side, so a square crop never clips it.
let cutoutSquareMargin: CGFloat = 0.06

enum SubjectCutoutError: Error {
    case maskedImageUnavailable
}

/// Lifts the foreground subject out of `image` onto a transparent square, or
/// returns nil when Vision finds no subject. Runs the (slow) request off the
/// calling actor; real failures are thrown for the caller to report.
nonisolated func cutOutSubject(_ image: UIImage) async throws -> UIImage? {
    let source = image.preparedForSegmentation()
    guard let cgImage = source.cgImage else { throw SubjectCutoutError.maskedImageUnavailable }

    let request = GenerateForegroundInstanceMaskRequest()
    let observation: InstanceMaskObservation? = try await request.perform(on: cgImage)
    guard let observation, !observation.allInstances.isEmpty else { return nil }

    let handler = ImageRequestHandler(cgImage)
    let pixelBuffer = try observation.generateMaskedImage(
        for: observation.allInstances,
        imageFrom: handler,
        croppedToInstancesExtent: true
    )
    guard let cutout = UIImage(maskedPixelBuffer: pixelBuffer) else {
        throw SubjectCutoutError.maskedImageUnavailable
    }
    return cutout.paddedToSquare(margin: cutoutSquareMargin)
}

extension UIImage {
    /// The image upright and no larger than the analysis size, at scale 1 so
    /// points are pixels from here on.
    fileprivate nonisolated func preparedForSegmentation() -> UIImage {
        let longestSide = max(size.width, size.height)
        let factor = longestSide > cutoutAnalysisMaxDimension ? cutoutAnalysisMaxDimension / longestSide : 1
        if imageOrientation == .up, factor == 1, scale == 1 { return self }
        let target = CGSize(width: (size.width * factor).rounded(), height: (size.height * factor).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.preferredRange = .standard
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }

    /// Wraps the premultiplied BGRA buffer Vision returns, keeping its alpha.
    fileprivate nonisolated convenience init?(maskedPixelBuffer pixelBuffer: CVPixelBuffer) {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cgImage = CIContext().createCGImage(ciImage, from: ciImage.extent) else { return nil }
        self.init(cgImage: cgImage, scale: 1, orientation: .up)
    }

    /// Side of the square canvas and the origin the image is drawn at, so the
    /// image sits centred with `margin` (a fraction of its longest side) of
    /// transparent room on every side of its longest dimension.
    nonisolated static func squareCanvas(for size: CGSize, margin: CGFloat) -> (side: CGFloat, origin: CGPoint) {
        let side = (max(size.width, size.height) * (1 + 2 * margin)).rounded()
        return (side, CGPoint(x: ((side - size.width) / 2).rounded(), y: ((side - size.height) / 2).rounded()))
    }

    /// Centres the image on a transparent square with `margin` of breathing room.
    nonisolated func paddedToSquare(margin: CGFloat) -> UIImage {
        let canvas = Self.squareCanvas(for: size, margin: margin)
        let format = UIGraphicsImageRendererFormat.default()
        format.preferredRange = .standard
        format.scale = scale
        format.opaque = false
        let side = CGSize(width: canvas.side, height: canvas.side)
        return UIGraphicsImageRenderer(size: side, format: format).image { _ in
            draw(in: CGRect(origin: canvas.origin, size: size))
        }
    }
}
