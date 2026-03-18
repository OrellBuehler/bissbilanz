import SwiftUI

struct ToastModifier: ViewModifier {
    @Binding var message: String?
    var duration: TimeInterval = 2.0

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let message {
                    Text(message)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
                        .padding(.bottom, 80)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .onAppear {
                            Task {
                                try? await Task.sleep(for: .seconds(duration))
                                withAnimation(.easeOut(duration: 0.3)) { self.message = nil }
                            }
                        }
                }
            }
            .animation(.spring(duration: 0.3), value: message)
    }
}

extension View {
    func toast(message: Binding<String?>, duration: TimeInterval = 2.0) -> some View {
        modifier(ToastModifier(message: message, duration: duration))
    }
}
