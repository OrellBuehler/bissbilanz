import SwiftUI

struct MealCard: View {
    let mealType: String
    let entries: [Entry]
    let onTap: () -> Void

    private var mealCalories: Double {
        entries.reduce(0) { $0 + $1.totalCalories }
    }

    private var mealProtein: Double {
        entries.reduce(0) { $0 + $1.totalProtein }
    }

    private var mealColor: Color {
        switch mealType.lowercased() {
        case "breakfast": return .orange
        case "lunch": return .blue
        case "dinner": return .purple
        case "snacks", "snack": return .green
        default: return .gray
        }
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: mealIcon)
                        .foregroundStyle(mealColor)
                    Text(mealType.capitalized)
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
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var mealIcon: String {
        switch mealType.lowercased() {
        case "breakfast": return "sunrise"
        case "lunch": return "sun.max"
        case "dinner": return "moon.stars"
        case "snacks", "snack": return "carrot"
        default: return "fork.knife"
        }
    }
}
