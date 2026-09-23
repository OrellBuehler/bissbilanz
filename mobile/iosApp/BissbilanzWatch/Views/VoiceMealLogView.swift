import SwiftUI
import WatchKit

/// Voice/text meal logging: a free-text description — tapping the `TextField`
/// brings up watchOS's own text-input sheet, Dictation first — is estimated on
/// Apple's Private Cloud Compute (`WatchMealEstimator`; watchOS has no
/// on-device model to try first), reviewed as one compact quick-log entry,
/// then sent to the phone through the existing `WatchLogRequest` path (queued
/// like the other watch loggers). `LogListView`'s toolbar mic hides this entry
/// point below watchOS 27 or when the model isn't available, so this view is
/// only ever reached when `WatchMealEstimator.availability == .available`.
struct VoiceMealLogView: View {
    @Environment(WatchMealEstimator.self) private var estimator
    @Environment(WatchConnectivityManager.self) private var connectivity
    @Environment(\.dismiss) private var dismiss

    @State private var description = ""
    @State private var isEstimating = false
    @State private var errorMessage: String?
    @State private var estimate: WatchMealEstimate?

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var trimmedDescription: String {
        description.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        Form {
            Section {
                TextField(strings.voiceLogPlaceholder, text: $description, axis: .vertical)
            }
            Section {
                Button {
                    Task { await runEstimate() }
                } label: {
                    if isEstimating {
                        HStack(spacing: 6) {
                            ProgressView()
                            Text(strings.voiceLogEstimating)
                        }
                    } else {
                        Text(strings.voiceLogEstimate)
                    }
                }
                .disabled(trimmedDescription.isEmpty || isEstimating)
            }
        }
        .navigationTitle(strings.voiceLogTitle)
        .navigationDestination(isPresented: .init(
            get: { estimate != nil },
            set: { if !$0 { estimate = nil } }
        )) {
            if let estimate {
                // Logging closes this whole sheet (via the callback), not just
                // the pushed confirm screen — `VoiceMealConfirmView` has no
                // `dismiss` of its own, since its own would only pop back to
                // this text-entry screen (mirrors `AIMealSheet`/`AIMealReviewView`
                // on the phone).
                VoiceMealConfirmView(estimate: estimate, onLogged: { dismiss() })
            }
        }
        .alert(
            strings.voiceLogFailed,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(strings.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func runEstimate() async {
        isEstimating = true
        errorMessage = nil
        do {
            estimate = try await estimator.estimate(description: trimmedDescription)
        } catch let error as WatchMealEstimatorError {
            errorMessage = error.localizedMessage(strings)
        } catch {
            errorMessage = error.localizedDescription
        }
        isEstimating = false
    }
}

/// Compact confirmation: name, calories and the four macros, plus the same
/// meal-type picker `LogDetailView` uses, before the entry is relayed to the
/// phone as a quick-log `WatchLogRequest`.
private struct VoiceMealConfirmView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity

    let estimate: WatchMealEstimate
    let onLogged: () -> Void

    @State private var mealType: String
    @State private var isLogging = false

    init(estimate: WatchMealEstimate, onLogged: @escaping () -> Void) {
        self.estimate = estimate
        self.onLogged = onLogged
        _mealType = State(initialValue: Self.defaultMealForNow())
    }

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var mealTypes: [String] {
        connectivity.state.mealTypes
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(estimate.name)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                Text("\(strings.integer(estimate.calories)) \(strings.kcal)")
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(MacroColors.calories)

                HStack(spacing: 10) {
                    macroChip(strings.protein, estimate.protein, MacroColors.protein)
                    macroChip(strings.carbs, estimate.carbs, MacroColors.carbs)
                    macroChip(strings.fat, estimate.fat, MacroColors.fat)
                    macroChip(strings.fiber, estimate.fiber, MacroColors.fiber)
                }

                Picker(strings.meal, selection: $mealType) {
                    ForEach(mealTypes, id: \.self) { meal in
                        Text(strings.mealName(meal)).tag(meal)
                    }
                }
                .pickerStyle(.navigationLink)
            }
            .padding(.vertical, 4)
        }
        .navigationTitle(strings.log)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ConfirmButton(isLogging: isLogging, label: strings.log, action: log)
            }
        }
        .onAppear {
            // Fall back to a valid meal if the time-of-day default isn't offered.
            if !mealTypes.contains(mealType), let first = mealTypes.first {
                mealType = first
            }
        }
    }

    private func macroChip(_ label: String, _ grams: Double, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text(strings.integer(grams))
                .font(.footnote)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func log() {
        isLogging = true
        let request = WatchLogRequest(
            mealType: mealType,
            servings: 1,
            date: WidgetSnapshotStore.isoDateString(from: Date()),
            quickName: estimate.name,
            quickCalories: estimate.calories,
            quickProtein: estimate.protein,
            quickCarbs: estimate.carbs,
            quickFat: estimate.fat,
            quickFiber: estimate.fiber,
            requestId: UUID().uuidString
        )
        Task {
            let outcome = await connectivity.log(request)
            isLogging = false
            switch outcome {
            case .confirmed, .queued:
                WKInterfaceDevice.current().play(.success)
                onLogged()
            case .failed:
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }

    /// Time-of-day meal default, matching `LogDetailView`'s heuristic.
    private static func defaultMealForNow() -> String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5 ..< 11: "Breakfast"
        case 11 ..< 14: "Lunch"
        case 14 ..< 17: "Snacks"
        default: "Dinner"
        }
    }
}
