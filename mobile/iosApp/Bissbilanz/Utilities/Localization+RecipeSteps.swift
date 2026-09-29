import Foundation

// Strings for recipe cooking steps: the editor's "Steps" section
// (`RecipeEditSheet`, `RecipeStepPhotoField`), the numbered list on
// `RecipeDetailView` and the full-screen cooking mode (`RecipeCookingView`).
// Kept in their own file like the other feature strings; same `localized`
// pattern, private to this file.
extension L10n {
    // MARK: - Editor

    static var recipeSteps: String {
        localized("recipe_steps", en: "Steps", de: "Schritte")
    }

    static var recipeStepsFooter: String {
        localized(
            "recipe_steps_footer",
            en: "Optional. Cooking mode walks through these one at a time.",
            de: "Optional. Der Kochmodus zeigt sie dir einen nach dem anderen."
        )
    }

    static var recipeStepsUnavailable: String {
        localized(
            "recipe_steps_unavailable",
            en: "Steps can't be edited until this recipe has loaded. Go online and reopen it.",
            de: "Schritte lassen sich erst bearbeiten, wenn das Rezept geladen ist. Geh online und öffne es erneut."
        )
    }

    static func recipeStepsLimit(_ maximum: Int) -> String {
        localized(
            "recipe_steps_limit",
            en: "A recipe can have up to \(maximum) steps.",
            de: "Ein Rezept kann bis zu \(maximum) Schritte haben."
        )
    }

    static var recipeStepAdd: String {
        localized("recipe_step_add", en: "Add Step", de: "Schritt hinzufügen")
    }

    static var recipeStepReorder: String {
        localized("recipe_step_reorder", en: "Reorder", de: "Anordnen")
    }

    static var recipeStepPlaceholder: String {
        localized("recipe_step_placeholder", en: "Describe this step", de: "Diesen Schritt beschreiben")
    }

    static func recipeStepNumber(_ number: Int) -> String {
        localized("recipe_step_number", en: "Step \(number)", de: "Schritt \(number)")
    }

    static var recipeStepAddPhoto: String {
        localized("recipe_step_add_photo", en: "Add Photo", de: "Foto hinzufügen")
    }

    static var recipeStepReplacePhoto: String {
        localized("recipe_step_replace_photo", en: "Replace Photo", de: "Foto ersetzen")
    }

    static func recipeStepPhotoLabel(_ number: Int) -> String {
        localized("recipe_step_photo_label", en: "Photo for step \(number)", de: "Foto für Schritt \(number)")
    }

    // MARK: - Detail and cooking mode

    static var startCooking: String {
        localized("start_cooking", en: "Start Cooking", de: "Kochen starten")
    }

    static var cookingIngredientsHint: String {
        localized(
            "cooking_ingredients_hint",
            en: "Tap an ingredient to check it off.",
            de: "Tippe auf eine Zutat, um sie abzuhaken."
        )
    }

    static func cookingIngredientsReady(_ ready: Int, of total: Int) -> String {
        localized("cooking_ingredients_ready", en: "\(ready) of \(total) ready", de: "\(ready) von \(total) bereit")
    }

    static func cookingStepOf(_ step: Int, of total: Int) -> String {
        localized("cooking_step_of", en: "Step \(step) of \(total)", de: "Schritt \(step) von \(total)")
    }

    static var cookingBack: String {
        localized("cooking_back", en: "Back", de: "Zurück")
    }

    static var cookingNext: String {
        localized("cooking_next", en: "Next", de: "Weiter")
    }

    static var cookingFinish: String {
        localized("cooking_finish", en: "Finish", de: "Beenden")
    }

    static var cookingAllDone: String {
        localized("cooking_all_done", en: "All done", de: "Fertig gekocht")
    }

    static var cookingEnjoy: String {
        localized("cooking_enjoy", en: "Enjoy your meal.", de: "Guten Appetit.")
    }

    static var cookingViewPhoto: String {
        localized("cooking_view_photo", en: "View photo full screen", de: "Foto im Vollbild ansehen")
    }

    static func cookingServingsScaled(_ servings: String) -> String {
        localized("cooking_servings_scaled", en: "\(servings) servings", de: "\(servings) Portionen")
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
