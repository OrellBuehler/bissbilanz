import SwiftUI

/// The "Remove background" state shared by the square cropper and the step
/// photo review sheet: the original photo, the cut-out once it exists, and
/// whether the cut-out is the one being shown.
///
/// The cut-out is computed on first use and kept, so flipping the switch back
/// and forth costs nothing after the first time.
@MainActor
@Observable
final class BackgroundRemoval {
    let original: UIImage
    private(set) var cutout: UIImage?
    private(set) var isShowingCutout = false
    private(set) var isWorking = false
    private(set) var message: String?

    init(original: UIImage) {
        self.original = original
    }

    var displayed: UIImage {
        isShowingCutout ? (cutout ?? original) : original
    }

    func setShowingCutout(_ show: Bool) async {
        message = nil
        guard show else {
            isShowingCutout = false
            return
        }
        if cutout != nil {
            isShowingCutout = true
            return
        }
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            guard let result = try await cutOutSubject(original) else {
                message = L10n.noSubjectFound
                return
            }
            cutout = result
            isShowingCutout = true
        } catch {
            ErrorReporter.captureWarning(
                "Subject cutout failed", context: ["reason": ErrorReporter.reason(for: error)]
            )
            message = L10n.removeBackgroundFailed
        }
    }
}

/// The switch itself, on a dark capsule so it reads over a photo.
struct BackgroundRemovalToggle: View {
    let removal: BackgroundRemoval

    var body: some View {
        Toggle(isOn: Binding(
            get: { removal.isWorking || removal.isShowingCutout },
            set: { show in Task { await removal.setShowingCutout(show) } }
        )) {
            Label(L10n.removeBackground, systemImage: "wand.and.stars")
                .font(.subheadline)
                .foregroundStyle(.white)
        }
        .fixedSize()
        .disabled(removal.isWorking)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.black.opacity(0.6), in: Capsule())
    }
}

/// The "No subject found" / failure line under the switch.
struct BackgroundRemovalMessage: View {
    let removal: BackgroundRemoval

    var body: some View {
        if let message = removal.message {
            Text(message)
                .font(.footnote)
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.black.opacity(0.6), in: Capsule())
                .allowsHitTesting(false)
        }
    }
}

/// A neutral checkerboard, the usual way to show that an image is transparent.
/// Dark greys, so it works under the white controls in both appearances.
struct CutoutCheckerboard: View {
    private let cell: CGFloat = 12

    var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(white: 0.24)))
            let columns = Int((size.width / cell).rounded(.up))
            let rows = Int((size.height / cell).rounded(.up))
            var light = Path()
            for row in 0 ..< rows {
                for column in 0 ..< columns where (row + column).isMultiple(of: 2) {
                    light.addRect(CGRect(
                        x: CGFloat(column) * cell, y: CGFloat(row) * cell, width: cell, height: cell
                    ))
                }
            }
            context.fill(light, with: .color(Color(white: 0.32)))
        }
        .accessibilityHidden(true)
    }
}
