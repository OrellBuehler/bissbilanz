import SwiftUI

/// Square pan-and-zoom cropper.
///
/// The crop is locked to 1:1 because the server resizes uploads to 400×400 with
/// `fit: 'cover'` — a free-form crop would be silently re-cropped there and the
/// user's framing would not survive. Locking the ratio makes what they see what
/// they get. The Android `ImageCropDialog` is the same interaction.
struct ImageCropSheet: View {
    let image: UIImage
    let onCancel: () -> Void
    let onCropped: (UIImage) -> Void

    @State private var scale: CGFloat = 1
    @State private var committedScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                let window = min(geometry.size.width, geometry.size.height)
                // Scale that makes the photo cover the square window, so there
                // is never a gap inside the crop area at rest.
                let baseScale = max(window / image.size.width, window / image.size.height)

                ZStack {
                    Color.black.ignoresSafeArea()
                    Image(uiImage: image)
                        .resizable()
                        .frame(
                            width: image.size.width * baseScale,
                            height: image.size.height * baseScale
                        )
                        .scaleEffect(scale)
                        .offset(offset)
                        .frame(width: window, height: window)
                        .clipped()
                        .gesture(
                            SimultaneousGesture(
                                MagnifyGesture()
                                    .onChanged { value in
                                        scale = min(max(committedScale * value.magnification, 1), 6)
                                        offset = clamped(offset, window: window, baseScale: baseScale)
                                    }
                                    .onEnded { _ in
                                        committedScale = scale
                                        committedOffset = offset
                                    },
                                DragGesture()
                                    .onChanged { value in
                                        offset = clamped(
                                            CGSize(
                                                width: committedOffset.width + value.translation.width,
                                                height: committedOffset.height + value.translation.height
                                            ),
                                            window: window,
                                            baseScale: baseScale
                                        )
                                    }
                                    .onEnded { _ in committedOffset = offset }
                            )
                        )
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(L10n.cancel, action: onCancel)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L10n.useThisPhoto) {
                            onCropped(crop(window: window, baseScale: baseScale))
                        }
                    }
                }
            }
            .background(Color.black)
            .navigationTitle(L10n.cropPhoto)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    /// Keeps the crop window inside the photo, so the square never shows a gap.
    private func clamped(_ value: CGSize, window: CGFloat, baseScale: CGFloat) -> CGSize {
        let width = image.size.width * baseScale * scale
        let height = image.size.height * baseScale * scale
        let maxX = max(0, (width - window) / 2)
        let maxY = max(0, (height - window) / 2)
        return CGSize(
            width: min(max(value.width, -maxX), maxX),
            height: min(max(value.height, -maxY), maxY)
        )
    }

    /// Maps the on-screen crop window back into image coordinates: the photo is
    /// drawn centred at `baseScale * scale` and shifted by the pan offset, so
    /// the window's origin in image space is the half-difference of the two
    /// sizes, minus the offset, divided by the total scale.
    private func crop(window: CGFloat, baseScale: CGFloat) -> UIImage {
        guard let cgImage = image.cgImage else { return image }
        let total = baseScale * scale
        let pixelWidth = CGFloat(cgImage.width)
        let pixelHeight = CGFloat(cgImage.height)
        // `image.size` is in points; the CGImage is in pixels.
        let pixelScale = pixelWidth / image.size.width

        let side = (window / total) * pixelScale
        let left = ((image.size.width * total - window) / 2 - offset.width) / total * pixelScale
        let top = ((image.size.height * total - window) / 2 - offset.height) / total * pixelScale

        let size = min(side, min(pixelWidth, pixelHeight)).rounded(.down)
        let rect = CGRect(
            x: min(max(left, 0), pixelWidth - size).rounded(.down),
            y: min(max(top, 0), pixelHeight - size).rounded(.down),
            width: size,
            height: size
        )
        guard size >= 1, let cropped = cgImage.cropping(to: rect) else { return image }
        return UIImage(cgImage: cropped, scale: image.scale, orientation: image.imageOrientation)
    }
}
