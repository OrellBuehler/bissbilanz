import SwiftUI

struct WeightView: View {
    @EnvironmentObject var api: BissbilanzAPI

    @State private var entries: [WeightEntry] = []
    @State private var isLoading = true
    @State private var showAddSheet = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if entries.isEmpty {
                    ContentUnavailableView(
                        "No weight entries",
                        systemImage: "scalemass",
                        description: Text("Track your weight over time")
                    )
                } else {
                    List {
                        if let latest = entries.first {
                            Section {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text("Current")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text("\(latest.weightKg, specifier: "%.1f") kg")
                                            .font(.title)
                                            .fontWeight(.bold)
                                    }
                                    Spacer()
                                    if entries.count >= 2 {
                                        let diff = latest.weightKg - entries[1].weightKg
                                        VStack(alignment: .trailing) {
                                            Text("Change")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                            HStack(spacing: 2) {
                                                Image(systemName: diff >= 0 ? "arrow.up" : "arrow.down")
                                                Text("\(abs(diff), specifier: "%.1f") kg")
                                            }
                                            .font(.subheadline)
                                            .foregroundStyle(diff >= 0 ? .red : .green)
                                        }
                                    }
                                }
                            }
                        }

                        Section("History") {
                            ForEach(entries) { entry in
                                HStack {
                                    Text(entry.entryDate)
                                        .font(.body)
                                    Spacer()
                                    Text("\(entry.weightKg, specifier: "%.1f") kg")
                                        .foregroundStyle(.secondary)
                                }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        Task { await deleteEntry(entry) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Weight")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddWeightSheet {
                    Task { await loadEntries() }
                }
            }
            .refreshable { await loadEntries() }
            .task { await loadEntries() }
        }
    }

    private func loadEntries() async {
        isLoading = true
        do {
            entries = try await api.getWeightEntries()
        } catch {
            entries = []
        }
        isLoading = false
    }

    private func deleteEntry(_ entry: WeightEntry) async {
        do {
            try await api.deleteWeightEntry(id: entry.id)
            entries.removeAll { $0.id == entry.id }
        } catch {}
    }
}

struct AddWeightSheet: View {
    @EnvironmentObject var api: BissbilanzAPI
    @Environment(\.dismiss) var dismiss

    let onSaved: () -> Void

    @State private var weight = ""
    @State private var date = Date()
    @State private var notes = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Weight") {
                    HStack {
                        TextField("Weight", text: $weight)
                            .keyboardType(.decimalPad)
                        Text("kg")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Date") {
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }

                Section("Notes") {
                    TextField("Optional notes", text: $notes)
                }
            }
            .navigationTitle("Log Weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(weight.isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private func save() async {
        guard let kg = Double(weight) else { return }
        isSaving = true
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        let entry = WeightCreate(
            weightKg: kg,
            entryDate: formatter.string(from: date),
            notes: notes.isEmpty ? nil : notes
        )
        do {
            _ = try await api.createWeightEntry(entry)
            onSaved()
            dismiss()
        } catch {}
        isSaving = false
    }
}
