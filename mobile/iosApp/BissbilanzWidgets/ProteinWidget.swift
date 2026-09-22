import AppIntents
import SwiftUI
import WidgetKit

/// Defaults to protein, so widgets already placed under the "ProteinWidget"
/// kind keep rendering exactly as before this became configurable — see
/// `CaloriesWidgetConfigurationIntent`.
struct ProteinWidgetConfigurationIntent: MacroWidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Protein Widget" }

    static var description: IntentDescription {
        IntentDescription("Choose which metric this widget tracks.")
    }

    @Parameter(title: "Metric", default: .protein)
    var macro: MacroKindAppEnum

    init() {
        macro = .protein
    }

    init(macro: MacroKindAppEnum) {
        self.macro = macro
    }
}

/// Single-macro progress: small home screen ring plus lock screen circular
/// gauge. Configurable since iOS 17 — "Edit Widget" lets the user swap which
/// metric it tracks (see `MacroWidgetSupport.swift`); the "ProteinWidget"
/// kind itself, and its protein default, are unchanged.
struct ProteinWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.currentLocaleCode())
        return AppIntentConfiguration(
            kind: "ProteinWidget",
            intent: ProteinWidgetConfigurationIntent.self,
            provider: MacroSnapshotProvider<ProteinWidgetConfigurationIntent>()
        ) { entry in
            MacroWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.protein)
        .description(strings.proteinWidgetDescription)
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}
