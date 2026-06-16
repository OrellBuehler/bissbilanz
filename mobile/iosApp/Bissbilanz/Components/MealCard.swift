import SwiftUI

struct MealCard: View {
    let mealType: String
    let entries: [Entry]

    private var mealCalories: Double {
        entries.reduce(0) { $0 + $1.totalCalories }
    }

    private var mealColor: Color {
        switch mealType.lowercased() {
        case "breakfast": .orange
        case "lunch": .blue
        case "dinner": .purple
        case "snacks", "snack": .green
        default: .gray
        }
    }

    /// Plain content (not a Button) so the caller can wrap it in a
    /// NavigationLink — a nested Button would swallow the tap and the link
    /// would never fire.
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: mealIcon)
                    .foregroundStyle(mealColor)
                Text(L10n.mealName(mealType))
                    .font(.headline)
                Spacer()
                Text("\(Int(mealCalories)) cal")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ForEach(entries) { entry in
                HStack {
                    Text(entry.displayName)
                        .font(.subheadline)
                        .lineLimit(1)
                    Spacer()
                    Text("\(entry.servings, specifier: "%.1g")x")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(Int(entry.totalCalories))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .contentShape(RoundedRectangle(cornerRadius: 12))
    }

    private var mealIcon: String {
        switch mealType.lowercased() {
        case "breakfast": "sunrise"
        case "lunch": "sun.max"
        case "dinner": "moon.stars"
        case "snacks", "snack": "carrot"
        default: "fork.knife"
        }
    }
}
