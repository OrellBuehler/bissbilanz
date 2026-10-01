import AVFoundation
import SwiftUI
import VisionKit

/// Scan-only counterpart of `BarcodeScannerView`: hands the first detected
/// code to `onScanned` and dismisses, with no lookup or logging. The food
/// form uses it to fill its barcode field.
struct BarcodeCaptureView: View {
    let onScanned: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var cameraPermission: AVAuthorizationStatus = .notDetermined
    @State private var isTorchOn = false
    @State private var delivered = false

    private let useDataScanner = DataScannerViewController.isSupported

    var body: some View {
        NavigationStack {
            ZStack {
                if cameraPermission == .authorized {
                    if useDataScanner {
                        DataScannerView(onBarcodeScanned: handleBarcode, isTorchOn: isTorchOn)
                            .ignoresSafeArea()
                    } else {
                        CameraPreviewView(onBarcodeScanned: handleBarcode, isTorchOn: isTorchOn)
                            .ignoresSafeArea()
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(.white.opacity(0.8), lineWidth: 2)
                            .frame(width: 280, height: 160)
                    }
                } else if cameraPermission == .denied || cameraPermission == .restricted {
                    permissionDenied
                } else {
                    Color.black.ignoresSafeArea()
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
    }

    private var permissionDenied: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
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
        guard !delivered else { return }
        delivered = true
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        onScanned(barcode)
        dismiss()
    }
}
