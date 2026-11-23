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
        VStack(alignment: .leading, spacing: 10) {
            MealCardHeader(mealType: mealType, icon: mealIcon, tint: mealColor, calories: mealCalories)

            ForEach(entries) { entry in
                MealCardRow(entry: entry)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
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

private struct MealCardHeader: View {
    let mealType: String
    let icon: String
    let tint: Color
    let calories: Double

    var body: some View {
        HStack(spacing: 10) {
            IconTile(systemImage: icon, tint: tint, size: 32)
            Text(L10n.mealName(mealType))
                .font(.brand(.headline, weight: .semibold))
                .foregroundStyle(Brand.text)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            Chip("\(Int(calories)) cal")
                .contentTransition(.numericText(value: calories))
        }
    }
}

private struct MealCardRow: View {
    let entry: Entry

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.displayName)
                    .font(.subheadline)
                    .foregroundStyle(Brand.text)
                    .lineLimit(1)
                if let time = entry.loggedTimeString {
                    Text(time)
                        .font(.caption2)
                        .foregroundStyle(Brand.textSecondary)
                }
            }
            Spacer(minLength: 8)
            Text("\(entry.servings, specifier: "%.1g")x")
                .font(.caption)
                .foregroundStyle(Brand.textSecondary)
            Text("\(Int(entry.totalCalories))")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(Brand.textSecondary)
        }
    }
}
