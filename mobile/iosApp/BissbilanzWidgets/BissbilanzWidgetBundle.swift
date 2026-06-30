import SwiftUI
import WidgetKit

@main
struct BissbilanzWidgetBundle: WidgetBundle {
    var body: some Widget {
        CaloriesWidget()
        ProteinWidget()
        MacroSummaryWidget()
        DayOverviewWidget()
        FavoritesWidget()
        QuickScanWidget()
        QuickWeightWidget()
        QuickAddWidget()
    }
}
