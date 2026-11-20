@testable import Bissbilanz
import Foundation
import Testing

@Suite("Chat notices")
struct ChatNoticeTests {
    private static func rejection(
        _ status: Int,
        code: String? = nil,
        error: String = "Refused",
        retryAfter: TimeInterval? = nil
    ) -> ChatFailure {
        .rejected(ChatRejection(
            status: status,
            body: ChatErrorResponse(error: error, code: code),
            retryAfter: retryAfter
        ))
    }

    @Test("Message hints follow the documented status and reason table")
    func messageHints() {
        let cases: [(String, String?, ChatNotice?)] = [
            ("in_progress", nil, nil),
            ("completed", nil, nil),
            ("completed", "output_limit", .cutOff),
            ("completed", "iteration_limit", .iterationLimit),
            ("completed", "something_new", .incomplete),
            ("failed", "not_configured", .unavailable),
            ("failed", "disabled", .unavailable),
            ("failed", "no_access", .unavailable),
            ("failed", "user_budget_exhausted", .budgetExhausted),
            ("failed", "global_budget_exhausted", .budgetExhausted),
            ("failed", "refusal", .refusal),
            ("failed", "conversation_too_long", .conversationTooLong),
            ("failed", "api_error", .failed),
            ("failed", "internal_error", .failed),
            ("failed", nil, .failed),
            ("cancelled", "user_cancelled", .stopped),
            ("cancelled", "superseded", nil),
            ("cancelled", "action_expired", .actionExpired),
            ("interrupted", "server_restart", .interrupted),
            ("interrupted", nil, .interrupted),
            ("paused", nil, .failed)
        ]
        for (status, reason, expected) in cases {
            #expect(ChatNotice.forMessage(status: status, reason: reason) == expected, "\(status)/\(reason ?? "nil")")
        }
    }

    @Test("Rejected sends map their codes")
    func rejectionCodes() {
        let cases: [(ChatFailure, ChatNotice)] = [
            (Self.rejection(403, code: "budget_exhausted"), .budgetExhausted),
            (Self.rejection(403, code: "chat_unavailable"), .unavailable),
            (Self.rejection(409, code: "conversation_too_long"), .conversationTooLong),
            (Self.rejection(429, code: "daily_limit_reached", retryAfter: 3600), .dailyLimit(retryAfter: 3600)),
            (Self.rejection(409, code: "run_active"), .runActive),
            (Self.rejection(400, code: "invalid_image"), .invalidImage),
            (Self.rejection(404, code: "conversation_not_found"), .conversationMissing),
            (Self.rejection(409, code: "action_not_pending"), .actionNotPending),
            (Self.rejection(409, code: "action_expired"), .actionExpired),
            (Self.rejection(404, code: "action_not_found"), .actionNotPending),
            (Self.rejection(429), .rateLimited),
            (Self.rejection(403), .unavailable),
            (Self.rejection(404), .conversationMissing),
            (Self.rejection(400), .failed),
            (Self.rejection(500), .failed),
            (Self.rejection(409, code: "brand_new", error: "Try later"), .server("Try later"))
        ]
        for (failure, expected) in cases {
            #expect(ChatNotice.forFailure(failure) == expected)
        }
        #expect(ChatNotice.conversationTooLong.offersNewChat)
        #expect(!ChatNotice.runActive.offersNewChat)
    }

    @Test("Transport failures read as offline or signed out")
    func transport() {
        #expect(ChatNotice.forFailure(ChatFailure.transport(.networkError(URLError(.notConnectedToInternet)))) == .offline)
        #expect(ChatNotice.forFailure(ChatFailure.transport(.unauthorized)) == .signedOut)
        #expect(ChatNotice.forFailure(APIError.networkError(URLError(.timedOut))) == .offline)
        #expect(ChatNotice.forFailure(URLError(.cannotConnectToHost)) == .offline)
        #expect(ChatNotice.forFailure(CancellationError()) == .failed)
    }

    @Test("An unavailable capability says why")
    func capability() {
        #expect(ChatNotice.forCapability(ChatCapability(available: true)) == nil)
        #expect(ChatNotice.forCapability(ChatCapability(available: false, blockedReason: "user_budget_exhausted"))
            == .budgetExhausted)
        #expect(ChatNotice.forCapability(ChatCapability(available: false, blockedReason: "global_budget_exhausted"))
            == .budgetExhausted)
        #expect(ChatNotice.forCapability(ChatCapability(available: false, blockedReason: "no_access")) == .noAccess)
        #expect(ChatNotice.forCapability(ChatCapability(available: false, blockedReason: "disabled")) == .unavailable)
        #expect(ChatNotice.forCapability(ChatCapability(available: false)) == .unavailable)
        #expect(ChatNotice.forCapability(ChatCapability(available: false, blockedReason: "new_reason")) == .unavailable)
    }

    @Test("Every notice has text")
    func messages() {
        let notices: [ChatNotice] = [
            .cutOff, .iterationLimit, .incomplete, .unavailable, .noAccess, .budgetExhausted, .refusal,
            .conversationTooLong, .failed, .stopped, .actionExpired, .actionNotPending, .interrupted,
            .dailyLimit(retryAfter: nil), .dailyLimit(retryAfter: 120), .rateLimited, .runActive, .invalidImage,
            .conversationMissing, .offline, .signedOut, .server("Server says no")
        ]
        for notice in notices {
            #expect(!notice.message.isEmpty)
        }
        #expect(ChatNotice.server("Server says no").message == "Server says no")
    }

    @Test("A broken stream backs off, a rate limit waits, a dead session stops")
    func followRecovery() {
        #expect(ChatStore.followRecovery(after: Self.rejection(404)) == .missing)
        #expect(ChatStore.followRecovery(after: Self.rejection(429, retryAfter: 12)) == .wait(12))
        #expect(ChatStore.followRecovery(after: Self.rejection(429)) == .wait(30))
        #expect(ChatStore.followRecovery(after: Self.rejection(403)) == .stop)
        #expect(ChatStore.followRecovery(after: Self.rejection(502)) == .backOff)
        #expect(ChatStore.followRecovery(after: ChatFailure.transport(.unauthorized)) == .stop)
        #expect(ChatStore.followRecovery(after: ChatFailure.transport(.updateRequired(minVersion: "9.0.0"))) == .stop)
        #expect(ChatStore.followRecovery(after: ChatFailure.transport(.networkError(URLError(.timedOut)))) == .backOff)
    }

    @Test("Reconnects back off from 3 s, doubling up to 30 s")
    func backoff() {
        #expect((1 ... 6).map { ChatStore.backoff(failures: $0, base: 3) } == [3, 6, 12, 24, 30, 30])
        #expect(ChatStore.backoff(failures: 1, base: 0) == 1)
    }
}
