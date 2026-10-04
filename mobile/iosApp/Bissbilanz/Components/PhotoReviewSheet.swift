import SwiftUI

/// A last look at a picked photo before it is stored: the whole picture, fitted
/// inside the screen, with the "Remove background" switch. Unlike
/// `ImageCropSheet` there is no crop — a recipe step photo keeps the framing it
/// was taken with.
struct PhotoReviewSheet: View {
    let onCancel: () -> Void
    /// The photo to store, and whether it is a transparent cut-out (PNG)
    /// rather than a plain photo (JPEG).
    let onConfirm: (UIImage, Bool) -> Void

    @State private var removal: BackgroundRemoval

    init(image: UIImage, onCancel: @escaping () -> Void, onConfirm: @escaping (UIImage, Bool) -> Void) {
        _removal = State(initialValue: BackgroundRemoval(original: image))
        self.onCancel = onCancel
        self.onConfirm = onConfirm
    }

    var body: some View {
        NavigationStack {
            ZStack {
                if removal.isShowingCutout {
                    CutoutCheckerboard()
                } else {
                    Color.black
                }
                Image(uiImage: removal.displayed)
                    .resizable()
                    .scaledToFit()
                    .padding(16)
                    .accessibilityHidden(true)
                if removal.isWorking {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                        .padding(20)
                        .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            .overlay(alignment: .bottom) {
                VStack(spacing: 8) {
                    BackgroundRemovalMessage(removal: removal)
                    BackgroundRemovalToggle(removal: removal)
                }
                .padding(.bottom, 16)
            }
            .background(Color.black)
            .navigationTitle(L10n.reviewPhoto)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel, action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.useThisPhoto) {
                        onConfirm(removal.displayed, removal.isShowingCutout)
                    }
                    .disabled(removal.isWorking)
                }
            }
        }
    }
}
