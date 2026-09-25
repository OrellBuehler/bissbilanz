import SwiftUI

/// Nutri-Score, NOVA group, additives and ingredients for a food — shown
/// wherever a food's own detail is visible (`FoodDetailView`, the log food
/// sheet). Hidden entirely when none of the four are present.
struct FoodQualitySection: View {
    let food: Food

    @State private var ingredientsExpanded = false

    var body: some View {
        if food.nutriScore != nil || food
            .novaGroup != nil || !(food.additives?.isEmpty ?? true) || !(food.ingredientsText?.isEmpty ?? true)
        {
            Section(L10n.quality) {
                if let nutriScore = food.nutriScore {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(L10n.nutriScore)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        nutriScoreBadge(nutriScore)
                    }
                    .padding(.vertical, 4)
                }
                if let novaGroup = food.novaGroup {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(L10n.novaGroup)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        novaGroupBadge(novaGroup)
                    }
                    .padding(.vertical, 4)
                }
                if let additives = food.additives, !additives.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            Text(L10n.additives)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text("\(additives.count)")
                                .font(.caption2)
                                .fontWeight(.bold)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.red.opacity(0.15))
                                .foregroundStyle(.red)
                                .clipShape(Capsule())
                        }
                        ForEach(additives, id: \.self) { additive in
                            Text(formatAdditive(additive))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
                if let ingredients = food.ingredientsText, !ingredients.isEmpty {
                    ingredientsRow(ingredients)
                }
            }
        }
    }

    private func nutriScoreBadge(_ score: String) -> some View {
        let letters = ["A", "B", "C", "D", "E"]
        let colors: [Color] = [
            Color(red: 0.01, green: 0.51, blue: 0.25),
            Color(red: 0.52, green: 0.73, blue: 0.18),
            Color(red: 1.0, green: 0.80, blue: 0.01),
            Color(red: 0.93, green: 0.51, blue: 0.0),
            Color(red: 0.90, green: 0.24, blue: 0.07),
        ]
        let activeIndex = letters.firstIndex(where: { $0.caseInsensitiveCompare(score) == .orderedSame }) ?? -1

        return HStack(spacing: 4) {
            ForEach(Array(zip(letters.indices, letters)), id: \.0) { index, letter in
                let isActive = index == activeIndex
                Text(letter)
                    .font(isActive ? .body : .caption)
                    .fontWeight(.bold)
                    .foregroundStyle(isActive ? .white : colors[index].opacity(0.5))
                    .frame(width: isActive ? 36 : 28, height: isActive ? 36 : 28)
                    .background(isActive ? colors[index] : colors[index].opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private func novaGroupBadge(_ group: Int) -> some View {
        let info: (String, Color) = switch group {
        case 1: (L10n.novaGroupDescription(1), Color(red: 0.01, green: 0.51, blue: 0.25))
        case 2: (L10n.novaGroupDescription(2), Color(red: 1.0, green: 0.80, blue: 0.01))
        case 3: (L10n.novaGroupDescription(3), Color(red: 0.93, green: 0.51, blue: 0.0))
        case 4: (L10n.novaGroupDescription(4), Color(red: 0.90, green: 0.24, blue: 0.07))
        default: (L10n.novaGroupDescription(group), Color.secondary)
        }

        return HStack(spacing: 10) {
            Text("\(group)")
                .font(.body)
                .fontWeight(.bold)
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(info.1)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            Text(info.0)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(info.1)
        }
    }

    private func formatAdditive(_ raw: String) -> String {
        var text = raw.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("en:") { text = String(text.dropFirst(3)) }
        let parts = text.components(separatedBy: " - ")
        if parts.count >= 2 {
            return "\(parts[0].trimmingCharacters(in: .whitespaces).uppercased()) - \(parts[1].trimmingCharacters(in: .whitespaces).capitalized)"
        }
        return text.uppercased()
    }

    private func ingredientsRow(_ text: String) -> some View {
        let isLong = text.count > 150
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(L10n.ingredients)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                if isLong {
                    Image(systemName: ingredientsExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if isLong { withAnimation { ingredientsExpanded.toggle() } }
            }
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(isLong && !ingredientsExpanded ? 3 : nil)
        }
        .padding(.vertical, 4)
    }
}
