import SwiftUI

extension View {
    /// Brand background behind a scroll-based screen.
    func brandScreen() -> some View {
        background(Brand.background.ignoresSafeArea())
    }

    /// Brand background behind a `Form` or `List`; rows keep the native grouped
    /// surface, which sits close to `Brand.surface`.
    func brandForm() -> some View {
        scrollContentBackground(.hidden)
            .background(Brand.background.ignoresSafeArea())
    }
}
