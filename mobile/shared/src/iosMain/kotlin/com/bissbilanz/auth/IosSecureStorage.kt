package com.bissbilanz.auth

import kotlinx.cinterop.*
import platform.Security.*

actual class SecureStorage {
    private val serviceName = "com.bissbilanz"

    @OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
    actual fun save(
        key: String,
        value: String,
    ) {
        delete(key)
        val data = value.encodeToByteArray().toNSData()
        val query =
            mapOf(
                kSecClass to kSecClassGenericPassword,
                kSecAttrService to serviceName,
                kSecAttrAccount to key,
                kSecValueData to data,
            )
        SecItemAdd(query.toCFDictionary(), null)
    }

    @OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
    actual fun load(key: String): String? {
        val query =
            mapOf(
                kSecClass to kSecClassGenericPassword,
                kSecAttrService to serviceName,
                kSecAttrAccount to key,
                kSecReturnData to true,
                kSecMatchLimit to kSecMatchLimitOne,
            )
        memScoped {
            val result = alloc<ObjCObjectVar<Any?>>()
            val status = SecItemCopyMatching(query.toCFDictionary(), result.ptr)
            if (status == errSecSuccess) {
                val data = result.value as? platform.Foundation.NSData ?: return null
                return data.toByteArray().decodeToString()
            }
        }
        return null
    }

    @OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
    actual fun delete(key: String) {
        val query =
            mapOf(
                kSecClass to kSecClassGenericPassword,
                kSecAttrService to serviceName,
                kSecAttrAccount to key,
            )
        SecItemDelete(query.toCFDictionary())
    }
}

@OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
private fun ByteArray.toNSData(): platform.Foundation.NSData =
    usePinned { pinned ->
        platform.Foundation.NSData.create(
            bytes = pinned.addressOf(0),
            length = this.size.toULong(),
        )
    }

@OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
private fun platform.Foundation.NSData.toByteArray(): ByteArray =
    ByteArray(this.length.toInt()).apply {
        usePinned { pinned ->
            platform.posix.memcpy(pinned.addressOf(0), this@toByteArray.bytes, this@toByteArray.length)
        }
    }

@OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
private fun Map<Any?, Any?>.toCFDictionary(): platform.CoreFoundation.CFDictionaryRef? {
    // Simplified — in production use proper CFDictionary creation
    val nsDict =
        platform.Foundation.NSDictionary.dictionaryWithObjects(
            this.values.toList(),
            this.keys.toList(),
        )
    @Suppress("UNCHECKED_CAST")
    return nsDict as? platform.CoreFoundation.CFDictionaryRef
}
