package com.bissbilanz.foodpackage

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Port of `filename.test.ts`, the web's `filenameFromContentDisposition` tests and `normalize`. */
class FoodPackageFormatTest {
    private val generic = "bissbilanz-foods-2026-09-28.bissbilanz"
    private val today = "2026-09-28"

    @Test
    fun namesASingleRecipeAfterIt() {
        assertEquals("Lasagne.bissbilanz", packageFilename(listOf("Lasagne"), emptyList(), today))
    }

    @Test
    fun namesASingleFoodAfterIt() {
        assertEquals("Vollmilch.bissbilanz", packageFilename(emptyList(), listOf("Vollmilch"), today))
    }

    @Test
    fun usesTheGenericDatedNameForAnythingElse() {
        assertEquals(generic, packageFilename(emptyList(), emptyList(), today))
        assertEquals(generic, packageFilename(listOf("A", "B"), emptyList(), today))
        assertEquals(generic, packageFilename(emptyList(), listOf("A", "B"), today))
        assertEquals(generic, packageFilename(listOf("A"), listOf("B"), today))
    }

    @Test
    fun fallsBackToTheGenericNameWhenNothingUsableIsLeft() {
        assertEquals(generic, packageFilename(listOf("///"), emptyList(), today))
        assertEquals(generic, packageFilename(listOf("  ...  "), emptyList(), today))
    }

    @Test
    fun keepsUmlautsInTheRealName() {
        assertEquals("Käsespätzle.bissbilanz", packageFilename(listOf("Käsespätzle"), emptyList(), today))
    }

    @Test
    fun stripsSeparatorsQuotesReservedAndControlCharacters() {
        assertEquals("a b c d e f g h i j k l", sanitizeFilenameBase("a/b\\c:d*e?f\"g<h>i|j\u0000k\nl"))
        assertEquals("Oma s Kuchen", sanitizeFilenameBase("Oma's \"Kuchen\""))
    }

    @Test
    fun cannotEscapeTheDirectoryOrHideTheFile() {
        assertEquals("etc passwd", sanitizeFilenameBase("../../etc/passwd"))
        assertEquals("hidden", sanitizeFilenameBase(".hidden"))
        assertEquals("name", sanitizeFilenameBase("name. "))
    }

    @Test
    fun avoidsWindowsDeviceNames() {
        assertEquals("CON_", sanitizeFilenameBase("CON"))
        assertEquals("com1_", sanitizeFilenameBase("com1"))
        assertEquals("Console", sanitizeFilenameBase("Console"))
    }

    @Test
    fun capsTheLengthInCodePoints() {
        assertEquals(80, sanitizeFilenameBase("x".repeat(200)).length)
        assertEquals(80, sanitizeFilenameBase("ä".repeat(200)).length)
        // An astral character is one code point, never cut in half.
        val emoji = "🍞"
        assertEquals(160, sanitizeFilenameBase(emoji.repeat(200)).length)
    }

    @Test
    fun transliteratesUmlautsAndAccentsForTheAsciiName() {
        assertEquals("Kaesespaetzle Groesse", asciiFilename("Käsespätzle Größe"))
        assertEquals("Creme brulee", asciiFilename("Crème brûlée"))
        assertEquals("100_", asciiFilename("カレー 100%"))
    }

    // ── Content-Disposition ───────────────────────────────────────────────

    @Test
    fun prefersTheUtf8DownloadName() {
        assertEquals(
            "Käsespätzle.bissbilanz",
            filenameFromContentDisposition(
                "attachment; filename=\"Kaesespaetzle.bissbilanz\"; filename*=UTF-8''K%C3%A4sesp%C3%A4tzle.bissbilanz",
            ),
        )
    }

    @Test
    fun fallsBackToThePlainDownloadName() {
        assertEquals("Lasagne.bissbilanz", filenameFromContentDisposition("attachment; filename=\"Lasagne.bissbilanz\""))
        assertEquals("Lasagne.bissbilanz", filenameFromContentDisposition("attachment; filename=Lasagne.bissbilanz"))
    }

    @Test
    fun usesThePlainNameWhenTheUtf8OneIsBroken() {
        assertEquals(
            "A.bissbilanz",
            filenameFromContentDisposition("attachment; filename=\"A.bissbilanz\"; filename*=UTF-8''%E0%A4%A"),
        )
    }

    @Test
    fun fallsBackToTheGenericDownloadName() {
        assertEquals("bissbilanz-foods.bissbilanz", filenameFromContentDisposition(null))
        assertEquals("bissbilanz-foods.bissbilanz", filenameFromContentDisposition("attachment"))
        assertEquals("x.bissbilanz", filenameFromContentDisposition("attachment", "x.bissbilanz"))
    }

    @Test
    fun neverLetsAPathThrough() {
        assertEquals("_.._etc_passwd", filenameFromContentDisposition("attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd"))
    }

    // ── Keys ──────────────────────────────────────────────────────────────

    @Test
    fun normalizesLikeTheServer() {
        assertEquals("musli crunchy", normalizeName("  Müsli   Crunchy "))
        assertEquals("creme brulee", normalizeName("Crème Brûlée"))
        assertEquals("", normalizeName(null))
        assertEquals("a b", normalizeName("a  b"))
        assertEquals(foodKey("Milk", "Migros"), foodKey(" MILK ", "migros"))
        assertEquals("milk\u0000", foodKey("Milk", null))
    }

    @Test
    fun trimsBarcodes() {
        assertEquals("42", trimBarcode(" 42 "))
        assertNull(trimBarcode("  "))
        assertNull(trimBarcode(null))
    }

    @Test
    fun onlyAllowsOpenFoodFactsAndOwnUploadsAsImageUrls() {
        assertEquals("https://images.openfoodfacts.org/x.jpg", allowedImageUrl("https://images.openfoodfacts.org/x.jpg"))
        assertEquals("/uploads/a.webp", allowedImageUrl("/uploads/a.webp"))
        assertNull(allowedImageUrl("http://images.openfoodfacts.org/x.jpg"))
        assertNull(allowedImageUrl("https://evil.example/x.jpg"))
        assertNull(allowedImageUrl("https://images.openfoodfacts.org@evil.example/x.jpg"))
        assertNull(allowedImageUrl("file:///data/x.jpg"))
        assertNull(packageImageUrl("/uploads/a.webp"))
    }
}
