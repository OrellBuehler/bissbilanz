import SwiftUI

/// One "Label ........ [value] unit" row of a nutrient form. Shared by the
/// quick-entry sheet and the entry editor so both render identically.
struct NutrientInputField: View {
    let label: String
    @Binding var text: String
    let unit: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            TextField("0", text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
            Text(unit)
                .foregroundStyle(.secondary)
                .frame(width: 30, alignment: .leading)
        }
    }
}

/// The categorized "Add Nutrient" menu over `NutrientCatalog`, restricted to
/// the nutrients the user enabled in Settings and to those not already added.
struct AddNutrientMenu: View {
    @Binding var values: [String: String]
    /// Nutrient keys enabled in Settings. `nil` (preferences not loaded yet or
    /// none configured) offers every nutrient.
    let visibleNutrientKeys: Set<String>?

    var body: some View {
        Menu {
            ForEach(NutrientCatalog.addable(excluding: values, visibleKeys: visibleNutrientKeys)) { category in
                Menu(category.title) {
                    ForEach(category.nutrients) { spec in
                        Button(spec.label) { values[spec.key] = "" }
                    }
                }
            }
        } label: {
            Label(L10n.addNutrient, systemImage: "plus.circle")
        }
    }
}
