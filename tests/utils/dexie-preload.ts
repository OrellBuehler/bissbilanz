// Preload fake-indexeddb before any test modules are imported.
// This ensures Dexie finds the IndexedDB API available at module init time.
import 'fake-indexeddb/auto';
