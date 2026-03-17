import AVFoundation
import SwiftUI

struct BarcodeScannerView: View {
    @Environment(BissbilanzAPI.self) private var api
    @Environment(\.dismiss) private var dismiss

    @State private var scannedBarcode: String?
    @State private var foundFood: Food?
    @State private var isSearching = false
    @State private var notFound = false
    @State private var notFoundBarcode: String?
    @State private var showCreateFood = false
    @State private var cameraPermission: AVAuthorizationStatus = .notDetermined
    @State private var isTorchOn = false

    var body: some View {
        ZStack {
            if cameraPermission == .authorized {
                CameraPreviewView(onBarcodeScanned: handleBarcode, isTorchOn: $isTorchOn)
                    .ignoresSafeArea()

                viewfinder
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
                                showCreateFood = true
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
                if cameraPermission == .authorized {
                    Button {
                        isTorchOn.toggle()
                    } label: {
                        Image(systemName: isTorchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                            .foregroundStyle(isTorchOn ? .yellow : .white)
                    }
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
        .sheet(item: $foundFood) { food in
            NavigationStack {
                FoodDetailView(foodId: food.id)
            }
        }
        .onChange(of: foundFood) { _, newValue in
            if newValue == nil { resetScanner() }
        }
        .sheet(isPresented: $showCreateFood) {
            NavigationStack {
                FoodEditSheet(barcode: notFoundBarcode) { food in
                    foundFood = food
                    showCreateFood = false
                    scannedBarcode = nil
                    notFoundBarcode = nil
                }
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
        guard scannedBarcode == nil else { return }
        scannedBarcode = barcode
        isSearching = true
        notFound = false

        UINotificationFeedbackGenerator().notificationOccurred(.success)

        Task {
            do {
                if let food = try await api.findFoodByBarcode(barcode) {
                    foundFood = food
                } else if let food = try await api.lookupBarcode(barcode) {
                    // Found in Open Food Facts - create locally
                    let created = try await api.createFood(FoodCreate(
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
                        ingredientsText: food.ingredientsText
                    ))
                    foundFood = created
                } else {
                    notFoundBarcode = barcode
                    notFound = true
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                }
            } catch {
                notFoundBarcode = barcode
                notFound = true
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            isSearching = false
        }
    }

    private func resetScanner() {
        scannedBarcode = nil
        notFound = false
        notFoundBarcode = nil
    }
}

// MARK: - Camera Preview

struct CameraPreviewView: UIViewRepresentable {
    let onBarcodeScanned: (String) -> Void
    @Binding var isTorchOn: Bool

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

        // Update torch
        guard let device = context.coordinator.device, device.hasTorch else { return }
        try? device.lockForConfiguration()
        device.torchMode = isTorchOn ? .on : .off
        device.unlockForConfiguration()
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
        coordinator.session?.stopRunning()
        if let device = coordinator.device, device.hasTorch, device.torchMode == .on {
            try? device.lockForConfiguration()
            device.torchMode = .off
            device.unlockForConfiguration()
        }
    }
}
