@testable import Bissbilanz
import Foundation
import Testing

@Suite("Food enrichment rules")
struct FoodEnrichmentRulesTests {
    private func food(_ extra: [String: Any] = [:]) throws -> Food {
        var fields: [String: Any] = [
            "id": "f1", "userId": "u1", "name": "Mine", "servingSize": 100, "servingUnit": "g",
            "calories": 100, "protein": 1, "carbs": 2, "fat": 3, "fiber": 4, "isFavorite": false, "barcode": "111",
        ]
        fields.merge(extra) { _, new in new }
        return try JSONPatch.decode(Food.self, from: fields)
    }

    private func product(_ extra: [String: Any] = [:]) throws -> Food {
        var fields: [String: Any] = [
            "id": "111", "userId": "", "name": "Theirs", "brand": "Acme", "servingSize": 100, "servingUnit": "g",
            "calories": 500, "protein": 50, "carbs": 50, "fat": 50, "fiber": 50, "isFavorite": false, "barcode": "111",
        ]
        fields.merge(extra) { _, new in new }
        return try JSONPatch.decode(Food.self, from: fields)
    }

    private func status(_ state: String?, updated: Int = 0) throws -> FoodEnrichmentStatus {
        let job = state.map {
            """
            {"state": "\($0)", "total": 4, "processed": 2, "updated": \(updated), "notFound": 1, "failed": 0,
             "startedAt": "2026-11-12T08:00:00.000Z", "finishedAt": null}
            """
        } ?? "null"
        let json = Data(#"{"candidates": 4, "job": \#(job)}"#.utf8)
        return try JSONDecoder().decode(FoodEnrichmentStatus.self, from: json)
    }

    private func scale(_ size: Double, _ unit: ServingUnit, is expected: Double) -> Bool {
        guard let value = FoodEnrichmentRules.nutrientScale(servingSize: size, unit: unit) else { return false }
        return abs(value - expected) < 1e-9
    }

    @Test("Nutrients scale from per 100 g/ml to the serving for mass and volume units only")
    func nutrientScale() {
        #expect(scale(100, .g, is: 1))
        #expect(scale(30, .g, is: 0.3))
        #expect(scale(1, .kg, is: 10))
        #expect(scale(250, .ml, is: 2.5))
        #expect(scale(33, .cl, is: 3.3))
        #expect(scale(1, .l, is: 10))
        #expect(scale(1, .oz, is: 0.28349523125))
        #expect(scale(1, .lb, is: 4.5359237))
        #expect(scale(1, .flOz, is: 0.295735295625))
        #expect(FoodEnrichmentRules.nutrientScale(servingSize: 1, unit: .cup) == nil)
        #expect(FoodEnrichmentRules.nutrientScale(servingSize: 1, unit: .tbsp) == nil)
        #expect(FoodEnrichmentRules.nutrientScale(servingSize: 1, unit: .tsp) == nil)
        #expect(FoodEnrichmentRules.nutrientScale(servingSize: 0, unit: .g) == nil)
        #expect(FoodEnrichmentRules.nutrientScale(servingSize: -5, unit: .g) == nil)
        #expect(FoodEnrichmentRules.nutrientScale(servingSize: .infinity, unit: .g) == nil)
    }

    @Test("Scores come from Open Food Facts; ingredients, additives and image only fill empty fields")
    func scoresReplaceTextFillsEmpty() throws {
        let offered = try product([
            "nutriScore": "b", "novaGroup": 4, "additives": ["en:e322"], "ingredientsText": "Wheat",
            "imageUrl": "https://images.openfoodfacts.org/front.jpg",
        ])

        let empty = try FoodEnrichmentRules.patch(for: food(["nutriScore": "d", "novaGroup": 2]), product: offered)
        #expect(empty["nutriScore"] as? String == "b")
        #expect(empty["novaGroup"] as? Int == 4)
        #expect(empty["additives"] as? [String] == ["en:e322"])
        #expect(empty["ingredientsText"] as? String == "Wheat")
        #expect(empty["imageUrl"] as? String == "https://images.openfoodfacts.org/front.jpg")

        let filled = try FoodEnrichmentRules.patch(for: food([
            "nutriScore": "b", "novaGroup": 4, "additives": ["en:e100"], "ingredientsText": "Mine",
            "imageUrl": "/uploads/mine.webp",
        ]), product: offered)
        #expect(filled.isEmpty)
    }

    @Test("Blank ingredients and an empty additive list count as empty")
    func blankCountsAsEmpty() throws {
        let patch = try FoodEnrichmentRules.patch(
            for: food(["ingredientsText": "   ", "additives": [String]()]),
            product: product(["ingredientsText": "Oats", "additives": ["en:e330"]])
        )
        #expect(patch["ingredientsText"] as? String == "Oats")
        #expect(patch["additives"] as? [String] == ["en:e330"])
    }

    @Test("Blank product text never overwrites anything")
    func blankProductTextIsIgnored() throws {
        let patch = try FoodEnrichmentRules.patch(
            for: food(),
            product: product(["ingredientsText": " ", "additives": [String](), "nutriScore": ""])
        )
        #expect(patch.isEmpty)
    }

    @Test("Only https images from the Open Food Facts hosts are taken")
    func productImageHosts() {
        #expect(FoodEnrichmentRules.productImageUrl("https://images.openfoodfacts.org/a.jpg") != nil)
        #expect(FoodEnrichmentRules.productImageUrl("https://IMAGES.openfoodfacts.net/a.jpg") != nil)
        #expect(FoodEnrichmentRules.productImageUrl("http://images.openfoodfacts.org/a.jpg") == nil)
        #expect(FoodEnrichmentRules.productImageUrl("https://example.com/a.jpg") == nil)
        #expect(FoodEnrichmentRules.productImageUrl(nil) == nil)
        let long = "https://images.openfoodfacts.org/" + String(repeating: "a", count: 2048)
        #expect(FoodEnrichmentRules.productImageUrl(long) == nil)
    }

    @Test("Extended nutrients are scaled to the serving, rounded, and never replace a stored value")
    func nutrientsScaledAndFillOnly() throws {
        let patch = try FoodEnrichmentRules.patch(
            for: food(["servingSize": 30, "sugar": 5]),
            product: product(["sugar": 20, "sodium": 400, "vitaminB12": 0.7, "salt": 1.234567])
        )
        #expect(patch["sugar"] == nil)
        #expect(patch["sodium"] as? Double == 120)
        #expect(patch["vitaminB12"] as? Double == 0.21)
        #expect(patch["salt"] as? Double == 0.3704)
    }

    @Test("Identity and core macros are never part of the patch")
    func coreFieldsUntouched() throws {
        let patch = try FoodEnrichmentRules.patch(for: food(), product: product(["sugar": 3]))
        for key in ["name", "brand", "servingSize", "servingUnit", "calories", "protein", "carbs", "fat", "fiber",
                    "barcode", "isFavorite", "id", "userId"]
        {
            #expect(patch[key] == nil, "\(key) must stay the user's")
        }
        #expect(patch["sugar"] as? Double == 3)
    }

    @Test("Units without a mass or volume basis keep their nutrients but still take the scores")
    func unscalableUnitsSkipNutrients() throws {
        let patch = try FoodEnrichmentRules.patch(
            for: food(["servingUnit": "cup", "servingSize": 1]),
            product: product(["sugar": 20, "nutriScore": "c"])
        )
        #expect(patch["sugar"] == nil)
        #expect(patch["nutriScore"] as? String == "c")
    }

    @Test("Negative product nutrients are skipped")
    func negativeNutrientsSkipped() throws {
        let patch = try FoodEnrichmentRules.patch(for: food(), product: product(["sugar": -1, "fluoride": 0]))
        #expect(patch["sugar"] == nil)
        #expect(patch["fluoride"] as? Double == 0)
    }

    @Test("The checked marker excludes a food for 30 days")
    func checkedMarker() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        func checked(daysAgo days: Double) throws -> Food {
            try food(["offCheckedAt": DateFormatting.isoDateTimeString(from: now.addingTimeInterval(-days * 86400))])
        }
        #expect(!FoodEnrichmentRules.needsEnrichment(try checked(daysAgo: 1), now: now))
        #expect(!FoodEnrichmentRules.needsEnrichment(try checked(daysAgo: 29.9), now: now))
        #expect(FoodEnrichmentRules.needsEnrichment(try checked(daysAgo: 30.1), now: now))
        #expect(!FoodEnrichmentRules.needsEnrichment(try checked(daysAgo: -1), now: now))
        let serverStamped = try food(["offCheckedAt": "2026-11-12T08:00:00.123Z"])
        let dayAfter = try #require(DateFormatting.isoDateTime(from: "2026-11-13T08:00:00Z"))
        #expect(!FoodEnrichmentRules.needsEnrichment(serverStamped, now: dayAfter))
        #expect(FoodEnrichmentRules.needsEnrichment(serverStamped, now: dayAfter.addingTimeInterval(31 * 86400)))
        #expect(FoodEnrichmentRules.needsEnrichment(try food(["offCheckedAt": "yesterday"]), now: now))
    }

    @Test("Complete foods and foods without a barcode are never candidates")
    func candidateRule() throws {
        #expect(FoodEnrichmentRules.needsEnrichment(try food()))
        #expect(!FoodEnrichmentRules.needsEnrichment(try food(["barcode": " "])))
        #expect(!FoodEnrichmentRules.needsEnrichment(try food([
            "nutriScore": "a", "novaGroup": 1, "ingredientsText": "Milk",
        ])))
        #expect(FoodEnrichmentRules.needsEnrichment(try food([
            "nutriScore": "a", "novaGroup": 1, "ingredientsText": "\n",
        ])))
    }

    @Test("A barcode edit clears the checked marker; other edits keep it")
    func editPatchClearsMarkerOnBarcodeChange() throws {
        let checked = try food(["offCheckedAt": "2026-11-12T08:00:00Z"])

        let changed = FoodEnrichmentRules.editPatch(["barcode": "222", "name": "New"], onto: checked)
        #expect(changed["offCheckedAt"] is NSNull)
        #expect(try JSONPatch.merged(Food.self, base: checked, patch: changed).offCheckedAt == nil)

        #expect(FoodEnrichmentRules.editPatch(["barcode": "111"], onto: checked)["offCheckedAt"] == nil)
        #expect(FoodEnrichmentRules.editPatch(["name": "New"], onto: checked)["offCheckedAt"] == nil)
        let kept = FoodEnrichmentRules.editPatch(["name": "New"], onto: checked)
        #expect(try JSONPatch.merged(Food.self, base: checked, patch: kept).offCheckedAt == "2026-11-12T08:00:00Z")
    }

    @Test("Retries back off like the server worker")
    func backoff() {
        #expect(FoodEnrichmentRules.backoff(attempt: 1, retryAfter: nil) == 5)
        #expect(FoodEnrichmentRules.backoff(attempt: 2, retryAfter: nil) == 15)
        #expect(FoodEnrichmentRules.backoff(attempt: 3, retryAfter: nil) == 45)
        #expect(FoodEnrichmentRules.backoff(attempt: 4, retryAfter: nil) == 120)
        #expect(FoodEnrichmentRules.backoff(attempt: 1, retryAfter: 2) == 5)
        #expect(FoodEnrichmentRules.backoff(attempt: 1, retryAfter: 30) == 30)
        #expect(FoodEnrichmentRules.backoff(attempt: 1, retryAfter: 900) == 120)
    }

    @Test("Polling slows down after a failure and waits out a rate limit")
    func pollDelay() {
        #expect(FoodEnrichmentRules.pollDelay(failures: 0, rateLimitedFor: nil) == 3)
        #expect(FoodEnrichmentRules.pollDelay(failures: 2, rateLimitedFor: nil) == 6)
        #expect(FoodEnrichmentRules.pollDelay(failures: 1, rateLimitedFor: 20) == 20)
        #expect(FoodEnrichmentRules.pollDelay(failures: 0, rateLimitedFor: -4) == 3)
    }

    @Test("Job states: queued and running are active, anything else is finished")
    func jobPhases() {
        #expect(FoodEnrichmentPhase("queued") == .queued)
        #expect(FoodEnrichmentPhase("running").isActive)
        #expect(FoodEnrichmentPhase("queued").isActive)
        #expect(!FoodEnrichmentPhase("completed").isActive)
        #expect(!FoodEnrichmentPhase("cancelled").isActive)
        #expect(!FoodEnrichmentPhase("failed").isActive)
        #expect(FoodEnrichmentPhase("paused_for_maintenance") == .unknown)
        #expect(!FoodEnrichmentPhase("paused_for_maintenance").isActive)
    }

    @Test("A run finishes when an active job turns into any other state")
    func didFinish() throws {
        let running = try status("running")
        #expect(FoodEnrichmentRules.didFinish(previous: running, next: try status("completed", updated: 2)))
        #expect(FoodEnrichmentRules.didFinish(previous: running, next: try status("something_new")))
        #expect(FoodEnrichmentRules.didFinish(previous: try status("queued"), next: try status("cancelled")))
        #expect(!FoodEnrichmentRules.didFinish(previous: running, next: running))
        #expect(!FoodEnrichmentRules.didFinish(previous: nil, next: try status("completed")))
        #expect(!FoodEnrichmentRules.didFinish(previous: try status("completed"), next: try status("completed")))
        #expect(!FoodEnrichmentRules.didFinish(previous: try status(nil), next: try status(nil)))
    }

    @Test("Unknown enrich outcomes read as unchanged")
    func outcomes() {
        #expect(FoodEnrichOutcome("updated") == .updated)
        #expect(FoodEnrichOutcome("not_found") == .notFound)
        #expect(FoodEnrichOutcome("unchanged") == .unchanged)
        #expect(FoodEnrichOutcome("labels_only") == .unchanged)
    }

    @Test("Failure codes, statuses and Retry-After map to failures")
    func failureClassification() {
        let classify = FoodEnrichmentFailure.classify(status:code:retryAfter:)
        #expect(classify(429, nil, "12") == .rateLimited(retryAfter: 12))
        #expect(classify(429, nil, nil) == .rateLimited(retryAfter: 60))
        #expect(classify(400, "no_barcode", nil) == .noBarcode)
        #expect(classify(404, nil, nil) == .foodNotFound)
        #expect(classify(503, "off_unavailable", nil) == .offUnavailable(retryAfter: nil))
        #expect(classify(400, "brand_new_code", nil) == .failed(status: 400))
        let changedBody = Data(#"{"error": "x", "code": "food_changed"}"#.utf8)
        #expect(FoodEnrichmentFailure(status: 409, body: changedBody, retryAfter: nil) == .foodChanged)
        #expect(FoodEnrichmentFailure(status: 502, body: Data("<html>".utf8), retryAfter: nil) == .failed(status: 502))
        #expect(!FoodEnrichmentFailure.failed(status: 500).isExpected)
        #expect(FoodEnrichmentFailure.rateLimited(retryAfter: 1).isExpected)
    }

    @Test("Open Food Facts answers are classified like the server's lookup")
    func offClassification() throws {
        let found = OpenFoodFactsClient.classify(
            status: 200,
            data: Data(#"{"status": 1, "product": {"product_name": "Oats", "nutriments": {}}}"#.utf8),
            retryAfterHeader: nil,
            barcode: "111"
        )
        guard case let .found(product) = found else {
            Issue.record("expected a product, got \(found)")
            return
        }
        #expect(product.name == "Oats")
        #expect(OpenFoodFactsClient.classify(
            status: 404, data: Data(), retryAfterHeader: nil, barcode: "1"
        ) == .notFound)
        #expect(OpenFoodFactsClient.classify(
            status: 200, data: Data(#"{"status": 0}"#.utf8), retryAfterHeader: nil, barcode: "1"
        ) == .notFound)
        #expect(OpenFoodFactsClient.classify(
            status: 200, data: Data(#"{"product": {}}"#.utf8), retryAfterHeader: nil, barcode: "1"
        ) == .invalid)
        #expect(OpenFoodFactsClient.classify(
            status: 200, data: Data("<html>".utf8), retryAfterHeader: nil, barcode: "1"
        ) == .unavailable(retryAfter: nil))
        #expect(OpenFoodFactsClient.classify(
            status: 429, data: Data(), retryAfterHeader: "40", barcode: "1"
        ) == .unavailable(retryAfter: 40))
        #expect(OpenFoodFactsClient.classify(
            status: 502, data: Data(), retryAfterHeader: nil, barcode: "1"
        ) == .unavailable(retryAfter: nil))
    }

    @Test("Sweep errors are retried, skipped, failed or treated as a stop")
    func sweepSteps() {
        #expect(FoodEnrichmentController.sweepStep(for: CancellationError()) == .cancel)
        #expect(FoodEnrichmentController.sweepStep(for: URLError(.cancelled)) == .cancel)
        #expect(FoodEnrichmentController.sweepStep(for: URLError(.timedOut)) == .retry(after: nil, reason: "timeout"))
        #expect(FoodEnrichmentController.sweepStep(for: FoodEnrichmentFailure.offUnavailable(retryAfter: 9))
            == .retry(after: 9, reason: "off_unavailable"))
        #expect(FoodEnrichmentController.sweepStep(for: FoodEnrichmentFailure.foodChanged) == .skip)
        #expect(FoodEnrichmentController.sweepStep(for: FoodEnrichmentFailure.foodNotFound) == .skip)
        #expect(FoodEnrichmentController.sweepStep(for: FoodEnrichmentFailure.offInvalidResponse)
            == .fail("off_invalid_response"))
        if case .fail = FoodEnrichmentController.sweepStep(for: APIError.badRequest(nil)) {} else {
            Issue.record("a non-transport error must not be retried")
        }
    }

    @Test("User-facing notices and messages for failures")
    func notices() {
        #expect(FoodEnrichmentController.failureNotice(for: FoodEnrichmentFailure.rateLimited(retryAfter: 12.2))
            == .rateLimited(seconds: 13))
        #expect(FoodEnrichmentController.failureNotice(for: APIError.networkError(URLError(.notConnectedToInternet)))
            == .offline)
        #expect(FoodEnrichmentController.failureNotice(for: FoodEnrichmentFailure.failed(status: 500)) == .actionFailed)
        #expect(L10n.enrichFailureMessage(for: FoodEnrichmentFailure.pendingChanges) == L10n.enrichPendingChanges)
        #expect(L10n.enrichFailureMessage(for: FoodEnrichmentFailure.foodChanged) == L10n.enrichFoodChanged)
        #expect(L10n.enrichFailureMessage(for: FoodEnrichmentFailure.offUnavailable(retryAfter: nil))
            == L10n.enrichUnavailable)
        #expect(L10n.enrichFailureMessage(for: URLError(.notConnectedToInternet)) == L10n.enhanceFoodsOffline)
        #expect(L10n.enrichFailureMessage(for: FoodEnrichmentFailure.failed(status: 500)) == L10n.enrichFailed)
    }

    @Test("Last-run summaries name the outcome of the run")
    func lastRunText() throws {
        let cancelled = try #require(try status("cancelled").job)
        let stoppedText = L10n.enhanceFoodsLastCancelled(date: nil, processed: 2, total: 4)
        #expect(EnhanceFoodsView.lastRunText(cancelled) == stoppedText)
        let failed = try #require(try status("failed").job)
        let failedText = L10n.enhanceFoodsLastFailed(date: nil, processed: 2, total: 4)
        #expect(EnhanceFoodsView.lastRunText(failed) == failedText)
        let unknown = try #require(try status("archived").job)
        #expect(EnhanceFoodsView.lastRunText(unknown) == L10n.enhanceFoodsLastCompleted(date: nil, processed: 2))
        #expect(EnhanceFoodsView.fraction(3, of: 0) == 0)
        #expect(EnhanceFoodsView.fraction(5, of: 4) == 1)
        #expect(EnhanceFoodsView.sweepSummary(LocalSweepProgress()) == nil)
        #expect(EnhanceFoodsView.sweepSummary(LocalSweepProgress(state: .completed, total: 2, done: 2))
            == L10n.enhanceFoodsLastCompleted(date: nil, processed: 2))
        #expect(EnhanceFoodsView.sweepSummary(LocalSweepProgress(state: .offline)) == nil)
    }
}
