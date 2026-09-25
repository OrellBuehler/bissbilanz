import SwiftUI
import TipKit

/// Nudges a food logged often enough to be marked a favorite, for one-tap
/// re-logging from the Favorites tab or a Home Screen widget. Anchored on the
/// favorite-toggle star in `FoodDetailView`.
struct FavoritesLoggingTip: Tip {
    var title: Text {
        Text(L10n.tipFavoritesTitle)
    }

    var message: Text? {
        Text(L10n.tipFavoritesMessage)
    }

    var image: Image? {
        Image(systemName: "star")
    }

    var actions: [Action] {
        [Action(id: "learn_more", title: L10n.tipLearnMore, perform: {})]
    }

    var rules: [Rule] {
        #Rule(TipEvents.foodLogged) { $0.donations.count >= 5 }
    }
}
