import SwiftUI

extension View {
    /// Finishing touches every native data-entry form gets: a "Done" button
    /// above the keyboard (decimal and number pads have no return key, so this
    /// is the only way to dismiss them) plus interactive swipe-to-dismiss while
    /// scrolling the form. Attach to the `Form`/`List` of an editing sheet.
    func keyboardDismissable() -> some View {
        scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(L10n.done) {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil,
                            from: nil,
                            for: nil
                        )
                    }
                    .fontWeight(.semibold)
                }
            }
    }
}
