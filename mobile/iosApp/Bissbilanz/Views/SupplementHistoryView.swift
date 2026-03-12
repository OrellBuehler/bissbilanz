import SwiftUI

struct SupplementHistoryView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var history: [SupplementHistoryEntry] = []
    @State private var isLoading = true
    @State private var startDate = Date().adding(days: -30)
    @State private var endDate = Date()
    @State private var showDatePicker = false

    private var totalExpected: Int {
        history.reduce(0) { $0 + $1.supplements.count }
    }

    private var totalTaken: Int {
        history.reduce(0) { total, entry in
            total + entry.supplements.filter(\.taken).count
        }
    }

    private var adherencePercent: Double {
        guard totalExpected > 0 else { return 0 }
        return Double(totalTaken) / Double(totalExpected) * 100
    }

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if history.isEmpty {
                ContentUnavailableView(L10n.supplementHistory, systemImage: "pills", description: Text("No history for this period"))
            } else {
                List {
                    Section {
                        HStack(spacing: 24) {
                            VStack {
                                Text("\(totalTaken)/\(totalExpected)")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                Text("Taken")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            VStack {
                                Text("\(Int(adherencePercent))%")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                    .foregroundStyle(adherencePercent >= 80 ? MacroColors.fiber : .orange)
                                Text(L10n.adherence)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }

                    ForEach(history) { entry in
                        Section(entry.date) {
                            ForEach(entry.supplements) { item in
                                HStack {
                                    Image(systemName: item.taken ? "checkmark.circle.fill" : "xmark.circle.fill")
                                        .foregroundStyle(item.taken ? .green : .red)
                                    Text(item.supplement.name)
                                    Spacer()
                                    Text("\(item.supplement.dosage, specifier: "%.0f") \(item.supplement.dosageUnit)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(L10n.supplementHistory)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showDatePicker = true
                } label: {
                    Image(systemName: "calendar")
                }
            }
        }
        .sheet(isPresented: $showDatePicker) {
            NavigationStack {
                Form {
                    DatePicker("From", selection: $startDate, displayedComponents: .date)
                    DatePicker("To", selection: $endDate, displayedComponents: .date)
                }
                .navigationTitle("Date Range")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(L10n.done) {
                            showDatePicker = false
                            Task { await loadData() }
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .task { await loadData() }
    }

    private func loadData() async {
        isLoading = true
        do {
            history = try await api.getSupplementHistory(
                startDate: startDate.isoDateString,
                endDate: endDate.isoDateString
            )
        } catch {
            history = []
        }
        isLoading = false
    }
}
