import SwiftUI

struct NutrientRow: View {
    let label: String
    let value: Double
    let unit: String
    var color: Color = .primary

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(color)
            Spacer()
            Text("\(MacroFormat.nutrient(value)) \(unit)")
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

struct NutrientSection: View {
    let title: String
    let nutrients: [(String, Double, String)]

    var body: some View {
        if !nutrients.isEmpty {
            Section(title) {
                ForEach(nutrients, id: \.0) { name, value, unit in
                    NutrientRow(label: name, value: value, unit: unit)
                }
            }
        }
    }
}
