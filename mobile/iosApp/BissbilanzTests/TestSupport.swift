@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

// MARK: - Networking stub

/// Routes stubbed responses by "METHOD scheme://host/path". Stubs and the
/// request log are keyed by host, so every harness gets a unique fake host and
/// suites can run in parallel without clobbering each other. Unstubbed
/// requests get a 404 so API calls fail loudly instead of hanging.
final class StubURLProtocol: URLProtocol {
    struct Stub {
        let status: Int
        let body: Data
        var errorCode: URLError.Code?
        var delayMs: Int = 0
    }

    private nonisolated(unsafe) static var stubs: [String: Stub] = [:]
    private nonisolated(unsafe) static var recorded: [String] = []
    private nonisolated(unsafe) static var bodies: [String: [Data]] = [:]
    private static let lock = NSLock()

    static func stub(_ method: String, _ url: String, status: Int = 200, json: String = "{}", delayMs: Int = 0) {
        lock.lock()
        defer { lock.unlock() }
        stubs["\(method) \(url)"] = Stub(status: status, body: Data(json.utf8), delayMs: delayMs)
    }

    /// Makes "METHOD url" fail with a transport-level URLError.
    static func stubError(_ method: String, _ url: String, code: URLError.Code) {
        lock.lock()
        defer { lock.unlock() }
        stubs["\(method) \(url)"] = Stub(status: 0, body: Data(), errorCode: code)
    }

    /// Request bodies sent to "METHOD url", in arrival order.
    static func recordedBodies(_ method: String, _ url: String) -> [Data] {
        lock.lock()
        defer { lock.unlock() }
        return bodies["\(method) \(url)"] ?? []
    }

    /// Requests seen for `baseURL`, as "METHOD /path" in arrival order.
    static func recordedRequests(baseURL: String) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return recorded.compactMap { key in
            let parts = key.split(separator: " ", maxSplits: 1)
            guard parts.count == 2, parts[1].hasPrefix(baseURL) else { return nil }
            return "\(parts[0]) \(parts[1].dropFirst(baseURL.count))"
        }
    }

    override class func canInit(with _: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let url = request.url
        let base = url.map { "\($0.scheme ?? "")://\($0.host() ?? "")" } ?? ""
        let key = "\(request.httpMethod ?? "GET") \(base)\(url?.path ?? "")"
        let body = Self.body(of: request)
        Self.lock.lock()
        Self.recorded.append(key)
        if let body {
            Self.bodies[key, default: []].append(body)
        }
        let stub = Self.stubs[key]
        Self.lock.unlock()

        if let stub, stub.delayMs > 0 {
            // Delayed delivery lets tests interleave work with an in-flight request.
            let box = UncheckedSendableBox(value: self)
            Self.deliveryQueue.asyncAfter(deadline: .now() + .milliseconds(stub.delayMs)) {
                box.value.deliver(stub, url: url)
            }
        } else {
            deliver(stub, url: url)
        }
    }

    private func deliver(_ stub: Stub?, url: URL?) {
        if let code = stub?.errorCode {
            client?.urlProtocol(self, didFailWithError: URLError(code))
            return
        }
        let response = HTTPURLResponse(
            url: url ?? URL(string: "https://stub.local")!,
            statusCode: stub?.status ?? 404,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub?.body ?? Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    private static let deliveryQueue = DispatchQueue(label: "stub-delayed-delivery")

    override func stopLoading() {}

    /// URLSession hands POST bodies to protocols as a stream — drain it.
    private static func body(of request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 4096
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

/// Moves a non-Sendable value across a dispatch hop (delayed stub delivery).
private struct UncheckedSendableBox<T>: @unchecked Sendable {
    let value: T
}

// MARK: - Test harness

/// In-memory SwiftData store + stubbed API + isolated mode/connectivity/sync
/// stack. `autoDrain` is disabled so tests control queue draining explicitly.
@MainActor
struct RepositoryHarness {
    let container: ModelContainer
    let context: ModelContext
    let api: BissbilanzAPI
    let appMode: AppModeManager
    let connectivity: ConnectivityMonitor
    let syncManager: SyncManager
    let defaults: UserDefaults
    let baseURL: String

    init(mode: AppMode? = .synced, online: Bool = true) throws {
        baseURL = "https://stub-\(UUID().uuidString.lowercased()).local"
        container = try LocalStore.makeContainer(inMemory: true)
        context = container.mainContext
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        api = BissbilanzAPI(
            baseURL: baseURL,
            authManager: AuthManager(baseURL: baseURL),
            session: URLSession(configuration: configuration)
        )
        defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        appMode = AppModeManager(defaults: defaults)
        if let mode {
            appMode.setMode(mode)
        }
        connectivity = ConnectivityMonitor()
        connectivity.isOnline = online
        syncManager = SyncManager(context: context, api: api, appMode: appMode, connectivity: connectivity)
        syncManager.autoDrain = false
    }

    // MARK: Stubbing

    func stub(_ method: String, _ path: String, status: Int = 200, json: String = "{}", delayMs: Int = 0) {
        StubURLProtocol.stub(method, "\(baseURL)\(path)", status: status, json: json, delayMs: delayMs)
    }

    func stubError(_ method: String, _ path: String, code: URLError.Code) {
        StubURLProtocol.stubError(method, "\(baseURL)\(path)", code: code)
    }

    var recordedRequests: [String] {
        StubURLProtocol.recordedRequests(baseURL: baseURL)
    }

    func recordedBodies(_ method: String, _ path: String) -> [Data] {
        StubURLProtocol.recordedBodies(method, "\(baseURL)\(path)")
    }

    // MARK: Repositories

    var entryRepository: EntryRepository {
        EntryRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var foodRepository: FoodRepository {
        FoodRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var recipeRepository: RecipeRepository {
        RecipeRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var weightRepository: WeightRepository {
        WeightRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var supplementRepository: SupplementRepository {
        SupplementRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var goalsRepository: GoalsRepository {
        GoalsRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var preferencesRepository: PreferencesRepository {
        PreferencesRepository(context: context, api: api, appMode: appMode, syncManager: syncManager)
    }

    var migrator: LocalDataMigrator {
        LocalDataMigrator(context: context, api: api, appMode: appMode, syncManager: syncManager, defaults: defaults)
    }

    // MARK: Model factories

    func entry(
        id: String,
        date: String,
        mealType: String = "lunch",
        foodId: String? = nil,
        recipeId: String? = nil
    ) throws -> Entry {
        var dict: [String: Any] = [
            "id": id,
            "mealType": mealType,
            "servings": 1,
            "foodName": "Seed \(id)",
            "calories": 100,
            "date": date,
        ]
        if let foodId { dict["foodId"] = foodId }
        if let recipeId { dict["recipeId"] = recipeId }
        return try JSONPatch.decode(Entry.self, from: dict)
    }

    func food(id: String, name: String, isFavorite: Bool = false, barcode: String? = nil) throws -> Food {
        var dict: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": name,
            "servingSize": 100,
            "servingUnit": "g",
            "calories": 100,
            "protein": 10,
            "carbs": 20,
            "fat": 5,
            "fiber": 3,
            "isFavorite": isFavorite,
        ]
        if let barcode { dict["barcode"] = barcode }
        return try JSONPatch.decode(Food.self, from: dict)
    }

    func recipe(id: String, name: String, isFavorite: Bool = false, ingredientFoodId: String? = nil) throws -> Recipe {
        var dict: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": name,
            "totalServings": 2,
            "isFavorite": isFavorite,
        ]
        if let ingredientFoodId {
            dict["ingredients"] = [[
                "recipeId": id,
                "foodId": ingredientFoodId,
                "quantity": 100,
                "servingUnit": "g",
                "sortOrder": 0,
            ]]
        }
        return try JSONPatch.decode(Recipe.self, from: dict)
    }

    func weight(id: String, date: String, kg: Double) throws -> WeightEntry {
        try JSONPatch.decode(WeightEntry.self, from: [
            "id": id,
            "userId": "u1",
            "weightKg": kg,
            "entryDate": date,
        ])
    }

    func supplement(id: String, name: String, sortOrder: Int = 0) throws -> Supplement {
        try JSONPatch.decode(Supplement.self, from: [
            "id": id,
            "userId": "u1",
            "name": name,
            "scheduleType": "daily",
            "isActive": true,
            "sortOrder": sortOrder,
            "ingredients": [],
        ])
    }
}
