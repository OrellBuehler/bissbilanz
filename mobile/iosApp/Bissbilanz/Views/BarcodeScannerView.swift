import AVFoundation
import SwiftUI
import VisionKit

struct BarcodeScannerView: View {
    @Environment(FoodRepository.self) private var foodRepository
    // Open Food Facts lookups are proxied by the server in Synced mode; Local
    // mode queries Open Food Facts directly (there is no backend session).
    @Environment(BissbilanzAPI.self) private var api
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(\.dismiss) private var dismiss

    @State private var scannedBarcode: String?
    @State private var isSearching = false
    @State private var notFound = false
    @State private var cameraPermission: AVAuthorizationStatus = .notDetermined
    @State private var isTorchOn = false
    /// The flow after a scan lives in this stack's path: one sheet, pushed
    /// steps. Back returns to the previous step; closing the sheet at any
    /// depth discards the whole flow.
    @State private var path: [ScanStep] = []

    private enum ScanStep: Hashable {
        case create(barcode: String?)
        case log(Food)
    }

    /// VisionKit's DataScanner is used on supported hardware; the AVFoundation
    /// preview is the fallback (notably the Simulator, where isSupported is
    /// false). Evaluated once — device capability does not change at runtime.
    private let useDataScanner = DataScannerViewController.isSupported

    var body: some View {
        NavigationStack(path: $path) {
            scannerRoot
                .navigationDestination(for: ScanStep.self) { step in
                    switch step {
                    case let .create(barcode):
                        // Replace, don't append, once the food is saved: the
                        // form is spent and the food exists now, so Back from
                        // the log step must land on the camera, not on a form
                        // that would create a duplicate.
                        FoodEditForm(barcode: barcode) { created in
                            path = [.log(created)]
                        }
                    case let .log(food):
                        // Scanning a barcode is a logging shortcut, so a hit
                        // goes straight to the log step instead of parking on
                        // the food's detail page and making logging a second
                        // tap. After a successful log the whole flow collapses
                        // — dismiss() captures the sheet root's dismiss, so it
                        // tears down the entire presentation regardless of
                        // depth. Back returns to the camera for the next item.
                        LogFoodForm(
                            food: food,
                            date: DateFormatting.today,
                            showsDetailsLink: true,
                            onLogged: { dismiss() }
                        )
                    }
                }
        }
        .onChange(of: path.isEmpty) { _, atScanner in
            if atScanner {
                resetScanner()
            } else {
                // A pushed step covers the camera, which stops the session and
                // takes the lamp out with it; the icon has to agree on the way
                // back.
                isTorchOn = false
            }
        }
    }

    private var scannerRoot: some View {
        ZStack {
            if cameraPermission == .authorized {
                if useDataScanner {
                    DataScannerView(
                        onBarcodeScanned: handleBarcode,
                        isActive: path.isEmpty,
                        isTorchOn: isTorchOn
                    )
                    .ignoresSafeArea()
                } else {
                    CameraPreviewView(onBarcodeScanned: handleBarcode, isTorchOn: isTorchOn)
                        .ignoresSafeArea()

                    viewfinder
                }
            } else if cameraPermission == .denied || cameraPermission == .restricted {
                permissionDenied
            } else {
                Color.black.ignoresSafeArea()
            }

            if isSearching {
                VStack {
                    Spacer()
                    HStack {
                        ProgressView()
                        Text(L10n.lookingUp)
                            .foregroundStyle(.white)
                    }
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .padding(.bottom, 40)
                }
            }

            if notFound {
                VStack {
                    Spacer()
                    VStack(spacing: 12) {
                        Text(L10n.notFound)
                            .foregroundStyle(.white)

                        HStack(spacing: 12) {
                            Button {
                                resetScanner()
                            } label: {
                                Label(L10n.retry, systemImage: "arrow.counterclockwise")
                            }
                            .buttonStyle(.bordered)
                            .tint(.white)

                            Button {
                                notFound = false
                                path.append(.create(barcode: scannedBarcode))
                            } label: {
                                Label(L10n.createFoodForBarcode, systemImage: "plus.circle")
                            }
                            .buttonStyle(.bordered)
                            .tint(.white)
                        }
                    }
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 32)
                    .padding(.bottom, 40)
                }
            }
        }
        .navigationTitle(L10n.scanBarcode)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.close) { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                if cameraPermission == .authorized, ScannerTorch.isAvailable {
                    Button {
                        isTorchOn.toggle()
                    } label: {
                        Image(systemName: isTorchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                            .foregroundStyle(isTorchOn ? .yellow : .white)
                    }
                    .accessibilityLabel(isTorchOn ? L10n.torchOff : L10n.torchOn)
                }
            }
        }
        .task {
            cameraPermission = AVCaptureDevice.authorizationStatus(for: .video)
            if cameraPermission == .notDetermined {
                let granted = await AVCaptureDevice.requestAccess(for: .video)
                cameraPermission = granted ? .authorized : .denied
            }
        }
    }

    private var viewfinder: some View {
        RoundedRectangle(cornerRadius: 12)
            .strokeBorder(.white.opacity(0.8), lineWidth: 2)
            .frame(width: 280, height: 160)
            .background(.clear)
    }

    private var permissionDenied: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text(L10n.cameraRequired)
                .font(.headline)
            Text(L10n.enableCameraHint)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(L10n.openSettings) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }

    private func handleBarcode(_ barcode: String) {
        // The camera stays in the view tree while a step is pushed — the
        // path.isEmpty guard keeps stray detections from firing behind it.
        guard scannedBarcode == nil, path.isEmpty else { return }
        scannedBarcode = barcode
        isSearching = true
        notFound = false

        UINotificationFeedbackGenerator().notificationOccurred(.success)

        Task {
            do {
                if let food = try await foodRepository.findByBarcode(barcode) {
                    path.append(.log(food))
                } else if let hit = try await lookupOpenFoodFacts(barcode) {
                    // Found in Open Food Facts - create locally
                    let food = hit.food
                    let created = try await foodRepository.createFood(FoodCreate(
                        name: food.name,
                        brand: food.brand,
                        servingSize: food.servingSize,
                        servingUnit: food.servingUnit,
                        calories: food.calories,
                        protein: food.protein,
                        carbs: food.carbs,
                        fat: food.fat,
                        fiber: food.fiber,
                        barcode: barcode,
                        nutriScore: food.nutriScore,
                        novaGroup: food.novaGroup,
                        additives: food.additives,
                        ingredientsText: food.ingredientsText,
                        categoriesTags: hit.categoriesTags
                    ))
                    path.append(.log(created))
                } else {
                    notFound = true
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                }
            } catch {
                notFound = true
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            isSearching = false
        }
    }

    /// Local mode has no backend session — query Open Food Facts directly;
    /// Synced mode keeps using the authenticated server proxy. Only the proxy
    /// carries categories: Local mode has no server to seed labels from them.
    private func lookupOpenFoodFacts(_ barcode: String) async throws -> BissbilanzAPI.OpenFoodFactsHit? {
        if appModeManager.isLocal {
            try await OpenFoodFactsClient().lookupBarcode(barcode)
                .map { BissbilanzAPI.OpenFoodFactsHit(food: $0, categoriesTags: nil) }
        } else {
            try await api.lookupBarcode(barcode)
        }
    }

    private func resetScanner() {
        scannedBarcode = nil
        notFound = false
    }
}

// MARK: - Camera Preview

struct CameraPreviewView: UIViewRepresentable {
    let onBarcodeScanned: (String) -> Void
    var isTorchOn = false

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black
        let coordinator = context.coordinator

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device)
        else {
            return view
        }

        let session = AVCaptureSession()
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        session.addOutput(output)

        output.setMetadataObjectsDelegate(coordinator, queue: .main)
        output.metadataObjectTypes = [.ean8, .ean13, .upce, .code128, .code39]

        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)

        coordinator.session = session
        coordinator.device = device
        coordinator.previewLayer = previewLayer

        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Update preview layer frame to match actual view bounds
        context.coordinator.previewLayer?.frame = uiView.bounds

        ScannerTorch.set(isTorchOn, on: context.coordinator.device)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcodeScanned: onBarcodeScanned)
    }

    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        let onBarcodeScanned: (String) -> Void
        var session: AVCaptureSession?
        var device: AVCaptureDevice?
        var previewLayer: AVCaptureVideoPreviewLayer?

        init(onBarcodeScanned: @escaping (String) -> Void) {
            self.onBarcodeScanned = onBarcodeScanned
        }

        func metadataOutput(
            _: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from _: AVCaptureConnection
        ) {
            guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
                  let barcode = object.stringValue
            else { return }
            onBarcodeScanned(barcode)
        }
    }

    static func dismantleUIView(_: UIView, coordinator: Coordinator) {
        // The lamp goes out here on the main thread — one device lock, and
        // `AVCaptureDevice` isn't Sendable (see `ScannerTorch.device`).
        ScannerTorch.set(false, on: coordinator.device)
        // `stopRunning` does not: Apple documents it as a blocking call that
        // should not run on the main queue, and it routinely takes hundreds of
        // milliseconds — a hitch on every dismissal of the scanner sheet. The
        // session is retained by the closure until it has actually stopped.
        let session = coordinator.session
        DispatchQueue.global(qos: .userInitiated).async {
            session?.stopRunning()
        }
    }
}

// MARK: - Torch

/// The lamp belongs to the capture device, not to the session, which is how a
/// torch button can exist at all on the VisionKit path — DataScannerViewController
/// exposes no torch control, but the device underneath it does.
///
/// Reaching for a device a running session owns has to be done sparingly. Every
/// `lockForConfiguration` contends with the focus and exposure adjustments the
/// session is making continuously, so the scanner views re-apply their wanted
/// state on each update and this decides when that actually costs anything.
enum ScannerTorch {
    /// The default video device, when it has a lamp. Resolved once:
    /// `AVCaptureDevice.default(for:)` is not cheap, the SwiftUI views asking
    /// for it are re-created constantly, and the hardware does not change while
    /// the app runs.
    ///
    /// `nonisolated(unsafe)` because `AVCaptureDevice` is not `Sendable`; the
    /// handle is written once and every caller is on the main actor anyway.
    nonisolated(unsafe) static let device: AVCaptureDevice? =
        AVCaptureDevice.default(for: .video).flatMap { $0.hasTorch ? $0 : nil }

    static var isAvailable: Bool { device != nil }

    /// Full power is the first thing the system throttles when the lamp heats
    /// up, and it is far more than a barcode at arm's length needs. Backing off
    /// keeps the capture pipeline out of thermal pressure, which is what stalls
    /// the preview.
    private static let level: Float = 0.6

    @discardableResult
    static func set(_ isOn: Bool) -> Bool {
        set(isOn, on: device)
    }

    /// Returns whether the lamp is lit afterwards — not always what was asked
    /// for, since a device can refuse. Takes the device explicitly for the
    /// AVFoundation fallback, which opens its own.
    @discardableResult
    static func set(_ isOn: Bool, on device: AVCaptureDevice?) -> Bool {
        guard let device, device.hasTorch else { return false }
        // Callers re-apply on every view update; a lamp already in the wanted
        // state is left alone rather than re-locking the running device. Read
        // through `isTorchActive`, not `torchMode`: the mode survives a session
        // restart that put the lamp out, so only the former notices that the
        // state needs applying again.
        guard isOn != device.isTorchActive else { return isOn }
        guard (try? device.lockForConfiguration()) != nil else { return false }
        defer { device.unlockForConfiguration() }

        guard isOn else {
            device.torchMode = .off
            return false
        }
        // The lamp reports itself unavailable while it cools down, and setting
        // the mode regardless raises rather than lights anything.
        guard device.isTorchAvailable, device.isTorchModeSupported(.on) else { return false }
        return (try? device.setTorchModeOn(level: level)) != nil
    }
}
