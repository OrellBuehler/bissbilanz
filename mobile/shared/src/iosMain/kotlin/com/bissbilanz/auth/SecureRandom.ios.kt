package com.bissbilanz.auth

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.convert
import kotlinx.cinterop.usePinned
import platform.Security.SecRandomCopyBytes
import platform.Security.errSecSuccess
import platform.Security.kSecRandomDefault

@OptIn(ExperimentalForeignApi::class)
internal actual fun secureRandomBytes(size: Int): ByteArray {
    val bytes = ByteArray(size)
    val status =
        bytes.usePinned {
            SecRandomCopyBytes(kSecRandomDefault, size.convert(), it.addressOf(0))
        }
    check(status == errSecSuccess) { "SecRandomCopyBytes failed: $status" }
    return bytes
}
