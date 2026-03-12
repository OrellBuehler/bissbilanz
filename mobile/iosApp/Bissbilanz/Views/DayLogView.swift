import SwiftUI

struct DayLogView: View {
    @Environment(BissbilanzAPI.self) private var api
    let date: String

    @State private var entries: [Entry] = []
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showFoodSearch = false
    @State private var editingEntry: Entry?
    @State private var isCopying = false
    @State private var errorMessage: String?

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
                emptyView
            } else {
                entryList
            }
        }
        .navigationTitle(displayDate)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showFoodSearch = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable { await loadEntries() }
        .sheet(isPresented: $showFoodSearch) {
            NavigationStack {
                FoodSearchView(date: date)
            }
            .onDisappear {
                Task { await loadEntries() }
            }
        }
        .sheet(item: $editingEntry) { entry in
            EntryEditSheet(entry: entry) { updated in
                if let index = entries.firstIndex(where: { $0.id == updated.id }) {
                    entries[index] = updated
                }
            }
        }
        .task { await loadEntries() }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private var displayDate: String {
        if let parsed = DateFormatting.date(from: date) {
            if parsed.isToday {
                return L10n.today
            }
            return DateFormatting.displayString(from: parsed)
        }
        return date
    }

    private var emptyView: some View {
        ContentUnavailableView {
            Label(L10n.noEntries, systemImage: "tray")
        } description: {
            Text(L10n.noEntriesYet)
        } actions: {
            VStack(spacing: 12) {
                Button {
                    showFoodSearch = true
                } label: {
                    Label(L10n.addFood, systemImage: "plus.circle.fill")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    Task { await copyYesterday() }
                } label: {
                    Label(L10n.copyYesterday, systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .disabled(isCopying)
            }
        }
    }

    private var entryList: some View {
        List {
            ForEach(mealGroups, id: \.0) { mealType, mealEntries in
                Section {
                    ForEach(mealEntries) { entry in
                        entryRow(entry)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task { await deleteEntry(entry) }
                                } label: {
                                    Label(L10n.delete, systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                Button {
                                    editingEntry = entry
                                } label: {
                                    Label(L10n.edit, systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                } header: {
                    HStack {
                        Text(L10n.mealName(mealType))
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

    private func entryRow(_ entry: Entry) -> some View {
        Button {
            editingEntry = entry
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.displayName)
                        .font(.body)
                        .foregroundStyle(.primary)
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func copyYesterday() async {
        isCopying = true
        let yesterday = Date().adding(days: -1).isoDateString
        do {
            let copied = try await api.copyEntries(fromDate: yesterday, toDate: date)
            entries = copied
        } catch {
            errorMessage = error.localizedDescription
        }
        isCopying = false
    }
}
