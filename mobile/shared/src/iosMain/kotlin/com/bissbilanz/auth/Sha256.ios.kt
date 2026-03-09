package com.bissbilanz.auth

import kotlinx.cinterop.*
import platform.CoreCrypto.CC_SHA256
import platform.CoreCrypto.CC_SHA256_DIGEST_LENGTH

@OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)
actual fun sha256(input: ByteArray): ByteArray {
    val digest = UByteArray(CC_SHA256_DIGEST_LENGTH)
    input.usePinned { inputPinned ->
        digest.usePinned { digestPinned ->
            CC_SHA256(inputPinned.addressOf(0), input.size.toUInt(), digestPinned.addressOf(0))
        }
    }
    return digest.toByteArray()
}
