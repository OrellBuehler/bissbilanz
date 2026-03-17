import SwiftUI

struct TabSelectionView: View {
    @AppStorage("selected_tabs") private var selectedTabsRaw: String = "foods,favorites,insights"

    private var selectedTabs: Set<NavigableTab> {
        Set(selectedTabsRaw.split(separator: ",").compactMap { NavigableTab(rawValue: String($0)) })
    }

    var body: some View {
        List {
            Section {
                Text(L10n.selectTabs)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                ForEach(NavigableTab.allCases) { tab in
                    let isSelected = selectedTabs.contains(tab)
                    Button {
                        toggleTab(tab)
                    } label: {
                        HStack {
                            Image(systemName: tab.icon)
                                .foregroundStyle(isSelected ? .accentColor : .secondary)
                                .frame(width: 28)
                            Text(tab.label)
                                .foregroundStyle(.primary)
                            Spacer()
                            if isSelected {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.accentColor)
                                    .fontWeight(.semibold)
                            }
                        }
                    }
                    .disabled(!isSelected && selectedTabs.count >= 3)
                    .opacity(!isSelected && selectedTabs.count >= 3 ? 0.4 : 1.0)
                }
            }

            Section {
                HStack {
                    Image(systemName: "house")
                        .foregroundStyle(.secondary)
                        .frame(width: 28)
                    Text(L10n.home)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                HStack {
                    Image(systemName: "gear")
                        .foregroundStyle(.secondary)
                        .frame(width: 28)
                    Text(L10n.settings)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .navigationTitle(L10n.navigationTabs)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func toggleTab(_ tab: NavigableTab) {
        var current = selectedTabs
        if current.contains(tab) {
            guard current.count > 1 else { return }
            current.remove(tab)
        } else {
            guard current.count < 3 else { return }
            current.insert(tab)
        }
        // Preserve canonical order
        let ordered = NavigableTab.allCases.filter { current.contains($0) }
        selectedTabsRaw = ordered.map(\.rawValue).joined(separator: ",")
    }
}
