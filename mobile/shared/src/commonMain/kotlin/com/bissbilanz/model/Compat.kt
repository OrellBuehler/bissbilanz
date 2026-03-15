package com.bissbilanz.model

// Type aliases mapping old hand-written names to generated OpenAPI types.
// Types not listed here remain hand-written because the generated version
// is structurally incompatible (different fields, nullability, enum casing, etc.).

// === Direct replacements (same structure) ===
typealias Goals = com.bissbilanz.api.generated.model.Goals
typealias MealType = com.bissbilanz.api.generated.model.MealType
typealias SupplementLog = com.bissbilanz.api.generated.model.SupplementLog
typealias MaintenanceMeta = com.bissbilanz.api.generated.model.MaintenanceMeta

// === Name mappings (old name -> generated name) ===
typealias DailyStatsEntry = com.bissbilanz.api.generated.model.DailyStat
typealias MealBreakdownEntry = com.bissbilanz.api.generated.model.MealBreakdownItem
typealias TopFoodEntry = com.bissbilanz.api.generated.model.TopFoodItem
typealias StreaksResponse = com.bissbilanz.api.generated.model.StreaksResponse

// === Create/Update DTO aliases ===
typealias EntryCreate = com.bissbilanz.api.generated.model.ApiEntriesPostRequest
typealias EntryUpdate = com.bissbilanz.api.generated.model.ApiEntriesIdPatchRequest
typealias WeightCreate = com.bissbilanz.api.generated.model.ApiWeightPostRequest
typealias WeightUpdate = com.bissbilanz.api.generated.model.ApiWeightIdPatchRequest
