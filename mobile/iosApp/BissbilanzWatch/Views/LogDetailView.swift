import SwiftUI
import WatchKit

/// Serving adjuster for a selected food: a Digital Crown stepper with haptic
/// detents, a meal picker driven by the synced (server-driven) meal types, and
/// a toolbar checkmark that relays the entry to the phone.
struct LogDetailView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity
    @Environment(\.dismiss) private var dismiss

    let food: WatchFoodRef

    @State private var servings: Double = 1.0
    @State private var mealType: String
    @State private var isLogging = false
    @FocusState private var crownFocused: Bool

    init(food: WatchFoodRef) {
        self.food = food
        _mealType = State(initialValue: Self.defaultMealForNow())
    }

    private var strings: WatchStrings {
        connectivity.state.strings
    }

    private var mealTypes: [String] {
        connectivity.state.mealTypes
    }

    private var totalCalories: Double {
        food.calories * servings
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(food.name)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                CrownValue(
                    value: strings.servingsValue(servings),
                    caption: "\(strings.servings) · \(strings.integer(totalCalories)) \(strings.kcal)"
                )
                .focusable()
                .focused($crownFocused)
                .digitalCrownRotation(
                    $servings,
                    from: 0.25,
                    through: 20,
                    by: 0.25,
                    sensitivity: .medium,
                    isContinuous: false,
                    isHapticFeedbackEnabled: true
                )

                Picker(strings.meal, selection: $mealType) {
                    ForEach(mealTypes, id: \.self) { meal in
                        Text(strings.mealName(meal)).tag(meal)
                    }
                }
                .pickerStyle(.navigationLink)
            }
        }
        .navigationTitle(strings.log)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ConfirmButton(isLogging: isLogging, label: strings.log, action: log)
            }
        }
        .sensoryFeedback(.increase, trigger: servings)
        .onAppear {
            crownFocused = true
            // Fall back to a valid meal if the time-of-day default isn't offered.
            if !mealTypes.contains(mealType), let first = mealTypes.first {
                mealType = first
            }
        }
    }

    private func log() {
        isLogging = true
        let request = WatchLogRequest(
            foodId: food.isRecipe ? nil : food.id,
            recipeId: food.isRecipe ? food.id : nil,
            mealType: mealType,
            servings: servings,
            date: WidgetSnapshotStore.isoDateString(from: Date()),
            requestId: UUID().uuidString
        )
        Task {
            let outcome = await connectivity.log(request)
            isLogging = false
            switch outcome {
            case .confirmed, .queued:
                WKInterfaceDevice.current().play(.success)
                dismiss()
            case .failed:
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }

    /// Time-of-day meal default, matching the phone's favorite quick-log
    /// heuristic.
    private static func defaultMealForNow() -> String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5 ..< 11: "Breakfast"
        case 11 ..< 14: "Lunch"
        case 14 ..< 17: "Snacks"
        default: "Dinner"
        }
    }
}

/// Large rounded value the Digital Crown drives, with a small caption under it.
struct CrownValue: View {
    let value: String
    let caption: String
    var size: CGFloat = 44

    var body: some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: size, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(caption)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

/// Toolbar checkmark that commits a log, swapping to a spinner while the
/// phone round-trip is in flight.
struct ConfirmButton: View {
    let isLogging: Bool
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if isLogging {
                ProgressView()
            } else {
                Image(systemName: "checkmark")
            }
        }
        .tint(.green)
        .disabled(isLogging)
        .accessibilityLabel(label)
    }
}
