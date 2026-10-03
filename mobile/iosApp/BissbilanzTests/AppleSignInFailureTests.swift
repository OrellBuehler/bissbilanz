import AuthenticationServices
@testable import Bissbilanz
import Foundation
import Testing

@Suite("Apple Sign-In Failure Tests")
struct AppleSignInFailureTests {
    private let underlying = NSError(domain: "AKAuthenticationError", code: -7026)

    @Test("Cancelling is silent")
    func cancelIsSilent() {
        #expect(AppleSignInFailure.classify(.canceled) == .cancelled)
        #expect(!AppleSignInFailure.shouldReport(ASAuthorizationError(.canceled)))
        #expect(!AppleSignInFailure.shouldReport(
            ASAuthorizationError(.canceled, userInfo: [NSUnderlyingErrorKey: underlying])
        ))
    }

    @Test("A device without an Apple Account gets the unavailable message")
    func noAppleAccountIsUnavailable() {
        #expect(AppleSignInFailure.classify(.unknown) == .unavailable)
        #expect(AppleSignInFailure.classify(.notInteractive) == .unavailable)
    }

    @Test("A bare unknown error is expected and not reported")
    func bareUnknownIsNotReported() {
        let error = ASAuthorizationError(.unknown)
        #expect(AppleSignInFailure.underlyingError(of: error) == nil)
        #expect(!AppleSignInFailure.shouldReport(error))
    }

    @Test("An unknown error with an underlying cause is still reported")
    func unknownWithUnderlyingIsReported() {
        let error = ASAuthorizationError(.unknown, userInfo: [NSUnderlyingErrorKey: underlying])
        #expect(AppleSignInFailure.underlyingError(of: error)?.code == -7026)
        #expect(AppleSignInFailure.shouldReport(error))
    }

    @Test("Every other failure is reported")
    func otherFailuresAreReported() {
        for code: ASAuthorizationError.Code in [.failed, .invalidResponse, .notHandled] {
            #expect(AppleSignInFailure.classify(code) == .failed)
            #expect(AppleSignInFailure.shouldReport(ASAuthorizationError(code)))
        }
        #expect(AppleSignInFailure.shouldReport(ASAuthorizationError(.notInteractive)))
    }
}
