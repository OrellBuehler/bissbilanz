import SwiftUI
import WatchKit

/// Serving adjuster for a selected food: a Digital Crown stepper with haptic
/// detents, a meal picker driven by the synced (server-driven) meal types, and
/// a Log button that relays the entry to the phone.
struct LogDetailView: View {
    @Environment(WatchConnectivityManager.self) private var connectivity
    @Environment(\.dismiss) private var dismiss

    let food: WatchFoodRef

    @State private var servings: Double = 1.0
    @State private var mealType: String
    @State private var isLogging = false
    @State private var didFinish = false
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
            VStack(spacing: 12) {
                Text(food.name)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                servingStepper

                Text("\(strings.integer(totalCalories)) \(strings.kcal)")
                    .font(.caption)
                    .foregroundStyle(MacroColors.calories)

                Picker(strings.meal, selection: $mealType) {
                    ForEach(mealTypes, id: \.self) { meal in
                        Text(strings.mealName(meal)).tag(meal)
                    }
                }
                .pickerStyle(.navigationLink)

                Button(action: log) {
                    if isLogging {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(strings.log)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                    }
                }
                .tint(MacroColors.calories)
                .disabled(isLogging)
            }
            .padding(.vertical, 4)
        }
        .navigationTitle(strings.log)
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.increase, trigger: servings)
        .sensoryFeedback(.success, trigger: didFinish)
        .onAppear {
            crownFocused = true
            // Fall back to a valid meal if the time-of-day default isn't offered.
            if !mealTypes.contains(mealType), let first = mealTypes.first {
                mealType = first
            }
        }
    }

    /// Big serving value driven by the Digital Crown, with haptic detents.
    private var servingStepper: some View {
        Text(strings.servingsValue(servings))
            .font(.system(size: 44, weight: .semibold, design: .rounded))
            .monospacedDigit()
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
            .frame(maxWidth: .infinity)
            .overlay(alignment: .bottom) {
                Text(strings.servings)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .offset(y: 14)
            }
            .padding(.bottom, 14)
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
                didFinish = true
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
