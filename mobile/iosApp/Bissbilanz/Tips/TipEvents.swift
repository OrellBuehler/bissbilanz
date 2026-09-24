import TipKit

/// Events shared across more than one `Tip`'s rules. Donated from the single
/// place a food entry is actually created (`EntryRepository.createEntry`),
/// which every UI logging path — search, favorites, quick entry, recipes,
/// Siri/Shortcuts and the Apple Watch relay — already funnels through.
enum TipEvents {
    static let foodLogged = Tips.Event(id: "food_logged")
}
