import SwiftUI

struct MealPickerSheet: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    let onPick: (String) -> Void

    @State private var mealTypes: [MealType] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else {
                    List(mealTypes) { mealType in
                        Button {
                            onPick(mealType.name)
                            dismiss()
                        } label: {
                            Text(L10n.mealName(mealType.name))
                                .foregroundStyle(.primary)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle(L10n.chooseMeal)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
            }
            .task { await loadMealTypes() }
        }
    }

    private func loadMealTypes() async {
        isLoading = true
        do {
            mealTypes = try await api.getMealTypes()
        } catch {
            mealTypes = []
        }
        isLoading = false
    }
}
