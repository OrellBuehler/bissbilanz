import SwiftUI

/// Quick-log list: favorites and recents synced from the phone. Tapping a row
/// opens the serving adjuster. A toolbar mic offers voice logging when it's
/// actually usable — watchOS 27+, Private Cloud Compute available, and the
/// phone's "AI Estimation" setting left on (see `WatchMealEstimator`).
struct LogListView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity
    @Environment(WatchMealEstimator.self) private var mealEstimator

    @State private var isVoiceLogging = false

    private var state: WatchState {
        connectivity.state
    }

    private var strings: WatchStrings {
        state.strings
    }

    private var favorites: [WatchFoodRef] {
        state.snapshot.favorites.map { WatchFoodRef(id: $0.id, name: $0.name, calories: $0.calories) }
    }

    private var voiceLogAvailable: Bool {
        mealEstimator.availability == .available && (state.privateCloudComputeEnabled ?? true)
    }

    var body: some View {
        Group {
            if favorites.isEmpty, state.recents.isEmpty {
                ContentUnavailableView(
                    connectivity.hasReceivedState ? strings.noFavorites : strings.noData,
                    systemImage: "fork.knife"
                )
            } else {
                List {
                    if connectivity.pendingLogs > 0 || connectivity.failedLogs > 0 {
                        PendingLogsLabel()
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
            }
        }
        .navigationTitle(strings.log)
        .toolbar {
            if voiceLogAvailable {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isVoiceLogging = true
                    } label: {
                        Image(systemName: "mic")
                    }
                    .accessibilityLabel(strings.voiceLog)
                }
            }
        }
        .sheet(isPresented: $isVoiceLogging) {
            NavigationStack {
                VoiceMealLogView()
            }
        }
    }

    private func row(_ food: WatchFoodRef) -> some View {
        NavigationLink {
            LogDetailView(food: food)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(food.name)
                    .lineLimit(2)
                Text("\(strings.integer(food.calories)) \(strings.kcal)")
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}
