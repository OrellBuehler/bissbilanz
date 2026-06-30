@testable import Bissbilanz
import Foundation
import Testing

/// Covers `LocalStore.performMigration` — the file-system copy that relocates
/// the on-disk store into the App Group container on first launch after this
/// change ships. Uses injected temp-directory URLs in place of the legacy/
/// App-Group locations, since `containerURL(forSecurityApplicationGroupIdentifier:)`
/// isn't available in a unit-test host. The App-Group resolution wrapper
/// (`migrateStoreToAppGroupIfNeeded`) and the real on-device legacy store path
/// are NOT covered here — they need a real device/simulator, per the
/// implementation plan's migration verification checklist.
struct MigrationTests {
    private func makeTempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    @Test("Fresh install: no legacy store means no-op, no crash")
    func freshInstallNoOp() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        let destination = root.appendingPathComponent("AppGroup/Bissbilanz.store")
        var errors: [(Error, [String: Any])] = []

        LocalStore.performMigration(source: nil, destination: destination, onError: { errors.append(($0, $1)) })

        #expect(errors.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: destination.path))
    }

    @Test("Upgrade: copies the legacy store and its WAL companions to the destination")
    func copiesLegacyStoreAndCompanions() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        let legacy = root.appendingPathComponent("Legacy/default.store")
        try FileManager.default.createDirectory(
            at: legacy.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("main".utf8).write(to: legacy)
        try Data("wal".utf8).write(to: URL(fileURLWithPath: legacy.path + "-wal"))
        try Data("shm".utf8).write(to: URL(fileURLWithPath: legacy.path + "-shm"))
        let destination = root.appendingPathComponent("AppGroup/Bissbilanz.store")
        var errors: [(Error, [String: Any])] = []

        LocalStore.performMigration(source: legacy, destination: destination, onError: { errors.append(($0, $1)) })

        #expect(errors.isEmpty)
        #expect(try Data(contentsOf: destination) == Data("main".utf8))
        #expect(try Data(contentsOf: URL(fileURLWithPath: destination.path + "-wal")) == Data("wal".utf8))
        #expect(try Data(contentsOf: URL(fileURLWithPath: destination.path + "-shm")) == Data("shm".utf8))
        // Legacy files are kept as a rollback path, not deleted.
        #expect(FileManager.default.fileExists(atPath: legacy.path))
    }

    @Test("Idempotent: a second call is a no-op once the destination store exists")
    func idempotentOnceMigrated() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        let legacy = root.appendingPathComponent("Legacy/default.store")
        try FileManager.default.createDirectory(
            at: legacy.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("main".utf8).write(to: legacy)
        let destination = root.appendingPathComponent("AppGroup/Bissbilanz.store")
        var errors: [(Error, [String: Any])] = []
        LocalStore.performMigration(source: legacy, destination: destination, onError: { errors.append(($0, $1)) })
        #expect(try Data(contentsOf: destination) == Data("main".utf8))

        // A second pass with different legacy content must not overwrite the
        // already-migrated destination.
        try Data("changed".utf8).write(to: legacy)
        LocalStore.performMigration(source: legacy, destination: destination, onError: { errors.append(($0, $1)) })

        #expect(errors.isEmpty)
        #expect(try Data(contentsOf: destination) == Data("main".utf8))
    }

    @Test("Missing WAL/SHM companions don't fail the migration")
    func missingCompanionsAreOptional() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        let legacy = root.appendingPathComponent("Legacy/default.store")
        try FileManager.default.createDirectory(
            at: legacy.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("main".utf8).write(to: legacy)
        let destination = root.appendingPathComponent("AppGroup/Bissbilanz.store")
        var errors: [(Error, [String: Any])] = []

        LocalStore.performMigration(source: legacy, destination: destination, onError: { errors.append(($0, $1)) })

        #expect(errors.isEmpty)
        #expect(try Data(contentsOf: destination) == Data("main".utf8))
        #expect(!FileManager.default.fileExists(atPath: destination.path + "-wal"))
        #expect(!FileManager.default.fileExists(atPath: destination.path + "-shm"))
    }
}
