import SwiftUI
import TipKit

extension DashboardView {
    // MARK: - Empty State

    var emptyState: some View {
        ContentUnavailableView {
            Label(L10n.noEntriesYet, systemImage: "fork.knife.circle")
        } description: {
            Text(L10n.tapToAdd)
        } actions: {
            if !selectedDate.isToday {
                Button(L10n.copyYesterday) {
                    showCopyConfirmation = true
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 24)
    }

    /// Shown when the live entries refresh failed and the local store is empty,
    /// so a swallowed network error isn't mistaken for a day with no food. The
    /// Retry button re-runs `loadData` directly — a reliable refresh path that
    /// doesn't depend on the pull-to-refresh gesture.
    var refreshErrorState: some View {
        ContentUnavailableView {
            Label(L10n.somethingWentWrong, systemImage: "wifi.exclamationmark")
        } description: {
            Text(L10n.couldNotRefresh)
        } actions: {
            Button(L10n.retry) {
                Task { await loadData() }
            }
            .buttonStyle(.bordered)
        }
        .padding(.vertical, 24)
    }

    // MARK: - FAB

    /// One glass button that opens a system menu with the four ways to log.
    /// Items are declared most-common-first; the menu flips them so the first
    /// sits nearest the thumb when anchored at the bottom of the screen.
    var fab: some View {
        FloatingControlGroup {
            Menu {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    showFoodSearch = true
                } label: {
                    Label(L10n.searchFood, systemImage: "magnifyingglass")
                }
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showQuickEntry = true
                } label: {
                    Label(L10n.quickEntry, systemImage: "bolt")
                }
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    scanningTip.invalidate(reason: .actionPerformed)
                    showScanner = true
                } label: {
                    Label(L10n.scanBarcode, systemImage: "barcode.viewfinder")
                }
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showAIMeal = true
                } label: {
                    Label(L10n.aiMealEstimate, systemImage: "sparkles")
                }
            } label: {
                Image(systemName: "plus")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
            }
            .buttonStyle(.plain)
            .circularGlassBackground(tint: MacroColors.calories)
            .accessibilityLabel(L10n.addFood)
            .popoverTip(scanningTip) { action in
                guard action.id == "learn_more" else { return }
                scanningTip.invalidate(reason: .actionPerformed)
                showHelp(for: .scanning)
            }
            .padding()
        }
    }

    func showHelp(for slug: HelpSlug) {
        tipHelpSlug = slug
        showTipHelp = true
    }
}
