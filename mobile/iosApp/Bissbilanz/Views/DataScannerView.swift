import SwiftUI
import Vision
import VisionKit

/// VisionKit barcode scanner: Apple's standard scanning UX with live
/// highlighting, guidance, multi-item tap-to-select and pinch-to-zoom.
///
/// `BarcodeScannerView` uses this when `DataScannerViewController.isSupported`
/// is true (real A12+ hardware) and falls back to the AVFoundation
/// `CameraPreviewView` otherwise (notably the Simulator, where `isSupported`
/// is false). Both paths call the same `handleBarcode`, so the Open Food Facts
/// → prefill flow is identical.
struct DataScannerView: UIViewControllerRepresentable {
    let onBarcodeScanned: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean8, .ean13, .upce, .code128, .code39, .qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        // startScanning() throws until the controller's view joins the
        // hierarchy; retry on each update and latch once it takes. (The class
        // is not open, so this can't be done by overriding viewDidAppear.)
        guard !context.coordinator.isScanning else { return }
        if (try? controller.startScanning()) != nil {
            context.coordinator.isScanning = true
        }
    }

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator _: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcodeScanned: onBarcodeScanned)
    }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onBarcodeScanned: (String) -> Void
        var isScanning = false

        init(onBarcodeScanned: @escaping (String) -> Void) {
            self.onBarcodeScanned = onBarcodeScanned
        }

        func dataScanner(_: DataScannerViewController, didTapOn item: RecognizedItem) {
            forward(item)
        }

        func dataScanner(
            _: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            // Auto-select only when a single barcode is in frame; with several,
            // wait for the user to tap the intended one.
            guard allItems.count == 1, let item = addedItems.first else { return }
            forward(item)
        }

        func dataScanner(
            _: DataScannerViewController,
            becameUnavailableWithError _: DataScannerViewController.ScanningUnavailable
        ) {
            // No recovery needed: BarcodeScannerView renders this path only on
            // supported hardware, and transient unavailability resolves when the
            // view reappears (scanning restarts in viewDidAppear).
        }

        /// Forwarding is deduped downstream by `BarcodeScannerView`'s
        /// `scannedBarcode` gate, mirroring the AVFoundation coordinator.
        private func forward(_ item: RecognizedItem) {
            guard case let .barcode(barcode) = item, let payload = barcode.payloadStringValue else { return }
            onBarcodeScanned(payload)
        }
    }
}
