package com.bissbilanz.android.widget

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.xmlpull.v1.XmlPullParser
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The Assistant wiring is pure resources: a capability the app never declares, or a
 * binding naming one that doesn't exist, fails silently — the phrase simply never
 * resolves and there is nothing to notice in the app. So assert the shipped
 * shortcuts.xml against the capability names the code actually binds to.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = AssistantCapabilitiesTest.TestApp::class)
class AssistantCapabilitiesTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun declaresTheCapabilitiesTheAppReliesOn() {
        val parsed = parse()

        assertTrue(
            OPEN_APP_FEATURE in parsed.capabilities,
            "the four launcher shortcuts have nothing to bind to without $OPEN_APP_FEATURE",
        )
        assertTrue(
            FoodShortcutPublisher.FOOD_CAPABILITY in parsed.capabilities,
            "FoodShortcutPublisher binds every food shortcut to a capability that isn't declared",
        )
    }

    @Test
    fun everyShortcutIsReachableByVoice() {
        val parsed = parse()

        assertEquals(
            parsed.shortcutIds.size,
            parsed.bindings.size,
            "a shortcut ships without a capability binding, so the Assistant can't offer it",
        )
        parsed.bindings.forEach { binding ->
            assertTrue(
                binding.capability in parsed.capabilities,
                "${binding.capability} is bound but never declared",
            )
        }
    }

    @Test
    fun everyInlineInventoryResolvesToSpokenPhrases() {
        val parsed = parse()

        assertTrue(parsed.bindings.isNotEmpty(), "no capability bindings found")
        parsed.bindings.forEach { binding ->
            if (binding.capability == OPEN_APP_FEATURE) {
                assertEquals("feature", binding.parameter, "OPEN_APP_FEATURE binds a parameter it doesn't have")
            }
            assertTrue(binding.inventory != 0, "${binding.capability} binding has no inventory array")
            val phrases = context.resources.getStringArray(binding.inventory)
            assertTrue(phrases.isNotEmpty(), "${binding.capability} inventory array is empty")
            assertTrue(phrases.none { it.isBlank() }, "${binding.capability} inventory has a blank phrase")
        }
    }

    private data class Binding(
        val capability: String,
        val parameter: String?,
        val inventory: Int,
    )

    private data class Parsed(
        val capabilities: List<String>,
        val shortcutIds: List<String>,
        val bindings: List<Binding>,
    )

    private fun parse(): Parsed {
        val ns = "http://schemas.android.com/apk/res/android"
        val parser = context.resources.getXml(R.xml.shortcuts)
        val capabilities = mutableListOf<String>()
        val shortcutIds = mutableListOf<String>()
        val bindings = mutableListOf<Binding>()
        var pending: String? = null

        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            if (parser.eventType != XmlPullParser.START_TAG) continue
            when (parser.name) {
                "capability" -> capabilities += parser.getAttributeValue(ns, "name")
                "shortcut" -> shortcutIds += parser.getAttributeValue(ns, "shortcutId")
                "capability-binding" -> pending = parser.getAttributeValue(ns, "key")
                "parameter-binding" ->
                    bindings +=
                        Binding(
                            capability = pending ?: "",
                            parameter = parser.getAttributeValue(ns, "key"),
                            inventory = parser.getAttributeResourceValue(ns, "value", 0),
                        )
            }
        }
        return Parsed(capabilities, shortcutIds, bindings)
    }

    private companion object {
        const val OPEN_APP_FEATURE = "actions.intent.OPEN_APP_FEATURE"
    }
}
