import ImageIO
import UIKit

extension LocalImageStore {
    /// Default edge length for a widget thumbnail, in pixels. Roughly a 40 pt
    /// tile on a 3x screen — large enough for the biggest tile any widget
    /// family draws, small enough that six of them together are a fraction of
    /// a megabyte.
    static let widgetThumbnailPixels = 120

    /// A downscaled image decoded straight from the stored file, or nil when
    /// nothing is cached for this URL.
    ///
    /// Exists for the widget extension, which has a ~30 MB address-space budget
    /// and is killed rather than warned when it exceeds it: decoding a stored
    /// 512x512 WebP into a full `UIImage` for every tile would spend a large
    /// part of that budget on pictures the size of a stamp. `CGImageSource`
    /// produces the thumbnail without ever materializing the full-size bitmap.
    ///
    /// Reads only what `LocalImageStore` already holds — the extension never
    /// touches the network, so a food whose image has not been warmed onto disk
    /// yet simply renders without one.
    static func thumbnail(for imageUrl: String?, maxPixel: Int = widgetThumbnailPixels) -> UIImage? {
        guard let file = cachedFile(for: imageUrl),
              let source = CGImageSourceCreateWithURL(file as CFURL, nil)
        else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            // Honors EXIF orientation, which a camera photo attached in Local
            // mode carries.
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
