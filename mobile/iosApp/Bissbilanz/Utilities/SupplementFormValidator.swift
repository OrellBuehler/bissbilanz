import Foundation

enum SupplementFormValidator {
    struct Ingredient: Equatable {
        var name: String
        var dosage: String
        var hasOriginalText: Bool
    }

    static func requiresScheduleDays(_ type: ScheduleType) -> Bool {
        type == .weekly || type == .specificDays
    }

    static func isMissingScheduleDays(type: ScheduleType, days: Set<Int>) -> Bool {
        requiresScheduleDays(type) && days.isEmpty
    }

    static func isValidIngredient(_ ingredient: Ingredient) -> Bool {
        guard !isBlank(ingredient.name) else { return false }
        return (Double.parseUserInput(ingredient.dosage) ?? 0) > 0 || ingredient.hasOriginalText
    }

    static func isValid(
        name: String,
        scheduleType: ScheduleType,
        scheduleDays: Set<Int>,
        ingredients: [Ingredient]
    ) -> Bool {
        guard !isBlank(name), !ingredients.isEmpty else { return false }
        guard !isMissingScheduleDays(type: scheduleType, days: scheduleDays) else { return false }
        return ingredients.allSatisfy { isValidIngredient($0) }
    }

    private static func isBlank(_ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
