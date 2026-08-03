import HealthKit
import SwiftUI

/// Settings subpage for the Apple Health integration: connection status plus
/// per-data-type sync toggles grouped by direction. Permissions are requested
/// lazily — only when a type is enabled.
struct AppleHealthSettingsView: View {
    private let healthKit = HealthKitService.shared

    @Environment(SleepRepository.self) private var sleepRepository

    @State private var isConfirmingReimport = false
    @State private var isReimporting = false
    @State private var reimportResult: String?

    // Weight and sleep reuse the pre-existing defaults keys so settings made
    // before this page existed carry over unchanged.
    @State private var weightRead = UserDefaults.standard.bool(forKey: HealthKitService.syncEnabledKey)
    @State private var weightWrite = UserDefaults.standard.bool(forKey: HealthKitService.writeWeightEnabledKey)
    @State private var sleepRead = UserDefaults.standard.bool(forKey: HealthKitService.readSleepEnabledKey)
    @State private var sleepWrite = UserDefaults.standard.bool(forKey: HealthKitService.writeSleepEnabledKey)
    @State private var nutrientsEnabled: [String: Bool] = Dictionary(
        uniqueKeysWithValues: HealthNutrient.all.map { ($0.key, $0.isEnabled) }
    )

    private var isConnected: Bool {
        weightRead || weightWrite || sleepRead || sleepWrite || nutrientsEnabled.values.contains(true)
    }

    var body: some View {
        List {
            statusSection
            readingSection
            writingSection
            nutrientHeaderSection
            ForEach(HealthNutrient.categories, id: \.name) { category in
                Section(category.name) {
                    ForEach(category.nutrients) { nutrient in
                        syncRow(
                            name: nutrient.name,
                            identifier: nutrient.identifier.rawValue,
                            direction: .write,
                            lastSyncKind: HealthKitService.nutrientWriteSyncKind(nutrient.key),
                            isOn: nutrientBinding(nutrient)
                        )
                    }
                }
            }
        }
        .navigationTitle(L10n.appleHealth)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            L10n.healthReimportSleep,
            isPresented: $isConfirmingReimport,
            titleVisibility: .visible
        ) {
            Button(L10n.healthReimportSleep, role: .destructive) {
                Task { await reimportSleep() }
            }
            Button(L10n.cancel, role: .cancel) {}
        } message: {
            Text(L10n.healthReimportSleepConfirm)
        }
        .alert(
            L10n.appleHealth,
            isPresented: Binding(
                get: { reimportResult != nil },
                set: { if !$0 { reimportResult = nil } }
            )
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            Text(reimportResult ?? "")
        }
    }

    private func reimportSleep() async {
        isReimporting = true
        let updated = await HealthKitImporter.reimportSleep(into: sleepRepository)
        isReimporting = false
        reimportResult = L10n.healthReimportSleepResult(updated)
    }

    // MARK: - Status

    private var statusSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "heart.fill")
                    .font(.title2)
                    .foregroundStyle(.red)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.appleHealth)
                        .font(.headline)
                    Text(isConnected ? L10n.healthConnected : L10n.healthNotConnected)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: isConnected ? "checkmark.circle.fill" : "circle.dashed")
                    .foregroundStyle(isConnected ? AnyShapeStyle(.green) : AnyShapeStyle(.secondary))
            }
            if isConnected {
                Button(role: .destructive) {
                    disconnect()
                } label: {
                    Label(L10n.healthDisconnect, systemImage: "heart.slash")
                }
            } else {
                Button {
                    connect()
                } label: {
                    Label(L10n.healthConnect, systemImage: "heart.circle")
                }
            }
        } footer: {
            Text(isConnected ? L10n.healthDisconnectFooter : L10n.healthConnectFooter)
        }
    }

    // MARK: - Reading from Health

    private var readingSection: some View {
        Section {
            syncRow(
                name: L10n.weight,
                identifier: HKQuantityTypeIdentifier.bodyMass.rawValue,
                direction: .read,
                lastSyncKind: HealthKitService.weightReadSyncKind,
                isOn: toggleBinding($weightRead, key: HealthKitService.syncEnabledKey) {
                    await healthKit.requestReadAuthorization()
                }
            )
            syncRow(
                name: L10n.sleep,
                identifier: HKCategoryTypeIdentifier.sleepAnalysis.rawValue,
                direction: .read,
                lastSyncKind: HealthKitService.sleepReadSyncKind,
                isOn: toggleBinding($sleepRead, key: HealthKitService.readSleepEnabledKey) {
                    await healthKit.requestSleepReadAuthorization()
                }
            )
            if sleepRead {
                Button {
                    isConfirmingReimport = true
                } label: {
                    HStack {
                        Label(L10n.healthReimportSleep, systemImage: "arrow.clockwise")
                        Spacer()
                        if isReimporting {
                            ProgressView()
                        }
                    }
                }
                .disabled(isReimporting)
            }
        } header: {
            Text(L10n.healthReadingSection)
        } footer: {
            Text(L10n.healthReadingFooter)
        }
    }

    // MARK: - Writing to Health

    private var writingSection: some View {
        Section {
            syncRow(
                name: L10n.weight,
                identifier: HKQuantityTypeIdentifier.bodyMass.rawValue,
                direction: .write,
                lastSyncKind: HealthKitService.weightWriteSyncKind,
                isOn: toggleBinding($weightWrite, key: HealthKitService.writeWeightEnabledKey) {
                    await healthKit.requestWriteAuthorization()
                }
            )
            syncRow(
                name: L10n.sleep,
                identifier: HKCategoryTypeIdentifier.sleepAnalysis.rawValue,
                direction: .write,
                lastSyncKind: HealthKitService.sleepWriteSyncKind,
                isOn: toggleBinding($sleepWrite, key: HealthKitService.writeSleepEnabledKey) {
                    await healthKit.requestSleepWriteAuthorization()
                }
            )
        } header: {
            Text(L10n.healthWritingSection)
        } footer: {
            Text(L10n.healthWritingFooter)
        }
    }

    // MARK: - Nutrients

    private var nutrientHeaderSection: some View {
        Section {
            HStack(spacing: 12) {
                Button(L10n.selectAll) {
                    setAllNutrients(true)
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)

                Button(L10n.deselectAll) {
                    setAllNutrients(false)
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        } header: {
            Text(L10n.healthNutrientsSection)
        } footer: {
            Text(L10n.healthNutrientsFooter)
        }
    }

    // MARK: - Rows

    /// One data type: name, direction icon, raw HealthKit identifier, last
    /// synced timestamp and the enable toggle.
    private func syncRow(
        name: String,
        identifier: String,
        direction: HealthSyncDirection,
        lastSyncKind: String,
        isOn: Binding<Bool>
    ) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: direction.icon)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(name)
                }
                Text(identifier)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let lastSync = HealthKitService.lastSync(lastSyncKind) {
                    Text(L10n.healthLastSynced(lastSync.formatted(.relative(presentation: .named))))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    // MARK: - Bindings

    /// Persists the toggle and lazily requests the type's permission when it
    /// is switched on.
    private func toggleBinding(
        _ source: Binding<Bool>,
        key: String,
        onEnable: @escaping () async -> Bool
    ) -> Binding<Bool> {
        Binding(
            get: { source.wrappedValue },
            set: { enabled in
                source.wrappedValue = enabled
                UserDefaults.standard.set(enabled, forKey: key)
                if enabled {
                    Task { _ = await onEnable() }
                }
            }
        )
    }

    private func nutrientBinding(_ nutrient: HealthNutrient) -> Binding<Bool> {
        Binding(
            get: { nutrientsEnabled[nutrient.key] ?? false },
            set: { enabled in
                nutrientsEnabled[nutrient.key] = enabled
                UserDefaults.standard.set(enabled, forKey: nutrient.defaultsKey)
                if enabled {
                    Task { _ = await healthKit.requestNutritionWriteAuthorization([nutrient]) }
                }
            }
        )
    }

    // MARK: - Actions

    /// Mirrors the old master toggle: connecting turns on the weight import
    /// and asks for read permission. Everything else stays opt-in below.
    private func connect() {
        weightRead = true
        UserDefaults.standard.set(true, forKey: HealthKitService.syncEnabledKey)
        Task { _ = await healthKit.requestReadAuthorization() }
    }

    /// HealthKit has no API to revoke permissions — disconnecting turns every
    /// sync toggle off; revocation lives in the Health app (see footer).
    private func disconnect() {
        weightRead = false
        weightWrite = false
        sleepRead = false
        sleepWrite = false
        let defaults = UserDefaults.standard
        defaults.set(false, forKey: HealthKitService.syncEnabledKey)
        defaults.set(false, forKey: HealthKitService.writeWeightEnabledKey)
        defaults.set(false, forKey: HealthKitService.readSleepEnabledKey)
        defaults.set(false, forKey: HealthKitService.writeSleepEnabledKey)
        setAllNutrients(false)
    }

    /// All nutrient toggles at once — enabling requests one combined
    /// permission sheet instead of forty individual ones.
    private func setAllNutrients(_ enabled: Bool) {
        let defaults = UserDefaults.standard
        for nutrient in HealthNutrient.all {
            nutrientsEnabled[nutrient.key] = enabled
            defaults.set(enabled, forKey: nutrient.defaultsKey)
        }
        if enabled {
            Task { _ = await healthKit.requestNutritionWriteAuthorization(HealthNutrient.all) }
        }
    }
}
