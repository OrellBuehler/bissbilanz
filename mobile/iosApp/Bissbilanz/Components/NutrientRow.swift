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
            Text("\(formattedValue) \(unit)")
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var formattedValue: String {
        if value == value.rounded() && value < 10000 {
            return "\(Int(value))"
        }
        return String(format: "%.1f", value)
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
