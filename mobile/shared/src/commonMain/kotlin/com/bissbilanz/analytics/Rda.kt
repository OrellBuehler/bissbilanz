package com.bissbilanz.analytics

data class RdaEntry(
    val nutrientKey: String,
    val unit: String,
    val rdaMale: Double,
    val rdaFemale: Double,
    val label: String,
)

val RDA_VALUES: List<RdaEntry> =
    listOf(
        RdaEntry("vitaminA", "µg", 900.0, 700.0, "Vitamin A"),
        RdaEntry("vitaminC", "mg", 90.0, 75.0, "Vitamin C"),
        RdaEntry("vitaminD", "µg", 15.0, 15.0, "Vitamin D"),
        RdaEntry("vitaminE", "mg", 15.0, 15.0, "Vitamin E"),
        RdaEntry("vitaminK", "µg", 120.0, 90.0, "Vitamin K"),
        RdaEntry("vitaminB1", "mg", 1.2, 1.1, "Thiamin (B1)"),
        RdaEntry("vitaminB2", "mg", 1.3, 1.1, "Riboflavin (B2)"),
        RdaEntry("vitaminB3", "mg", 16.0, 14.0, "Niacin (B3)"),
        RdaEntry("vitaminB5", "mg", 5.0, 5.0, "Pantothenic Acid (B5)"),
        RdaEntry("vitaminB6", "mg", 1.3, 1.3, "Vitamin B6"),
        RdaEntry("vitaminB7", "µg", 30.0, 30.0, "Biotin (B7)"),
        RdaEntry("vitaminB9", "µg", 400.0, 400.0, "Folate (B9)"),
        RdaEntry("vitaminB12", "µg", 2.4, 2.4, "Vitamin B12"),
        RdaEntry("calcium", "mg", 1000.0, 1000.0, "Calcium"),
        RdaEntry("iron", "mg", 8.0, 18.0, "Iron"),
        RdaEntry("magnesium", "mg", 420.0, 320.0, "Magnesium"),
        RdaEntry("phosphorus", "mg", 700.0, 700.0, "Phosphorus"),
        RdaEntry("potassium", "mg", 3400.0, 2600.0, "Potassium"),
        RdaEntry("sodium", "mg", 2300.0, 2300.0, "Sodium"),
        RdaEntry("zinc", "mg", 11.0, 8.0, "Zinc"),
        RdaEntry("copper", "mg", 0.9, 0.9, "Copper"),
        RdaEntry("manganese", "mg", 2.3, 1.8, "Manganese"),
        RdaEntry("selenium", "µg", 55.0, 55.0, "Selenium"),
        RdaEntry("iodine", "µg", 150.0, 150.0, "Iodine"),
        RdaEntry("chromium", "µg", 35.0, 25.0, "Chromium"),
        RdaEntry("molybdenum", "µg", 45.0, 45.0, "Molybdenum"),
        RdaEntry("fluoride", "mg", 4.0, 3.0, "Fluoride"),
        RdaEntry("chloride", "mg", 2300.0, 2300.0, "Chloride"),
        RdaEntry("omega3", "g", 1.6, 1.1, "Omega-3"),
        RdaEntry("omega6", "g", 17.0, 12.0, "Omega-6"),
        RdaEntry("fiber", "g", 38.0, 25.0, "Fiber"),
    )
