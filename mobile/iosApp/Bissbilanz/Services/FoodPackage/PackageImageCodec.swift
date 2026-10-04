import Foundation
import ImageIO
import UIKit

/// Where the on-device package export reads photos from and the import writes them
/// to. Backed by `LocalImageStore` in the app; tests substitute an in-memory one,
/// since the App Group directory is not available to an unsigned test host.
protocol PackageImageStore {
    func data(forImageUrl imageUrl: String) -> Data?
    func size(forImageUrl imageUrl: String) -> Int?
    /// Stores an image under its own extension and returns the image URL to put on
    /// the food or recipe row.
    func save(_ data: Data, fileExtension: String) -> String?
    func remove(_ imageUrl: String)
}

struct LocalPackageImageStore: PackageImageStore {
    func data(forImageUrl imageUrl: String) -> Data? {
        guard let file = LocalImageStore.cachedFile(for: imageUrl) else { return nil }
        return try? Data(contentsOf: file)
    }

    func size(forImageUrl imageUrl: String) -> Int? {
        guard let file = LocalImageStore.cachedFile(for: imageUrl) else { return nil }
        return try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize
    }

    func save(_ data: Data, fileExtension: String) -> String? {
        LocalImageStore.writeLocalPhoto(data, fileExtension: fileExtension)
    }

    func remove(_ imageUrl: String) {
        LocalImageStore.evict(imageUrl)
    }
}

enum PackageImageCodec {
    private static let maxExportDimension = 1600
    private static let thumbnailDimension = 96
    private static let maxImportPixels = 25_000_000
    private static let maxImportDimension = 4096

    /// The file extension of a format a package may carry (`webp`, `jpg`, `png`),
    /// sniffed from the bytes rather than trusted from a name.
    static func format(of data: Data) -> String? {
        let bytes = [UInt8](data.prefix(12))
        if bytes.count >= 3, bytes[0] == 0xFF, bytes[1] == 0xD8, bytes[2] == 0xFF { return "jpg" }
        if bytes.count >= 8, bytes[0] == 0x89, bytes[1] == 0x50, bytes[2] == 0x4E, bytes[3] == 0x47 { return "png" }
        if bytes.count >= 12, bytes[0] == 0x52, bytes[1] == 0x49, bytes[2] == 0x46, bytes[3] == 0x46,
           bytes[8] == 0x57, bytes[9] == 0x45, bytes[10] == 0x42, bytes[11] == 0x50
        {
            return "webp"
        }
        return nil
    }

    /// The photo as a package entry: untouched when it is a known format under the
    /// per-image cap, otherwise a downscaled JPEG. Nil when it cannot be made to fit.
    static func exportable(_ data: Data) -> (ext: String, data: Data)? {
        if let ext = format(of: data), data.count <= FoodPackageFormat.maxImageEntryBytes {
            return (ext, data)
        }
        guard let scaled = jpeg(from: data, maxDimension: maxExportDimension, quality: 0.8),
              scaled.count <= FoodPackageFormat.maxImageEntryBytes
        else { return nil }
        return ("jpg", scaled)
    }

    /// A package photo for the local store: the original bytes when they are a known,
    /// decodable format of a sane size (so a cut-out keeps its transparency), otherwise
    /// a downscaled JPEG. Nil when the bytes are not an image.
    static func importable(_ data: Data) -> (ext: String, data: Data)? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0
        else { return nil }
        if let ext = format(of: data), width * height <= maxImportPixels,
           max(width, height) <= maxImportDimension
        {
            return (ext, data)
        }
        guard let scaled = jpeg(from: data, maxDimension: maxImportDimension) else { return nil }
        return ("jpg", scaled)
    }

    /// A JPEG, flattened onto white, whatever format the package carried it in.
    static func jpeg(from data: Data, maxDimension: Int? = nil, quality: CGFloat = 0.85) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        if let maxDimension {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxDimension,
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                return nil
            }
            return flattenedJPEG(UIImage(cgImage: image), quality: quality)
        }
        guard let image = UIImage(data: data) else { return nil }
        return flattenedJPEG(image, quality: quality)
    }

    /// JPEG has no alpha, so a transparent cut-out would come out black.
    /// Composites onto white first, the colour a food photo's background
    /// usually is.
    static func flattenedJPEG(_ image: UIImage, quality: CGFloat) -> Data? {
        let format = UIGraphicsImageRendererFormat.default()
        format.preferredRange = .standard
        format.scale = image.scale
        format.opaque = true
        let flattened = UIGraphicsImageRenderer(size: image.size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: image.size))
            image.draw(at: .zero)
        }
        return flattened.jpegData(compressionQuality: quality)
    }

    /// A small inline `data:` URL for the preview, like the server's thumbnails.
    static func thumbnailDataURL(from data: Data) -> String? {
        guard let jpeg = jpeg(from: data, maxDimension: thumbnailDimension, quality: 0.6) else { return nil }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }
}
