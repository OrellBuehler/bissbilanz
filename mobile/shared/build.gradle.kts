plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.sqldelight)
    alias(libs.plugins.skie)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64(),
    ).forEach {
        it.binaries.framework {
            baseName = "shared"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.content.negotiation)
            implementation(libs.ktor.serialization.json)
            implementation(libs.ktor.client.auth)
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.sqldelight.coroutines)
            implementation(libs.koin.core)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
        }
        androidMain.dependencies {
            implementation(libs.health.connect)
            implementation(libs.ktor.client.okhttp)
            implementation(libs.sqldelight.android)
            implementation(libs.kotlinx.coroutines.android)
            implementation(libs.security.crypto)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
            implementation(libs.sqldelight.native)
        }
        val androidUnitTest by getting {
            dependencies {
                implementation(libs.mockk)
                implementation(libs.ktor.client.mock)
                implementation(libs.turbine)
                implementation(libs.sqldelight.jvm)
            }
        }
    }
}

android {
    namespace = "com.bissbilanz.shared"
    compileSdk = 37
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

skie {
    // SKIE uploads anonymized build analytics by default; disable both the
    // capture and upload phases so CI/dev framework builds make no network
    // calls and leak no project metadata.
    analytics {
        enabled.set(false)
    }
}

sqldelight {
    databases {
        // Server-derived/transient state (sync queue, sync meta, meal-type cache).
        // Lives in bissbilanz.db, which is excluded from Android Auto Backup.
        create("BissbilanzDatabase") {
            packageName.set("com.bissbilanz.cache")
            srcDirs.setFrom("src/commonMain/sqldelight")
        }
        // The user's own data. Lives in userdata.db, which IS backed up by
        // Android Auto Backup, so it must never share a file with the sync queue.
        create("UserDataDatabase") {
            packageName.set("com.bissbilanz.userdata")
            srcDirs.setFrom("src/commonMain/sqldelight-userdata")
        }
    }
}
