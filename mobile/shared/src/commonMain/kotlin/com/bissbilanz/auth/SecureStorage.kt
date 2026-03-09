package com.bissbilanz.auth

expect class SecureStorage {
    fun save(key: String, value: String)
    fun load(key: String): String?
    fun delete(key: String)
}
