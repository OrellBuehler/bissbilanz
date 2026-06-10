import SwiftData
import SwiftUI

@main
struct BissbilanzApp: App {
    @State private var authManager: AuthManager
    @State private var api: BissbilanzAPI
    @State private var entryRepository: EntryRepository
    @State private var foodRepository: FoodRepository
    @State private var recipeRepository: RecipeRepository
    @State private var weightRepository: WeightRepository
    @State private var supplementRepository: SupplementRepository
    @State private var goalsRepository: GoalsRepository
    @State private var preferencesRepository: PreferencesRepository
    private let modelContainer: ModelContainer

    init() {
        let auth = AuthManager()
        let api = BissbilanzAPI(authManager: auth)

        let container: ModelContainer
        do {
            container = try LocalStore.makeContainer()
        } catch {
            // The on-disk store is unusable (e.g. failed migration). Fall back
            // to an in-memory store rather than crashing — data refreshes from
            // the API while the app is online.
            do {
                container = try LocalStore.makeContainer(inMemory: true)
            } catch {
                fatalError("Failed to create SwiftData container: \(error)")
            }
        }
        modelContainer = container
        let context = container.mainContext

        _authManager = State(wrappedValue: auth)
        _api = State(wrappedValue: api)
        _entryRepository = State(wrappedValue: EntryRepository(context: context, api: api))
        _foodRepository = State(wrappedValue: FoodRepository(context: context, api: api))
        _recipeRepository = State(wrappedValue: RecipeRepository(context: context, api: api))
        _weightRepository = State(wrappedValue: WeightRepository(context: context, api: api))
        _supplementRepository = State(wrappedValue: SupplementRepository(context: context, api: api))
        _goalsRepository = State(wrappedValue: GoalsRepository(context: context, api: api))
        _preferencesRepository = State(wrappedValue: PreferencesRepository(context: context, api: api))
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isAuthenticated {
                    ContentView()
                } else {
                    LoginView()
                }
            }
            .environment(authManager)
            .environment(api)
            .environment(entryRepository)
            .environment(foodRepository)
            .environment(recipeRepository)
            .environment(weightRepository)
            .environment(supplementRepository)
            .environment(goalsRepository)
            .environment(preferencesRepository)
            .modelContainer(modelContainer)
            .onOpenURL { url in
                Task {
                    await authManager.handleCallback(url: url)
                }
            }
        }
    }
}
