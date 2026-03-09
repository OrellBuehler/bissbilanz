import SwiftUI

struct DashboardView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text("Today")
                        .font(.title)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    // Macro rings placeholder
                    HStack(spacing: 24) {
                        MacroRingView(label: "Cal", current: 0, goal: 2000, color: .blue)
                        MacroRingView(label: "Protein", current: 0, goal: 150, color: .red)
                        MacroRingView(label: "Carbs", current: 0, goal: 250, color: .orange)
                        MacroRingView(label: "Fat", current: 0, goal: 65, color: .yellow)
                    }

                    // Empty state
                    VStack(spacing: 8) {
                        Text("No entries yet today.")
                            .foregroundColor(.secondary)
                        Text("Tap + to add food.")
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 48)
                }
                .padding()
            }
            .navigationTitle("Bissbilanz")
        }
    }
}
