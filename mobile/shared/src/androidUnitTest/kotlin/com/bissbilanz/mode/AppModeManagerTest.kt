package com.bissbilanz.mode

import com.bissbilanz.test.FakeKeyValueStore
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AppModeManagerTest {
    @Test
    fun modeIsNullBeforeInitialize() {
        val manager = AppModeManager(FakeKeyValueStore())

        assertNull(manager.mode.value)
        assertFalse(manager.isLocal)
    }

    @Test
    fun initializeLoadsNullWhenNothingPersisted() {
        val manager = AppModeManager(FakeKeyValueStore())

        manager.initialize()

        assertNull(manager.mode.value)
        assertFalse(manager.isLocal)
    }

    @Test
    fun setModePersistsAndEmits() {
        val store = FakeKeyValueStore()
        val manager = AppModeManager(store)

        manager.setMode(AppMode.LOCAL)

        assertEquals(AppMode.LOCAL, manager.mode.value)
        assertTrue(manager.isLocal)
        assertEquals("LOCAL", store.values["app_mode"])
    }

    @Test
    fun initializeLoadsPersistedMode() {
        val store = FakeKeyValueStore()
        AppModeManager(store).setMode(AppMode.SYNCED)

        val fresh = AppModeManager(store)
        fresh.initialize()

        assertEquals(AppMode.SYNCED, fresh.mode.value)
        assertFalse(fresh.isLocal)
    }

    @Test
    fun initializeIgnoresUnknownPersistedValue() {
        val store = FakeKeyValueStore()
        store.save("app_mode", "SOMETHING_ELSE")

        val manager = AppModeManager(store)
        manager.initialize()

        assertNull(manager.mode.value)
    }

    @Test
    fun clearDeletesPersistedModeAndEmitsNull() {
        val store = FakeKeyValueStore()
        val manager = AppModeManager(store)
        manager.setMode(AppMode.LOCAL)

        manager.clear()

        assertNull(manager.mode.value)
        assertFalse(manager.isLocal)
        assertNull(store.values["app_mode"])
    }

    @Test
    fun syncedModeIsNotLocal() {
        val manager = AppModeManager(FakeKeyValueStore())

        manager.setMode(AppMode.SYNCED)

        assertFalse(manager.isLocal)
    }
}
