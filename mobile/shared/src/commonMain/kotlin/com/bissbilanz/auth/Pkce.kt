package com.bissbilanz.auth

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

internal expect fun secureRandomBytes(size: Int): ByteArray

@OptIn(ExperimentalEncodingApi::class)
object Pkce {
    private val base64Url = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT)

    /** 64 characters of [A-Za-z0-9-_], within RFC 7636's 43-128 character unreserved set. */
    fun generateVerifier(): String = base64Url.encode(secureRandomBytes(48))

    fun challengeFor(verifier: String): String = base64Url.encode(sha256(verifier.encodeToByteArray()))
}

private val ROUND_CONSTANTS =
    uintArrayOf(
        0x428a2f98u,
        0x71374491u,
        0xb5c0fbcfu,
        0xe9b5dba5u,
        0x3956c25bu,
        0x59f111f1u,
        0x923f82a4u,
        0xab1c5ed5u,
        0xd807aa98u,
        0x12835b01u,
        0x243185beu,
        0x550c7dc3u,
        0x72be5d74u,
        0x80deb1feu,
        0x9bdc06a7u,
        0xc19bf174u,
        0xe49b69c1u,
        0xefbe4786u,
        0x0fc19dc6u,
        0x240ca1ccu,
        0x2de92c6fu,
        0x4a7484aau,
        0x5cb0a9dcu,
        0x76f988dau,
        0x983e5152u,
        0xa831c66du,
        0xb00327c8u,
        0xbf597fc7u,
        0xc6e00bf3u,
        0xd5a79147u,
        0x06ca6351u,
        0x14292967u,
        0x27b70a85u,
        0x2e1b2138u,
        0x4d2c6dfcu,
        0x53380d13u,
        0x650a7354u,
        0x766a0abbu,
        0x81c2c92eu,
        0x92722c85u,
        0xa2bfe8a1u,
        0xa81a664bu,
        0xc24b8b70u,
        0xc76c51a3u,
        0xd192e819u,
        0xd6990624u,
        0xf40e3585u,
        0x106aa070u,
        0x19a4c116u,
        0x1e376c08u,
        0x2748774cu,
        0x34b0bcb5u,
        0x391c0cb3u,
        0x4ed8aa4au,
        0x5b9cca4fu,
        0x682e6ff3u,
        0x748f82eeu,
        0x78a5636fu,
        0x84c87814u,
        0x8cc70208u,
        0x90befffau,
        0xa4506cebu,
        0xbef9a3f7u,
        0xc67178f2u,
    ).map { it.toInt() }.toIntArray()

internal fun sha256(data: ByteArray): ByteArray {
    val h =
        uintArrayOf(
            0x6a09e667u,
            0xbb67ae85u,
            0x3c6ef372u,
            0xa54ff53au,
            0x510e527fu,
            0x9b05688cu,
            0x1f83d9abu,
            0x5be0cd19u,
        ).map { it.toInt() }.toIntArray()
    val bitLength = data.size.toLong() * 8
    val padded = ByteArray(((data.size + 9 + 63) / 64) * 64)
    data.copyInto(padded)
    padded[data.size] = 0x80.toByte()
    for (i in 0 until 8) {
        padded[padded.size - 1 - i] = (bitLength ushr (8 * i)).toByte()
    }

    val w = IntArray(64)
    for (block in padded.indices step 64) {
        for (t in 0 until 16) {
            val o = block + t * 4
            w[t] =
                ((padded[o].toInt() and 0xff) shl 24) or
                ((padded[o + 1].toInt() and 0xff) shl 16) or
                ((padded[o + 2].toInt() and 0xff) shl 8) or
                (padded[o + 3].toInt() and 0xff)
        }
        for (t in 16 until 64) {
            val s0 = w[t - 15].rotateRight(7) xor w[t - 15].rotateRight(18) xor (w[t - 15] ushr 3)
            val s1 = w[t - 2].rotateRight(17) xor w[t - 2].rotateRight(19) xor (w[t - 2] ushr 10)
            w[t] = w[t - 16] + s0 + w[t - 7] + s1
        }
        var a = h[0]
        var b = h[1]
        var c = h[2]
        var d = h[3]
        var e = h[4]
        var f = h[5]
        var g = h[6]
        var hh = h[7]
        for (t in 0 until 64) {
            val s1 = e.rotateRight(6) xor e.rotateRight(11) xor e.rotateRight(25)
            val ch = (e and f) xor (e.inv() and g)
            val t1 = hh + s1 + ch + ROUND_CONSTANTS[t] + w[t]
            val s0 = a.rotateRight(2) xor a.rotateRight(13) xor a.rotateRight(22)
            val maj = (a and b) xor (a and c) xor (b and c)
            val t2 = s0 + maj
            hh = g
            g = f
            f = e
            e = d + t1
            d = c
            c = b
            b = a
            a = t1 + t2
        }
        h[0] += a
        h[1] += b
        h[2] += c
        h[3] += d
        h[4] += e
        h[5] += f
        h[6] += g
        h[7] += hh
    }

    val out = ByteArray(32)
    for (i in 0 until 8) {
        out[i * 4] = (h[i] ushr 24).toByte()
        out[i * 4 + 1] = (h[i] ushr 16).toByte()
        out[i * 4 + 2] = (h[i] ushr 8).toByte()
        out[i * 4 + 3] = h[i].toByte()
    }
    return out
}
