import SwiftUI

/// Entry point for on-device AI meal estimation: a free-text description goes
/// to `MealEstimator`, and a successful estimate opens `AIMealReviewView` as a
/// nested sheet. Only available on Apple Intelligence devices running iOS 26+
/// (see `MealEstimatorAvailability`) — other devices see an explanation here
/// instead of the estimate button. A queue-based fallback for those devices is
/// a later PR.
struct AIMealSheet: View {
    @Environment(MealEstimator.self) private var mealEstimator
    @Environment(\.dismiss) private var dismiss

    let date: String
    var onLogged: (Int) -> Void = { _ in }

    @State private var description = ""
    @State private var mealType: String
    @State private var isEstimating = false
    @State private var errorMessage: String?
    @State private var estimate: MealEstimate?

    private let mealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    init(date: String, onLogged: @escaping (Int) -> Void = { _ in }) {
        self.date = date
        self.onLogged = onLogged
        _mealType = State(initialValue: Self.mealForCurrentTime())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L10n.meal, selection: $mealType) {
                        ForEach(mealTypes, id: \.self) { meal in
                            Text(L10n.mealName(meal)).tag(meal)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section(L10n.aiMealWhatDidYouEat) {
                    TextField(L10n.aiMealDescriptionPlaceholder, text: $description, axis: .vertical)
                        .lineLimit(4 ... 8)
                }

                if mealEstimator.availability == .available {
                    Section {
                        Button {
                            Task { await runEstimate() }
                        } label: {
                            HStack {
                                Spacer()
                                if isEstimating {
                                    ProgressView()
                                    Text(L10n.aiMealEstimating)
                                } else {
                                    Text(L10n.aiMealEstimateButton)
                                }
                                Spacer()
                            }
                        }
                        .disabled(trimmedDescription.isEmpty || isEstimating)
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    Section {
                        Label {
                            Text(availabilityMessage)
                        } icon: {
                            Image(systemName: "sparkles")
                        }
                        .foregroundStyle(.secondary)
                    }
                }
            }
            .keyboardDismissable()
            .navigationTitle(L10n.aiMealEstimate)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
            .sheet(isPresented: .init(get: { estimate != nil }, set: { if !$0 { estimate = nil } })) {
                if let estimate {
                    NavigationStack {
                        AIMealReviewView(estimate: estimate, date: date, mealType: mealType) { count in
                            onLogged(count)
                            dismiss()
                        }
                    }
                }
            }
            .onAppear { mealEstimator.prewarm() }
        }
        .presentationDetents([.medium, .large])
    }

    private var trimmedDescription: String {
        description.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var availabilityMessage: String {
        switch mealEstimator.availability {
        case .available: ""
        case .deviceNotEligible: L10n.aiMealDeviceNotEligible
        case .appleIntelligenceDisabled: L10n.aiMealAppleIntelligenceDisabled
        case .modelNotReady: L10n.aiMealModelNotReady
        case .osUnsupported: L10n.aiMealOsUnsupported
        }
    }

    private func runEstimate() async {
        isEstimating = true
        errorMessage = nil
        do {
            estimate = try await mealEstimator.estimate(description: trimmedDescription)
        } catch let error as MealEstimatorError {
            errorMessage = error.localizedMessage
        } catch {
            errorMessage = error.localizedDescription
        }
        isEstimating = false
    }

    private static func mealForCurrentTime() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5 ..< 11: return "Breakfast"
        case 11 ..< 14: return "Lunch"
        case 14 ..< 17: return "Snacks"
        default: return "Dinner"
        }
    }
}
