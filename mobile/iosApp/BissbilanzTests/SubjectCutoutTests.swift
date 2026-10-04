@testable import Bissbilanz
import CoreGraphics
import Foundation
import Testing
import UIKit

/// Covers the parts of "Remove background" that do not need the Vision model:
/// where the cut-out sits on its transparent square, and that a cut-out is
/// encoded as a PNG (alpha kept) while a plain photo stays a JPEG. The
/// segmentation itself needs a device model and is checked by hand.
struct SubjectCutoutTests {
    private func solidImage(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        let size = CGSize(width: width, height: height)
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }

    /// RGBA of the pixel at (x, y), counted from the top left.
    private func pixel(of image: UIImage, x: Int, y: Int) throws -> [UInt8] {
        let cgImage = try #require(image.cgImage)
        let width = cgImage.width
        let height = cgImage.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        #expect(drawn)
        let start = (y * width + x) * 4
        return Array(pixels[start ..< start + 4])
    }

    private func alpha(of image: UIImage, x: Int, y: Int) throws -> UInt8 {
        try pixel(of: image, x: x, y: y)[3]
    }

    @Test("A landscape image is centred on a square with margin on its long side")
    func squareCanvasLandscape() {
        let canvas = UIImage.squareCanvas(for: CGSize(width: 200, height: 100), margin: 0.06)
        #expect(canvas.side == 224)
        #expect(canvas.origin == CGPoint(x: 12, y: 62))
    }

    @Test("A portrait image is centred on a square with margin on its long side")
    func squareCanvasPortrait() {
        let canvas = UIImage.squareCanvas(for: CGSize(width: 100, height: 300), margin: 0.06)
        #expect(canvas.side == 336)
        #expect(canvas.origin == CGPoint(x: 118, y: 18))
    }

    @Test("A square image only gains the margin")
    func squareCanvasSquare() {
        let canvas = UIImage.squareCanvas(for: CGSize(width: 100, height: 100), margin: 0.06)
        #expect(canvas.side == 112)
        #expect(canvas.origin == CGPoint(x: 6, y: 6))
    }

    @Test("Padding yields a square with transparent corners and the subject in the middle")
    func paddedToSquareIsTransparentAroundSubject() throws {
        let padded = solidImage(width: 200, height: 100).paddedToSquare(margin: 0.06)
        #expect(padded.size == CGSize(width: 224, height: 224))
        #expect(try alpha(of: padded, x: 0, y: 0) == 0)
        #expect(try alpha(of: padded, x: 223, y: 223) == 0)
        #expect(try alpha(of: padded, x: 112, y: 112) == 255)
    }

    @Test("A cut-out is encoded as PNG with its transparency intact")
    func transparentPhotoIsPNG() throws {
        let padded = solidImage(width: 200, height: 100).paddedToSquare(margin: 0.06)
        let photo = try #require(padded.downscaledEncodedPhoto(maxDimension: 800, quality: 0.85, transparent: true))
        #expect(photo.isPNG)
        #expect(photo.filename == "food.png")
        #expect(photo.fileExtension == "png")
        #expect(Array(photo.data.prefix(4)) == [0x89, 0x50, 0x4E, 0x47])
        let decoded = try #require(UIImage(data: photo.data))
        #expect(try alpha(of: decoded, x: 0, y: 0) == 0)
    }

    @Test("A plain photo is still encoded as JPEG")
    func opaquePhotoIsJPEG() throws {
        let photo = try #require(
            solidImage(width: 200, height: 100).downscaledEncodedPhoto(maxDimension: 800, quality: 0.85, transparent: false)
        )
        #expect(!photo.isPNG)
        #expect(photo.filename == "food.jpg")
        #expect(photo.fileExtension == "jpg")
        #expect(Array(photo.data.prefix(3)) == [0xFF, 0xD8, 0xFF])
    }

    @Test("The PNG encoder downscales to the longest side")
    func pngDownscales() throws {
        let data = try #require(solidImage(width: 400, height: 200).downscaledPNGData(maxDimension: 100))
        let decoded = try #require(UIImage(data: data))
        #expect(decoded.size == CGSize(width: 100, height: 50))
    }

    @Test("The upload MIME type follows the filename")
    func uploadMimeType() {
        #expect(BissbilanzAPI.imageMimeType(forFilename: "food.png") == "image/png")
        #expect(BissbilanzAPI.imageMimeType(forFilename: "local-1.PNG") == "image/png")
        #expect(BissbilanzAPI.imageMimeType(forFilename: "food.jpg") == "image/jpeg")
        #expect(BissbilanzAPI.imageMimeType(forFilename: "local-1.webp") == "image/webp")
        #expect(BissbilanzAPI.imageMimeType(forFilename: "photo") == "image/jpeg")
    }

    @Test("Flattening a transparent image for JPEG puts it on white, not black")
    func flattenedJPEGIsWhite() throws {
        let transparent = solidImage(width: 40, height: 40).paddedToSquare(margin: 0.5)
        let data = try #require(PackageImageCodec.flattenedJPEG(transparent, quality: 0.9))
        let decoded = try #require(UIImage(data: data))
        let corner = try pixel(of: decoded, x: 0, y: 0)
        #expect(corner[0] > 240 && corner[1] > 240 && corner[2] > 240)
    }

    @Test("Importing a package photo keeps a PNG cut-out's bytes and transparency")
    func importKeepsPNG() throws {
        let cutout = solidImage(width: 40, height: 40).paddedToSquare(margin: 0.5)
        let png = try #require(cutout.pngData())
        let imported = try #require(PackageImageCodec.importable(png))
        #expect(imported.ext == "png")
        #expect(imported.data == png)
        let decoded = try #require(UIImage(data: imported.data))
        #expect(try pixel(of: decoded, x: 0, y: 0)[3] == 0)
    }

    @Test("Importing a package photo keeps a JPEG as is and rejects non-images")
    func importKeepsJPEGAndRejectsGarbage() throws {
        let jpeg = try #require(solidImage(width: 40, height: 40).jpegData(compressionQuality: 0.9))
        let imported = try #require(PackageImageCodec.importable(jpeg))
        #expect(imported.ext == "jpg")
        #expect(imported.data == jpeg)
        #expect(PackageImageCodec.importable(Data("not an image".utf8)) == nil)
    }

    @Test("Importing an oversized package photo downscales it to a JPEG")
    func importDownscalesOversized() throws {
        let png = try #require(solidImage(width: 5000, height: 100).pngData())
        let imported = try #require(PackageImageCodec.importable(png))
        #expect(imported.ext == "jpg")
        let decoded = try #require(UIImage(data: imported.data))
        let longest = max(decoded.size.width * decoded.scale, decoded.size.height * decoded.scale)
        #expect(longest <= 4096)
    }
}
