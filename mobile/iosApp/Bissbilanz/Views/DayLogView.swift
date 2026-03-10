import SwiftUI

struct DayLogView: View {
    @EnvironmentObject var api: BissbilanzAPI
    let date: String

    @State private var entries: [Entry] = []
    @State private var isLoading = true
    @State private var error: Error?

    private var mealGroups: [(String, [Entry])] {
        let grouped = Dictionary(grouping: entries, by: \.mealType)
        let order = ["breakfast", "lunch", "dinner", "snacks"]
        return order.compactMap { meal in
            guard let items = grouped[meal], !items.isEmpty else { return nil }
            return (meal, items)
        } + grouped.filter { !order.contains($0.key) }.sorted(by: { $0.key < $1.key }).map { ($0.key, $0.value) }
    }

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadEntries() } }
            } else if entries.isEmpty {
                ContentUnavailableView("No entries", systemImage: "tray", description: Text("No food logged for \(date)"))
            } else {
                List {
                    ForEach(mealGroups, id: \.0) { mealType, mealEntries in
                        Section {
                            ForEach(mealEntries) { entry in
                                entryRow(entry)
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button(role: .destructive) {
                                            Task { await deleteEntry(entry) }
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                            }
                        } header: {
                            HStack {
                                Text(mealType.capitalized)
                                Spacer()
                                let cal = mealEntries.reduce(0.0) { $0 + $1.totalCalories }
                                Text("\(Int(cal)) cal")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(date)
        .refreshable { await loadEntries() }
        .task { await loadEntries() }
    }

    private func entryRow(_ entry: Entry) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.displayName)
                    .font(.body)
                Text("\(entry.servings, specifier: "%.1g")x \u{00B7} \(Int(entry.totalCalories)) cal")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("P\(Int(entry.totalProtein))")
                    .font(.caption2)
                    .foregroundStyle(MacroColors.protein)
                Text("C\(Int(entry.totalCarbs)) F\(Int(entry.totalFat))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func loadEntries() async {
        isLoading = true
        error = nil
        do {
            entries = try await api.getEntries(date: date)
        } catch {
            self.error = error
        }
        isLoading = false
    }

    private func deleteEntry(_ entry: Entry) async {
        do {
            try await api.deleteEntry(id: entry.id)
            entries.removeAll { $0.id == entry.id }
        } catch {}
    }
}
