package com.bissbilanz.foodpackage

/** One food element of a streamed manifest: the food, or why it could not be read. */
class BulkFoodResult(
    val index: Int,
    val food: PackageFood?,
    val error: String?,
)

/** What a first pass over a bulk package's manifest found. */
class BulkManifestInfo(
    val exportedAt: String?,
    val foodCount: Int,
    val recipeCount: Int,
)

/** An opened bulk package. The manifest is read as a stream and the images one at a time. */
interface BulkPackageSession : AutoCloseable {
    val info: BulkManifestInfo

    /** Walks the foods in manifest order, calling [onFood] for each; invalid ones arrive with an error. */
    suspend fun streamFoods(onFood: suspend (BulkFoodResult) -> Unit)

    /** The bytes of one `images/<name>` entry, or null when it is missing, oversized or unreadable. */
    fun readImage(path: String): ByteArray?
}

/** Platform zip handling for packages too big to hold in memory. */
interface BulkPackageReader {
    /**
     * Validates the package and counts its foods.
     * @throws FoodPackageException when it is not a readable food package
     */
    suspend fun open(path: String): BulkPackageSession
}
