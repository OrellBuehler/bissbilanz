package com.bissbilanz.auth

import kotlinx.cinterop.*
import platform.CoreFoundation.CFDictionaryRef
import platform.CoreFoundation.CFTypeRefVar
import platform.Foundation.CFBridgingRelease
import platform.Foundation.NSData
import platform.Foundation.NSMutableDictionary
import platform.Security.*

actual class SecureStorage {
    private val serviceName = "com.bissbilanz"

    @OptIn(ExperimentalForeignApi::class)
    actual fun save(
        key: String,
        value: String,
    ) {
        delete(key)
        val data = value.encodeToByteArray().toNSData()
        val query =
            cfDictionary(
                kSecClass to kSecClassGenericPassword,
                kSecAttrService to serviceName,
                kSecAttrAccount to key,
                kSecValueData to data,
            )
        SecItemAdd(query, null)
    }

    @OptIn(ExperimentalForeignApi::class)
    actual fun load(key: String): String? {
        val query =
            cfDictionary(
                kSecClass to kSecClassGenericPassword,
                kSecAttrService to serviceName,
                kSecAttrAccount to key,
                kSecReturnData to true,
                kSecMatchLimit to kSecMatchLimitOne,
            )
        memScoped {
            val result = alloc<CFTypeRefVar>()
            val status = SecItemCopyMatching(query, result.ptr)
            if (status == errSecSuccess) {
                val data = CFBridgingRelease(result.value) as? NSData ?: return null
                return data.toByteArray().decodeToString()
            }
        }
        return null
    }

    @OptIn(ExperimentalForeignApi::class)
    actual fun delete(key: String) {
        val query =
            cfDictionary(
                kSecClass to kSecClassGenericPassword,
                kSecAttrService to serviceName,
                kSecAttrAccount to key,
            )
        SecItemDelete(query)
    }
}

@OptIn(ExperimentalForeignApi::class)
private fun ByteArray.toNSData(): NSData =
    usePinned { pinned ->
        NSData(bytes = pinned.addressOf(0), length = this.size.toULong())
    }

@OptIn(ExperimentalForeignApi::class)
private fun NSData.toByteArray(): ByteArray =
    ByteArray(this.length.toInt()).apply {
        usePinned { pinned ->
            platform.posix.memcpy(pinned.addressOf(0), this@toByteArray.bytes, this@toByteArray.length)
        }
    }

// Security framework constants (kSecClass, kSecAttrService, etc.) are CFStringRef,
// which is toll-free bridged with NSString and thus conforms to NSCopying.
@OptIn(ExperimentalForeignApi::class)
private fun cfDictionary(vararg entries: Pair<Any?, Any?>): CFDictionaryRef {
    val dict = NSMutableDictionary()
    for ((key, value) in entries) {
        @Suppress("UNCHECKED_CAST")
        dict.setValue(value, forKey = key as platform.Foundation.NSCopying)
    }
    // NSMutableDictionary is toll-free bridged with CFMutableDictionaryRef
    @Suppress("UNCHECKED_CAST")
    return dict as CFDictionaryRef
}
