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
    /// Whether scanning should be running. The owner passes false while a
    /// navigation step covers the camera: VisionKit may stop scanning on its
    /// own when the view is obscured, and the isScanning latch would suppress
    /// the restart — stopping and starting explicitly makes it deterministic.
    var isActive = true
    /// Whether the lamp should be lit. The torch is applied here rather than by
    /// the owner because it only burns for a device a *running* session holds:
    /// setting it from the outside, at whatever moment the button was tapped,
    /// reconfigures a device VisionKit may not have finished starting — which
    /// leaves the preview stuck on its last frame.
    var isTorchOn = false

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
        guard isActive else {
            // Off before stop: the lamp only answers while the session still
            // holds the device.
            ScannerTorch.set(false)
            controller.stopScanning()
            context.coordinator.isScanning = false
            context.coordinator.appliedTorch = nil
            return
        }
        // startScanning() throws until the controller's view joins the
        // hierarchy; retry on each update and latch once it takes. (The class
        // is not open, so this can't be done by overriding viewDidAppear.)
        if !context.coordinator.isScanning {
            guard (try? controller.startScanning()) != nil else { return }
            context.coordinator.isScanning = true
        }
        guard context.coordinator.appliedTorch != isTorchOn else { return }
        ScannerTorch.set(isTorchOn)
        context.coordinator.appliedTorch = isTorchOn
    }

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator _: Coordinator) {
        // Off before stop, for the same reason as above.
        ScannerTorch.set(false)
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcodeScanned: onBarcodeScanned)
    }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onBarcodeScanned: (String) -> Void
        var isScanning = false
        /// What the lamp was last told, so a torch already in the wanted state
        /// is not re-set on every layout pass. Cleared when scanning stops: the
        /// session takes the lamp with it, so it has to be applied again on the
        /// next start.
        var appliedTorch: Bool?

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
