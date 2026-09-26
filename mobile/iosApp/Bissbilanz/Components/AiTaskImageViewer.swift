import SwiftUI

/// Full-screen viewer for an AI task's photos, opened from `AiTaskRow` so the
/// user can check a photo against what the assistant read from it. Swipeable
/// between photos; pinch to zoom the one on screen.
///
/// Images load through `FoodImageView`/`FoodImageLoader` — the same
/// authenticated, cache-first path food and recipe photos use — rather than a
/// bare `AsyncImage`, since the server requires either a session cookie (web)
/// or the account's bearer token (mobile) to serve an `/uploads/…` file.
struct AiTaskImageViewer: View {
    let imageUrls: [String]
    let onDismiss: () -> Void

    @State private var selectedIndex: Int

    init(imageUrls: [String], initialIndex: Int, onDismiss: @escaping () -> Void) {
        self.imageUrls = imageUrls
        self.onDismiss = onDismiss
        _selectedIndex = State(initialValue: initialIndex)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            TabView(selection: $selectedIndex) {
                ForEach(Array(imageUrls.enumerated()), id: \.offset) { index, url in
                    ZoomableTaskImage(imageUrl: url)
                        .tag(index)
                        .accessibilityLabel(L10n.aiTasksPhotoIndex(index + 1, imageUrls.count))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: imageUrls.count > 1 ? .always : .never))
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.black.opacity(0.55), in: Circle())
            }
            .padding()
            .accessibilityLabel(L10n.close)
        }
        .statusBarHidden()
    }
}

/// One photo, pinch-zoomable up to 4x and reset by a double tap.
///
/// Panning while zoomed is intentionally left out: a single-finger drag on
/// top of the page view would compete with its own swipe-between-photos
/// gesture, and pinch plus double-tap-to-reset already covers "zoom in to
/// check a detail" without that conflict.
private struct ZoomableTaskImage: View {
    let imageUrl: String

    @State private var scale: CGFloat = 1
    @State private var committedScale: CGFloat = 1

    var body: some View {
        FoodImageView(imageUrl: imageUrl, contentMode: .fit)
            .scaleEffect(scale)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        scale = min(max(committedScale * value.magnification, 1), 4)
                    }
                    .onEnded { _ in
                        committedScale = scale
                    }
            )
            .onTapGesture(count: 2) {
                let target: CGFloat = scale > 1 ? 1 : 2.5
                withAnimation(.spring(response: 0.3)) {
                    scale = target
                }
                committedScale = target
            }
    }
}
