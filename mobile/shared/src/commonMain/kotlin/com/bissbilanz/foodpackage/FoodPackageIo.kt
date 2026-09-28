package com.bissbilanz.foodpackage

/** An opened package: its validated manifest and lazy access to the images it names. */
interface FoodPackageFile {
    val manifest: PackageManifest

    /** sha256 (hex) of the file; ties a commit to the file its preview was made from. */
    val packageHash: String

    /** Inflate just these manifest image paths. Missing or oversized entries are absent. */
    fun readImages(paths: List<String>): Map<String, ByteArray>
}

/** Platform zip handling. Implementations enforce the size and entry limits from FoodPackageFormat.kt. */
interface FoodPackageArchive {
    /**
     * Open the package at [path], a zip or a bare JSON manifest.
     * @throws FoodPackageException when it is not a readable food package
     */
    fun read(path: String): FoodPackageFile

    /** A zip holding the README, [manifestJson] and [images] (path to bytes). */
    fun write(
        manifestJson: String,
        images: Map<String, ByteArray>,
    ): ByteArray
}

/** Where on-device food and recipe photos live; the platform decides how. */
interface PackageImageStore {
    /** The bytes behind a stored image URL (`file://` or a cached upload), or null. */
    suspend fun read(imageUrl: String): ByteArray?

    /** Size in bytes of the stored image, or null when there is none. */
    suspend fun size(imageUrl: String): Long?

    /** A small inline `data:` URL to preview an incoming image, or null when unreadable. */
    suspend fun thumbnail(bytes: ByteArray): String?

    /** Keep an imported image on the device and return the URL to store on the row, or null if unreadable. */
    suspend fun saveImported(bytes: ByteArray): String?

    /** Drop an image no row references any more. */
    suspend fun discard(imageUrl: String)
}
