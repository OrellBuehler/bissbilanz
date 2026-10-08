import UserNotifications

/// `setNotificationCategories` replaces the whole set, so every category must be
/// registered in this one call — registering them one by one leaves only the last,
/// and notifications of the others lose their long-press actions.
enum NotificationCategories {
    /// Free, and must be in place before any request is scheduled, so it runs at
    /// launch regardless of authorization.
    static func register() {
        UNUserNotificationCenter.current().setNotificationCategories([
            SupplementReminderScheduler.category,
            ReminderScheduler.category,
        ])
    }
}
