import SwiftUI

struct SupplementsView: View {
    @EnvironmentObject var api: BissbilanzAPI

    @State private var supplements: [Supplement] = []
    @State private var loggedIds: Set<String> = []
    @State private var isLoading = true

    private var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if supplements.isEmpty {
                    ContentUnavailableView(
                        "No supplements",
                        systemImage: "pills",
                        description: Text("Add supplements on the web app")
                    )
                } else {
                    List(supplements) { supplement in
                        supplementRow(supplement)
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Supplements")
            .refreshable { await loadData() }
            .task { await loadData() }
        }
    }

    private func supplementRow(_ supplement: Supplement) -> some View {
        let isTaken = loggedIds.contains(supplement.id)

        return Button {
            Task {
                await toggleSupplement(supplement, isTaken: isTaken)
            }
        } label: {
            HStack {
                Image(systemName: isTaken ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(isTaken ? .green : .secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(supplement.name)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .strikethrough(isTaken)
                    Text("\(supplement.dosage, specifier: "%.0f") \(supplement.dosageUnit)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let time = supplement.timeOfDay {
                        Label(time.capitalized, systemImage: timeIcon(time))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                scheduleLabel(supplement)
            }
        }
        .buttonStyle(.plain)
    }

    private func scheduleLabel(_ supplement: Supplement) -> some View {
        Group {
            switch supplement.scheduleType {
            case .daily:
                Text("Daily")
            case .everyOtherDay:
                Text("Every other day")
            case .weekly:
                Text("Weekly")
            case .specificDays:
                Text("Custom")
            }
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }

    private func timeIcon(_ time: String) -> String {
        switch time.lowercased() {
        case "morning": return "sunrise"
        case "evening", "night": return "moon"
        case "afternoon": return "sun.max"
        default: return "clock"
        }
    }

    private func toggleSupplement(_ supplement: Supplement, isTaken: Bool) async {
        if isTaken {
            do {
                try await api.unlogSupplement(id: supplement.id, date: dateString)
                loggedIds.remove(supplement.id)
            } catch {}
        } else {
            do {
                _ = try await api.logSupplement(id: supplement.id, date: dateString)
                loggedIds.insert(supplement.id)
            } catch {}
        }
    }

    private func loadData() async {
        isLoading = true
        do {
            supplements = try await api.getSupplements()
            let checklist = try await api.getSupplementChecklist(date: dateString)
            loggedIds = Set(checklist.filter(\.taken).map(\.supplement.id))
        } catch {
            // If checklist fails, still show supplements
            if supplements.isEmpty {
                do {
                    supplements = try await api.getSupplements()
                } catch {}
            }
        }
        isLoading = false
    }
}
