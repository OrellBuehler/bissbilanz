import SwiftUI
import AVFoundation

struct BarcodeScannerView: View {
    @EnvironmentObject var api: BissbilanzAPI
    @Environment(\.dismiss) var dismiss

    @State private var scannedBarcode: String?
    @State private var foundFood: Food?
    @State private var isSearching = false
    @State private var notFound = false
    @State private var cameraPermission: AVAuthorizationStatus = .notDetermined

    var body: some View {
        ZStack {
            if cameraPermission == .authorized {
                CameraPreviewView(onBarcodeScanned: handleBarcode)
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
                        Text("Looking up barcode...")
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
                    Text("No food found for this barcode")
                        .foregroundStyle(.white)
                        .padding()
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .padding(.bottom, 40)
                }
            }
        }
        .navigationTitle("Scan Barcode")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
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
            Text("Camera access required")
                .font(.headline)
            Text("Enable camera access in Settings to scan barcodes.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Open Settings") {
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

        Task {
            do {
                if let food = try await api.findFoodByBarcode(barcode) {
                    foundFood = food
                } else {
                    notFound = true
                    try? await Task.sleep(for: .seconds(2))
                    notFound = false
                    scannedBarcode = nil
                }
            } catch {
                notFound = true
                try? await Task.sleep(for: .seconds(2))
                notFound = false
                scannedBarcode = nil
            }
            isSearching = false
        }
    }
}

struct CameraPreviewView: UIViewRepresentable {
    let onBarcodeScanned: (String) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        let coordinator = context.coordinator

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else {
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
        previewLayer.frame = UIScreen.main.bounds
        view.layer.addSublayer(previewLayer)

        coordinator.session = session

        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }

        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcodeScanned: onBarcodeScanned)
    }

    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        let onBarcodeScanned: (String) -> Void
        var session: AVCaptureSession?

        init(onBarcodeScanned: @escaping (String) -> Void) {
            self.onBarcodeScanned = onBarcodeScanned
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
                  let barcode = object.stringValue else { return }
            onBarcodeScanned(barcode)
        }
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.session?.stopRunning()
    }
}
