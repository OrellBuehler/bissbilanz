package com.bissbilanz.auth

import java.security.MessageDigest

actual fun sha256(input: ByteArray): ByteArray {
    return MessageDigest.getInstance("SHA-256").digest(input)
}
