import SwiftUI

/// Quick-log list: favorites and recents synced from the phone. Tapping a row
/// opens the serving adjuster.
struct LogListView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    private var state: WatchState {
        connectivity.state
    }

    private var strings: WatchStrings {
        state.strings
    }

    private var favorites: [WatchFoodRef] {
        state.snapshot.favorites.map { WatchFoodRef(id: $0.id, name: $0.name, calories: $0.calories) }
    }

    var body: some View {
        List {
            if favorites.isEmpty, state.recents.isEmpty {
                Text(strings.noData)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }

            if !favorites.isEmpty {
                Section(strings.favorites) {
                    ForEach(favorites) { row($0) }
                }
            }

            if !state.recents.isEmpty {
                Section(strings.recents) {
                    ForEach(state.recents) { row($0) }
                }
            }
        }
        .navigationTitle(strings.log)
    }

    private func row(_ food: WatchFoodRef) -> some View {
        NavigationLink {
            LogDetailView(food: food)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(food.name)
                    .font(.body)
                    .lineLimit(2)
                Text("\(strings.integer(food.calories)) \(strings.kcal)")
                    .font(.caption2)
                    .foregroundStyle(MacroColors.calories)
            }
        }
    }
}
