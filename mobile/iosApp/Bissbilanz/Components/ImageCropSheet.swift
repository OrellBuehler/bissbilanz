import SwiftUI

/// Gap between the crop square and the screen edges, so the frame and the
/// dimmed photo beside it stay visible, not only above and below.
private let cropWindowInset: CGFloat = 16

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
                let window = min(geometry.size.width, geometry.size.height) - 2 * cropWindowInset
                // Scale that makes the photo cover the square window, so there
                // is never a gap inside the crop area at rest.
                let baseScale = max(window / image.size.width, window / image.size.height)

                ZStack {
                    Color.black
                    // Unclipped, so the part of the photo that falls outside
                    // the square stays visible under the dimming — the user
                    // sees what they are cutting away, not just what remains.
                    Image(uiImage: image)
                        .resizable()
                        .frame(
                            width: image.size.width * baseScale,
                            height: image.size.height * baseScale
                        )
                        .scaleEffect(scale)
                        .offset(offset)
                        .frame(width: window, height: window)
                    CropDimming(window: window)
                        .fill(Color.black.opacity(0.6), style: FillStyle(eoFill: true))
                        .allowsHitTesting(false)
                    CropGrid()
                        .stroke(Color.white.opacity(0.35), lineWidth: 0.5)
                        .frame(width: window, height: window)
                        .allowsHitTesting(false)
                    Rectangle()
                        .stroke(Color.white, lineWidth: 1.5)
                        .frame(width: window, height: window)
                        .allowsHitTesting(false)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                // The whole screen takes the gesture, dimmed area included,
                // so a pan that starts outside the square still moves it.
                .contentShape(Rectangle())
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
                .overlay(alignment: .bottom) {
                    Label(L10n.cropPhotoHint, systemImage: "hand.draw")
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.6), in: Capsule())
                        .padding(.bottom, 16)
                        .allowsHitTesting(false)
                }
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

/// Everything but the centred crop square, filled even-odd so the square
/// itself stays clear.
private struct CropDimming: Shape {
    let window: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path(rect)
        path.addRect(CGRect(
            x: rect.midX - window / 2,
            y: rect.midY - window / 2,
            width: window,
            height: window
        ))
        return path
    }
}

/// Rule-of-thirds guides, the same the Photos crop tool draws.
private struct CropGrid: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        for i in 1 ... 2 {
            let x = rect.minX + rect.width * CGFloat(i) / 3
            let y = rect.minY + rect.height * CGFloat(i) / 3
            path.move(to: CGPoint(x: x, y: rect.minY))
            path.addLine(to: CGPoint(x: x, y: rect.maxY))
            path.move(to: CGPoint(x: rect.minX, y: y))
            path.addLine(to: CGPoint(x: rect.maxX, y: y))
        }
        return path
    }
}
