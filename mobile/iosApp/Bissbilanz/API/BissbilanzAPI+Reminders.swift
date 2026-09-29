import Foundation

extension BissbilanzAPI {
    // MARK: - Reminders

    func getReminders() async throws -> [Reminder] {
        let response: RemindersListResponse = try await get("/api/reminders")
        return response.reminders
    }

    func createReminder(
        _ reminder: ReminderCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Reminder {
        let response: ReminderResponse = try await post(
            "/api/reminders", body: reminder,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.reminder
    }

    func updateReminder(
        id: String,
        _ update: ReminderUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Reminder {
        let response: ReminderResponse = try await patch(
            "/api/reminders/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.reminder
    }

    func deleteReminder(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/reminders/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }
}
