package com.bissbilanz.auth

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.CPointer
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.usePinned
import platform.CoreFoundation.CFDictionaryAddValue
import platform.CoreFoundation.CFDictionaryCreateMutable
import platform.CoreFoundation.CFDictionaryRef
import platform.CoreFoundation.CFMutableDictionaryRef
import platform.CoreFoundation.CFTypeRefVar
import platform.CoreFoundation.kCFBooleanTrue
import platform.Foundation.CFBridgingRelease
import platform.Foundation.CFBridgingRetain
import platform.Foundation.NSData
import platform.Foundation.create
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData

actual class SecureStorage {
    private val serviceName = "com.bissbilanz"

    @OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
    actual fun save(
        key: String,
        value: String,
    ) {
        delete(key)
        val data = value.encodeToByteArray().toNSData()
        val retainedService = CFBridgingRetain(serviceName)
        val retainedKey = CFBridgingRetain(key)
        val retainedData = CFBridgingRetain(data)
        val query = CFDictionaryCreateMutable(null, 4, null, null)
        CFDictionaryAddValue(query, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(query, kSecAttrService, retainedService)
        CFDictionaryAddValue(query, kSecAttrAccount, retainedKey)
        CFDictionaryAddValue(query, kSecValueData, retainedData)
        SecItemAdd(query as CFDictionaryRef?, null)
        CFBridgingRelease(query)
        CFBridgingRelease(retainedService)
        CFBridgingRelease(retainedKey)
        CFBridgingRelease(retainedData)
    }

    @OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
    actual fun load(key: String): String? {
        val retainedService = CFBridgingRetain(serviceName)
        val retainedKey = CFBridgingRetain(key)
        val query = CFDictionaryCreateMutable(null, 5, null, null)
        CFDictionaryAddValue(query, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(query, kSecAttrService, retainedService)
        CFDictionaryAddValue(query, kSecAttrAccount, retainedKey)
        CFDictionaryAddValue(query, kSecReturnData, kCFBooleanTrue)
        CFDictionaryAddValue(query, kSecMatchLimit, kSecMatchLimitOne)
        val result =
            memScoped {
                val result = alloc<CFTypeRefVar>()
                val status = SecItemCopyMatching(query as CFDictionaryRef?, result.ptr)
                if (status == errSecSuccess) {
                    CFBridgingRelease(result.value) as? NSData
                } else {
                    null
                }
            }
        CFBridgingRelease(query)
        CFBridgingRelease(retainedService)
        CFBridgingRelease(retainedKey)
        return result?.toByteArray()?.decodeToString()
    }

    @OptIn(ExperimentalForeignApi::class)
    actual fun delete(key: String) {
        val retainedService = CFBridgingRetain(serviceName)
        val retainedKey = CFBridgingRetain(key)
        val query = CFDictionaryCreateMutable(null, 3, null, null)
        CFDictionaryAddValue(query, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(query, kSecAttrService, retainedService)
        CFDictionaryAddValue(query, kSecAttrAccount, retainedKey)
        SecItemDelete(query as CFDictionaryRef?)
        CFBridgingRelease(query)
        CFBridgingRelease(retainedService)
        CFBridgingRelease(retainedKey)
    }
}

@OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)
private fun ByteArray.toNSData(): NSData =
    usePinned { pinned ->
        NSData.create(bytes = pinned.addressOf(0), length = this.size.toULong())
    }

@OptIn(ExperimentalForeignApi::class)
private fun NSData.toByteArray(): ByteArray =
    ByteArray(this.length.toInt()).apply {
        usePinned { pinned ->
            platform.posix.memcpy(pinned.addressOf(0), this@toByteArray.bytes, this@toByteArray.length)
        }
    }
