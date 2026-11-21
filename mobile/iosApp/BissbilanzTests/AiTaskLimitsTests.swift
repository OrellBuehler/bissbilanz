@testable import Bissbilanz
import Foundation
import Testing
import UIKit

@Suite("AI Task Limits Tests")
struct AiTaskLimitsTests {
    private func image(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    @Test("A task takes ten photos, the limit the server enforces")
    func photoLimit() {
        #expect(AiTaskLimits.maxPhotos == 10)
    }

    @Test("An on-device estimate never reads more photos than a task carries")
    func estimateLimit() {
        #expect(MealEstimator.maxEstimatePhotos <= AiTaskLimits.maxPhotos)
        #expect(MealEstimator.maxEstimatePhotos == 5)
    }

    @Test("A large capture is held at the size the server keeps")
    func downscalesLargeCaptures() async {
        let small = await image(width: 3000, height: 2000).downscaledForAttachment()
        #expect(abs(max(small.size.width, small.size.height) - AiTaskLimits.photoMaxDimension) < 1)
        #expect(small.size.width > small.size.height)
    }

    @Test("A small photo is left at its size")
    func keepsSmallPhotos() async {
        let kept = await image(width: 400, height: 300).downscaledForAttachment()
        #expect(kept.size == CGSize(width: 400, height: 300))
    }

    @Test("The count and limit lines name both numbers")
    func countLines() {
        #expect(L10n.aiTaskPhotoCount(3, 10).contains("3"))
        #expect(L10n.aiTaskPhotoCount(3, 10).contains("10"))
        #expect(L10n.aiTaskPhotoLimitReached(10).contains("10"))
        #expect(L10n.aiTaskPhotoHint(AiTaskLimits.maxPhotos).contains("10"))
    }
}
