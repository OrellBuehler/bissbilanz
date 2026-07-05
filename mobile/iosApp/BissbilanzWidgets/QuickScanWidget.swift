import SwiftUI
import WidgetKit

/// One-tap shortcut to the barcode scanner — home screen small widget and
/// lock screen circular launcher (iOS counterpart of the Android quick scan
/// widget).
struct QuickScanWidget: Widget {
    var body: some WidgetConfiguration {
        let strings = WidgetStrings(localeCode: WidgetSnapshotStore.load()?.localeCode ?? "en")
        return StaticConfiguration(kind: "QuickScanWidget", provider: SnapshotProvider()) { entry in
            QuickScanWidgetView(entry: entry)
        }
        .configurationDisplayName(strings.quickScanWidgetDisplayName)
        .description(strings.quickScanWidgetDescription)
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct QuickScanWidgetView: View {
    let entry: SnapshotTimelineEntry

    @Environment(\.widgetFamily) private var family

    private var strings: WidgetStrings {
        entry.snapshot.strings
    }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "barcode.viewfinder")
                        .font(.title2)
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 36, weight: .light))
                        .foregroundStyle(MacroColors.calories)
                    Text(strings.scan)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .widgetURL(WidgetDeepLink.scanner)
        .bissbilanzWidgetBackground()
    }
}
