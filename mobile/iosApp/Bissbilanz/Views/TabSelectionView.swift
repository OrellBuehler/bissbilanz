import SwiftUI

/// The tab bar editor: the tabs between Home and Settings in the order the
/// bar shows them (drag to reorder, minus to remove), the screens that can
/// still be added, and the tab the app opens on. A `List` pinned into edit
/// mode for the grip handles, as in `DashboardLayoutView`. The rules live in
/// `TabBarLayout`.
struct TabSelectionView: View {
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(TabBarLayout.storageKey) private var selectedTabsRaw: String = TabBarLayout.defaultRaw
    @AppStorage(TabBarLayout.landingStorageKey) private var landingTabRaw: String = TabBarLayout.homeId

    private var layout: TabBarLayout {
        TabBarLayout(raw: selectedTabsRaw)
    }

    private var isSignedIn: Bool {
        !appModeManager.isLocal
    }

    private var chosenTabs: [NavigableTab] {
        layout.visibleTabs(signedIn: isSignedIn)
    }

    private var otherTabs: [NavigableTab] {
        let chosen = chosenTabs
        return NavigableTab.allCases.filter { !chosen.contains($0) }
    }

    private var isFull: Bool {
        chosenTabs.count >= TabBarLayout.maxTabs
    }

    var body: some View {
        List {
            Section {
                ForEach(chosenTabs) { tab in
                    chosenRow(tab)
                }
                .onMove(perform: move)
            } header: {
                HStack {
                    Text(L10n.tabBarChosenHeader)
                    Spacer()
                    Text(verbatim: "\(chosenTabs.count)/\(TabBarLayout.maxTabs)")
                        .monospacedDigit()
                        .accessibilityLabel(L10n.tabBarCount(chosenTabs.count, of: TabBarLayout.maxTabs))
                }
            } footer: {
                Text(L10n.tabBarChosenFooter)
            }

            Section {
                ForEach(otherTabs) { tab in
                    availableRow(tab)
                }
            } header: {
                Text(L10n.tabBarAvailableHeader)
            } footer: {
                if isFull {
                    Text(L10n.tabBarFullHint(TabBarLayout.maxTabs))
                }
            }

            Section {
                landingPicker
            } footer: {
                Text(L10n.openAppOnFooter)
            }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle(L10n.navigationTabs)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Rows

    private func chosenRow(_ tab: NavigableTab) -> some View {
        let canRemove = layout.canRemove(tab, signedIn: isSignedIn)
        return HStack(spacing: 12) {
            Button {
                remove(tab)
            } label: {
                Image(systemName: "minus.circle.fill")
                    .font(.title3)
                    .foregroundStyle(canRemove ? Color.red : Color.secondary)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            // Borderless so the button keeps its own tap while the list is
            // in edit mode, where row selection is off.
            .buttonStyle(.borderless)
            .disabled(!canRemove)
            .accessibilityLabel(L10n.tabBarRemove(tab.label))

            Image(systemName: tab.icon)
                .foregroundStyle(Color.accentColor)
                .frame(width: 28)
                .accessibilityHidden(true)
            Text(tab.label)
        }
    }

    private func availableRow(_ tab: NavigableTab) -> some View {
        let needsAccount = !tab.isAvailable(signedIn: isSignedIn)
        let canAdd = layout.canAdd(tab, signedIn: isSignedIn)
        return Button {
            update(layout.adding(tab, signedIn: isSignedIn))
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "plus.circle.fill")
                    .font(.title3)
                    .foregroundStyle(canAdd ? Color.accentColor : Color.secondary)
                    .frame(minWidth: 32, minHeight: 32)
                Image(systemName: tab.icon)
                    .foregroundStyle(.secondary)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tab.label)
                        .foregroundStyle(canAdd ? Color.primary : Color.secondary)
                    if needsAccount {
                        Text(L10n.tabBarRequiresAccount)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .disabled(!canAdd)
        .accessibilityLabel(L10n.tabBarAdd(tab.label))
        .accessibilityHint(addHint(needsAccount: needsAccount, canAdd: canAdd))
    }

    private func addHint(needsAccount: Bool, canAdd: Bool) -> String {
        if needsAccount {
            return L10n.tabBarRequiresAccount
        }
        return canAdd ? "" : L10n.tabBarFullHint(TabBarLayout.maxTabs)
    }

    private var landingPicker: some View {
        Picker(selection: Binding(
            get: { layout.landingTab(landingTabRaw, signedIn: isSignedIn) },
            set: { landingTabRaw = $0 }
        )) {
            Text(L10n.home).tag(TabBarLayout.homeId)
            ForEach(chosenTabs) { tab in
                Text(tab.label).tag(tab.rawValue)
            }
        } label: {
            Label(L10n.openAppOn, systemImage: "arrow.up.forward.app")
        }
        .pickerStyle(.menu)
    }

    // MARK: - Changes

    private func remove(_ tab: NavigableTab) {
        let removed = layout.removing(tab, signedIn: isSignedIn)
        guard removed != layout else { return }
        update(removed)
        landingTabRaw = TabBarLayout.landing(landingTabRaw, afterRemoving: tab)
    }

    private func move(from source: IndexSet, to destination: Int) {
        update(layout.moving(fromOffsets: source, toOffset: destination, signedIn: isSignedIn))
    }

    private func update(_ newLayout: TabBarLayout) {
        guard newLayout != layout else { return }
        withAnimation(reduceMotion ? nil : .default) {
            selectedTabsRaw = newLayout.raw
        }
    }
}
