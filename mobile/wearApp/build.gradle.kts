plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.compose.compiler)
}

val appVersion = (findProperty("APP_VERSION") as? String)?.trimStart('v') ?: "dev"
val buildNumber = (findProperty("BUILD_NUMBER") as? String)?.toIntOrNull() ?: 0

// Must match the phone app's scheme: a watch APK is uploaded alongside the phone
// APK and Play compares version codes across the pair.
val computedVersionCode =
    if (appVersion != "dev") {
        val parts = appVersion.split(".").map { it.toIntOrNull() ?: 0 }
        val semverCode = parts.getOrElse(0) { 0 } * 10000 + parts.getOrElse(1) { 0 } * 100 + parts.getOrElse(2) { 0 }
        (semverCode * 1000 + buildNumber).coerceAtLeast(1)
    } else {
        1
    }

android {
    namespace = "com.bissbilanz.wear"
    compileSdk = 37

    defaultConfig {
        // Same applicationId as the phone app: that is how Play pairs a watch
        // APK with its phone app for automatic install.
        applicationId = "com.bissbilanz.android"
        minSdk = 30
        targetSdk = 36
        versionCode = computedVersionCode
        versionName = appVersion
    }

    signingConfigs {
        create("release") {
            val ksFile = System.getenv("ANDROID_KEYSTORE_FILE")
            if (ksFile != null) {
                storeFile = file(ksFile)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (System.getenv("ANDROID_KEYSTORE_FILE") != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    lint {
        // HardcodedText is promoted to error in lint.xml, same as the phone app.
        abortOnError = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.wear.compose.material)
    implementation(libs.wear.compose.foundation)
    implementation(libs.wear.compose.navigation)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(project(":wearProtocol"))
    implementation(libs.play.services.wearable)
    implementation(libs.wear.complications.datasource)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.kotlin.test)
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.4.10")
    testImplementation(libs.kotlinx.coroutines.test)
}
