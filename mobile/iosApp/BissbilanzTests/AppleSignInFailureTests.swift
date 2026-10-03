import AuthenticationServices
@testable import Bissbilanz
import Testing

@Suite("Apple Sign-In Failure Tests")
struct AppleSignInFailureTests {
    @Test("Cancelling is silent")
    func cancelIsSilent() {
        #expect(AppleSignInFailure.classify(.canceled) == .cancelled)
        #expect(!AppleSignInFailure.shouldReport(.canceled, hasUnderlying: false))
        #expect(!AppleSignInFailure.shouldReport(.canceled, hasUnderlying: true))
    }

    @Test("A device without an Apple Account gets the unavailable message")
    func noAppleAccountIsUnavailable() {
        #expect(AppleSignInFailure.classify(.unknown) == .unavailable)
        #expect(AppleSignInFailure.classify(.notInteractive) == .unavailable)
    }

    @Test("A bare unknown error is expected and not reported")
    func bareUnknownIsNotReported() {
        #expect(!AppleSignInFailure.shouldReport(.unknown, hasUnderlying: false))
    }

    @Test("An unknown error with an underlying cause is still reported")
    func unknownWithUnderlyingIsReported() {
        #expect(AppleSignInFailure.shouldReport(.unknown, hasUnderlying: true))
    }

    @Test("Every other failure is shown as failed and reported")
    func otherFailuresAreReported() {
        for code: ASAuthorizationError.Code in [.failed, .invalidResponse, .notHandled] {
            #expect(AppleSignInFailure.classify(code) == .failed)
            #expect(AppleSignInFailure.shouldReport(code, hasUnderlying: false))
        }
        #expect(AppleSignInFailure.shouldReport(.notInteractive, hasUnderlying: false))
    }
}
