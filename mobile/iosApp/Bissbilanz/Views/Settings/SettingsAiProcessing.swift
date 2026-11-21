import SwiftUI

/// Who processes queued AI tasks (the MCP assistant or this iPhone), auto-log
/// vs review-first, a capability readout, and — folded in here since it's the
/// same "AI on this device" territory — whether a meal estimate (here or in
/// AIMealSheet) may fall back to Apple's Private Cloud Compute when on-device
/// estimation isn't available or good enough (MealEstimatorPrivateCloud.swift).
/// The processor picker itself is server-only (hidden in Local mode, which has
/// no task queue to route); the PCC toggle stays device-local and visible
/// regardless of AppMode, like before. Hidden entirely when neither half has
/// anything to show.
struct SettingsAiProcessingSection: View {
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Binding var preferences: Preferences

    private var claudeOption: ClaudeProcessorOption {
        ClaudeProcessorOption.resolve(
            effective: preferences.effectiveAiTaskProcessor,
            capability: preferencesRepository.claudeCapability
        )
    }

    private var isClaudeChosen: Bool {
        preferences.effectiveAiTaskProcessor == Preferences.aiTaskProcessorClaude
    }

    private var isDeviceProcessor: Bool {
        preferences.effectiveAiTaskProcessor == Preferences.aiTaskProcessorDevice
    }

    var body: some View {
        if !appModeManager.isLocal || PrivateCloudComputeSettings.isSupported {
            Section {
                if !appModeManager.isLocal {
                    SettingsAiProcessorRows(preferences: $preferences)
                }

                if PrivateCloudComputeSettings.isSupported {
                    Toggle(L10n.aiPrivateCloudToggleLabel, isOn: Binding(
                        get: { PrivateCloudComputeSettings.isEnabled },
                        set: { PrivateCloudComputeSettings.isEnabled = $0 }
                    ))
                }
            } header: {
                Text(L10n.aiTaskProcessorSectionTitle)
            } footer: {
                footer
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !appModeManager.isLocal, isDeviceProcessor {
                Text(L10n.aiTaskProcessorAutoLogFooter)
            }
            if !appModeManager.isLocal, claudeOption == .selectable, isClaudeChosen {
                Text(L10n.aiTaskAutoLogFooterClaude)
            }
            if PrivateCloudComputeSettings.isSupported {
                Text(L10n.aiPrivateCloudToggleFooter)
            }
        }
    }
}

private struct SettingsAiProcessorRows: View {
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @Binding var preferences: Preferences

    private var claudeOption: ClaudeProcessorOption {
        ClaudeProcessorOption.resolve(
            effective: preferences.effectiveAiTaskProcessor,
            capability: preferencesRepository.claudeCapability
        )
    }

    private var isClaudeChosen: Bool {
        preferences.effectiveAiTaskProcessor == Preferences.aiTaskProcessorClaude
    }

    private var isDeviceProcessor: Bool {
        preferences.effectiveAiTaskProcessor == Preferences.aiTaskProcessorDevice
    }

    private var showsAutoLogToggle: Bool {
        isDeviceProcessor || isClaudeChosen
    }

    var body: some View {
        Picker(selection: Binding(
            get: { preferences.effectiveAiTaskProcessor },
            set: { newValue in
                Task {
                    var update = PreferencesUpdate()
                    update.aiTaskProcessor = newValue
                    preferences = await (try? preferencesRepository.update(update))
                        ?? (preferencesRepository.preferences() ?? .defaults)
                }
            }
        )) {
            Text(L10n.aiTaskProcessorOptionAssistant).tag(Preferences.aiTaskProcessorAssistant)
            Text(L10n.aiTaskProcessorOptionDevice).tag(Preferences.aiTaskProcessorDevice)
            claudePickerOption
        } label: {
            Label(L10n.aiTaskProcessorPickerLabel, systemImage: "sparkles")
        }
        .pickerStyle(.menu)

        claudeProcessorDetails

        if showsAutoLogToggle {
            autoLogToggle
        }

        if isDeviceProcessor {
            SettingsAiDeviceRows()
        }
    }

    private var autoLogToggle: some View {
        Toggle(L10n.aiTaskProcessorAutoLogToggle, isOn: Binding(
            get: { preferences.aiTaskAutoLog },
            set: { newValue in
                Task {
                    var update = PreferencesUpdate()
                    update.aiTaskAutoLog = newValue
                    preferences = await (try? preferencesRepository.update(update))
                        ?? (preferencesRepository.preferences() ?? .defaults)
                }
            }
        ))
    }

    /// Claude is offered only while the server says it is available. When it
    /// is the stored choice but not available, the row stays (so the picker
    /// still shows the real choice) but cannot be selected again.
    @ViewBuilder
    private var claudePickerOption: some View {
        switch claudeOption {
        case .hidden:
            EmptyView()
        case .selectable:
            Text(L10n.aiTaskProcessorOptionClaude).tag(Preferences.aiTaskProcessorClaude)
        case .unavailable:
            Text(L10n.aiTaskProcessorOptionClaudeUnavailable)
                .tag(Preferences.aiTaskProcessorClaude)
                .disabled(true)
        }
    }

    @ViewBuilder
    private var claudeProcessorDetails: some View {
        switch claudeOption {
        case .hidden:
            EmptyView()
        case .unavailable:
            Label {
                Text(L10n.aiTaskProcessorClaudeUnavailableHint)
            } icon: {
                Image(systemName: "exclamationmark.triangle")
            }
            .font(.footnote)
            .foregroundStyle(.orange)
            Text(L10n.aiTaskProcessorClaudePrivacy)
                .font(.footnote)
                .foregroundStyle(.secondary)
        case .selectable:
            Text(L10n.aiTaskProcessorClaudePrivacy)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if isClaudeChosen, let remaining = preferencesRepository.claudeCapability?.remainingBudgetUsd {
                Text(L10n.aiTaskProcessorClaudeRemaining(remaining))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct SettingsAiDeviceRows: View {
    @Environment(MealEstimator.self) private var mealEstimator

    private var onDeviceCapabilityText: String {
        switch mealEstimator.availability {
        case .available: L10n.aiTaskProcessorOnDeviceAvailable
        case .deviceNotEligible: L10n.aiMealDeviceNotEligible
        case .appleIntelligenceDisabled: L10n.aiMealAppleIntelligenceDisabled
        case .modelNotReady: L10n.aiMealModelNotReady
        case .osUnsupported: L10n.aiMealOsUnsupported
        }
    }

    var body: some View {
        // Still allowed when this device can't currently estimate at all — it
        // may simply be waiting on the model to finish downloading, or on
        // Apple Intelligence being turned on.
        if !mealEstimator.canEstimate {
            Label {
                Text(L10n.aiTaskProcessorDeviceWarning)
            } icon: {
                Image(systemName: "exclamationmark.triangle")
            }
            .font(.footnote)
            .foregroundStyle(.orange)
        }

        capabilityRow(L10n.aiTaskProcessorCapabilityOnDeviceLabel, value: onDeviceCapabilityText)
        capabilityRow(
            L10n.aiTaskProcessorCapabilityPhotoLabel,
            value: mealEstimator.supportsPhotoInput
                ? L10n.aiTaskProcessorSupported : L10n.aiTaskProcessorNotSupported
        )
        capabilityRow(
            L10n.aiTaskProcessorCapabilityPccLabel,
            value: mealEstimator.isPrivateCloudComputeAvailable
                ? L10n.aiTaskProcessorSupported : L10n.aiTaskProcessorNotSupported
        )
    }

    private func capabilityRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(.secondary)
        }
        .font(.footnote)
    }
}
