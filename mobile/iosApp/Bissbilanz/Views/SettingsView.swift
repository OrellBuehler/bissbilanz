import AuthenticationServices
import SwiftUI

struct SettingsView: View {
    @Environment(GoalsRepository.self) private var goalsRepository
    @Environment(PreferencesRepository.self) private var preferencesRepository
    // Meal types are server-only — they stay on the direct API.
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AuthManager.self) private var authManager
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(FoodEnrichmentController.self) private var foodEnrichment

    @State private var signInSession: ASWebAuthenticationSession?
    @State private var signInPrompt: SignInPrompt?
    @State private var goals: Goals = .defaults
    @State private var preferences: Preferences = .defaults
    @State private var mealTypes: [MealType] = []
    @State private var isEditingGoals = false
    @State private var errorMessage: String?
    @State private var showHelpCenter = false

    /// The sections live in their own views (Views/Settings): the whole screen
    /// as one body was a single huge generic type, and building its metadata
    /// overflowed the main thread's stack on first open (TestFlight 1.61.0).
    var body: some View {
        NavigationStack {
            List {
                SettingsAccountStatusSection(onSignIn: { beginSignIn() })
                SettingsGoalsSection(goals: goals, preferences: $preferences, isEditingGoals: $isEditingGoals)
                SettingsBiologicalSexSection(preferences: $preferences)
                SettingsScreenSections()
                SettingsPersonalizationSection(preferences: $preferences, mealTypes: $mealTypes)
                SettingsIntegrationsSection()
                SettingsAiProcessingSection(preferences: $preferences)
                SettingsFoodLabelsSection()
                SettingsEnhanceFoodsSection()
                SettingsHelpSection(showHelpCenter: $showHelpCenter)
                SettingsAccountActionsSection(errorMessage: $errorMessage)
                SettingsSiriSection()
                SettingsAboutSection()
            }
            .brandForm()
            .keyboardDismissable()
            .navigationTitle(L10n.settings)
            .modifier(SettingsPresentations(
                showHelpCenter: $showHelpCenter,
                isEditingGoals: $isEditingGoals,
                signInPrompt: $signInPrompt,
                errorMessage: $errorMessage,
                goals: $goals,
                preferences: $preferences
            ))
            .task { await loadData() }
            .task { await foodEnrichment.refreshForSettings() }
        }
    }

    private func beginSignIn() {
        switch SignInPlan.resolve(lastProvider: authManager.lastProvider, isLocalMode: appModeManager.isLocal) {
        case let .web(provider):
            signInSession = SignInFlow.start(authManager: authManager, provider: provider)
        case let .prompt(prompt):
            signInPrompt = prompt
        }
    }

    private func loadData() async {
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults

        async let g: Void? = try? goalsRepository.refresh()
        async let p: Void? = try? preferencesRepository.refresh()

        _ = await (g, p)
        // Meal types are server-only — never fetched in Local mode.
        if !appModeManager.isLocal {
            mealTypes = await (try? api.getMealTypes()) ?? []
        }
        goals = goalsRepository.goals() ?? .defaults
        preferences = preferencesRepository.preferences() ?? .defaults
    }
}

/// The sheets and the error alert of the settings list, in one modifier so the
/// list's own type stays shallow.
private struct SettingsPresentations: ViewModifier {
    @Binding var showHelpCenter: Bool
    @Binding var isEditingGoals: Bool
    @Binding var signInPrompt: SignInPrompt?
    @Binding var errorMessage: String?
    @Binding var goals: Goals
    @Binding var preferences: Preferences

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $showHelpCenter) {
                SafariView(url: HelpLink.url())
            }
            .sheet(isPresented: $isEditingGoals) {
                SettingsGoalsEditor(goals: $goals, preferences: $preferences, errorMessage: $errorMessage)
            }
            .sheet(item: $signInPrompt) { prompt in
                SignInProviderSheet(prompt: prompt)
            }
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
    }
}

// MARK: - Meal Types View

/// Custom meal types are server-only — the list stays on the direct API.
struct MealTypesView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Binding var mealTypes: [MealType]

    @State private var newMealTypeName = ""
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                ForEach(mealTypes) { mealType in
                    Text(mealType.name)
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { await deleteMealType(mealType) }
                            } label: {
                                Label(L10n.delete, systemImage: "trash")
                            }
                        }
                }
                HStack {
                    TextField(L10n.customMealTypes, text: $newMealTypeName)
                    Button(L10n.add) {
                        Task { await addMealType() }
                    }
                    .disabled(newMealTypeName.isEmpty)
                }
            }
        }
        .brandForm()
        .navigationTitle(L10n.customMealTypes)
        .navigationBarTitleDisplayMode(.inline)
        .keyboardDismissable()
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func addMealType() async {
        let name = newMealTypeName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        do {
            let mealType = try await api.createMealType(name: name, sortOrder: mealTypes.count + 1)
            mealTypes.append(mealType)
            newMealTypeName = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteMealType(_ mealType: MealType) async {
        do {
            try await api.deleteMealType(id: mealType.id)
            mealTypes.removeAll { $0.id == mealType.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Visible Nutrients View

struct VisibleNutrientsView: View {
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Binding var preferences: Preferences

    @State private var selectedNutrients: Set<String> = []
    @State private var isDirty = false
    @State private var isSaving = false

    private static let nutrientCategories: [(String, [(String, String)])] = [
        ("Fat Breakdown", [
            ("saturatedFat", "Saturated Fat"), ("monounsaturatedFat", "Monounsaturated Fat"),
            ("polyunsaturatedFat", "Polyunsaturated Fat"), ("transFat", "Trans Fat"),
            ("cholesterol", "Cholesterol"), ("omega3", "Omega-3"), ("omega6", "Omega-6"),
        ]),
        ("Sugar & Carbs", [
            ("sugar", "Sugar"), ("addedSugars", "Added Sugars"),
            ("sugarAlcohols", "Sugar Alcohols"), ("starch", "Starch"),
        ]),
        ("Minerals", [
            ("sodium", "Sodium"), ("potassium", "Potassium"), ("calcium", "Calcium"),
            ("iron", "Iron"), ("magnesium", "Magnesium"), ("phosphorus", "Phosphorus"),
            ("zinc", "Zinc"), ("copper", "Copper"), ("manganese", "Manganese"),
            ("selenium", "Selenium"), ("iodine", "Iodine"), ("fluoride", "Fluoride"),
            ("chromium", "Chromium"), ("molybdenum", "Molybdenum"), ("chloride", "Chloride"),
        ]),
        ("Vitamins", [
            ("vitaminA", "Vitamin A"), ("vitaminC", "Vitamin C"), ("vitaminD", "Vitamin D"),
            ("vitaminE", "Vitamin E"), ("vitaminK", "Vitamin K"), ("vitaminB1", "Vitamin B1"),
            ("vitaminB2", "Vitamin B2"), ("vitaminB3", "Vitamin B3"), ("vitaminB5", "Vitamin B5"),
            ("vitaminB6", "Vitamin B6"), ("vitaminB7", "Vitamin B7"), ("vitaminB9", "Vitamin B9"),
            ("vitaminB12", "Vitamin B12"),
        ]),
        ("Other", [
            ("caffeine", "Caffeine"), ("alcohol", "Alcohol"), ("water", "Water"), ("salt", "Salt"),
        ]),
    ]

    private static var allNutrientKeys: [String] {
        nutrientCategories.flatMap { $0.1.map(\.0) }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    Button(L10n.selectAll) {
                        selectedNutrients = Set(Self.allNutrientKeys)
                        isDirty = true
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button(L10n.deselectAll) {
                        selectedNutrients = []
                        isDirty = true
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            ForEach(Self.nutrientCategories, id: \.0) { category, nutrients in
                Section(category) {
                    ForEach(nutrients, id: \.0) { key, label in
                        Toggle(label, isOn: Binding(
                            get: { selectedNutrients.contains(key) },
                            set: { checked in
                                if checked {
                                    selectedNutrients.insert(key)
                                } else {
                                    selectedNutrients.remove(key)
                                }
                                isDirty = true
                            }
                        ))
                    }
                }
            }
        }
        .brandForm()
        .navigationTitle(L10n.visibleNutrients)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isDirty {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.save) {
                        Task { await saveNutrients() }
                    }
                    .disabled(isSaving)
                    .fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            selectedNutrients = Set(preferences.visibleNutrients)
        }
    }

    private func saveNutrients() async {
        isSaving = true
        var update = PreferencesUpdate()
        update.visibleNutrients = Array(selectedNutrients)
        preferences = await (try? preferencesRepository.update(update))
            ?? (preferencesRepository.preferences() ?? .defaults)
        isDirty = false
        isSaving = false
    }
}
