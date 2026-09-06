import SwiftUI

struct SupplementHistoryView: View {
    @Environment(SupplementRepository.self) private var supplementRepository

    @State private var history: [SupplementHistoryItem] = []
    @State private var isLoading = true
    @State private var startDate = Date().adding(days: -30)
    @State private var endDate = Date()
    @State private var showDatePicker = false

    /// history is a flat list of (supplementId, date) taken events. Group by date
    /// for display without losing the day-indexed layout of the old UI.
    private var historyByDate: [(date: String, items: [SupplementHistoryItem])] {
        let grouped = Dictionary(grouping: history, by: { $0.date })
        return grouped
            .map { (date: $0.key, items: $0.value) }
            .sorted { $0.date > $1.date }
    }

    private var totalTaken: Int {
        history.count
    }

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if history.isEmpty {
                ContentUnavailableView(
                    L10n.supplementHistory,
                    systemImage: "pills",
                    description: Text(L10n.noHistoryForPeriod)
                )
            } else {
                List {
                    Section {
                        HStack(spacing: 24) {
                            VStack {
                                Text("\(totalTaken)")
                                    .font(.title2)
                                    .fontWeight(.bold)
                                Text(L10n.taken)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }

                    ForEach(historyByDate, id: \.date) { day in
                        Section(day.date) {
                            ForEach(day.items) { item in
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                    Text(item.supplementName)
                                    Spacer()
                                    Text(item.takenAt)
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
                    // Each picker is bounded by the other, so "from" can never
                    // be moved past "to" (or the other way round) in the first
                    // place — there is no invalid range to report.
                    DatePicker(L10n.from, selection: $startDate, in: ...endDate, displayedComponents: .date)
                    DatePicker(L10n.to, selection: $endDate, in: startDate..., displayedComponents: .date)
                }
                .navigationTitle(L10n.dateRange)
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
        }
        .task { await loadData() }
    }

    private func loadData() async {
        // Belt and braces for the bounded pickers: an inverted range would ask
        // the server for `startDate > endDate` and always come back empty.
        if startDate > endDate {
            let earlier = endDate
            endDate = startDate
            startDate = earlier
        }
        let start = startDate.isoDateString
        let end = endDate.isoDateString
        history = supplementRepository.localHistory(startDate: start, endDate: end)
        isLoading = history.isEmpty
        // Server-computed history; the repository falls back to cached logs offline.
        history = await supplementRepository.history(startDate: start, endDate: end)
        isLoading = false
    }
}
