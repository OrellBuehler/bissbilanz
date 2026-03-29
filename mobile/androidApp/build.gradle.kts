plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.compose.compiler)
}

kotlin {
    androidTarget {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    sourceSets {
        androidMain.dependencies {
            implementation(project(":shared"))
            implementation(libs.kotlinx.serialization.json)
        }
    }
}

val appVersion = (findProperty("APP_VERSION") as? String)?.trimStart('v') ?: "dev"
val computedVersionCode =
    if (appVersion != "dev") {
        val parts = appVersion.split(".").map { it.toIntOrNull() ?: 0 }
        (parts.getOrElse(0) { 0 } * 10000 + parts.getOrElse(1) { 0 } * 100 + parts.getOrElse(2) { 0 }).coerceAtLeast(1)
    } else {
        1
    }

android {
    namespace = "com.bissbilanz.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bissbilanz.android"
        minSdk = 26
        targetSdk = 35
        versionCode = computedVersionCode
        versionName = appVersion
        buildConfigField("String", "SENTRY_DSN", "\"${findProperty("SENTRY_DSN") ?: System.getenv("SENTRY_DSN") ?: ""}\"")
        buildConfigField("String", "BASE_URL", "\"https://bissbilanz.orellbuehler.ch\"")
        buildConfigField("String", "TEST_AUTH_TOKEN", "\"\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
        debug {
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:4000\"")
            buildConfigField("String", "TEST_AUTH_TOKEN", "\"test-integration-token\"")
        }
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        disable += "NullSafeMutableLiveData"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    dependencies {
        implementation(platform(libs.compose.bom))
        implementation(libs.compose.ui)
        implementation(libs.compose.ui.tooling.preview)
        implementation(libs.compose.material3)
        implementation(libs.compose.material.icons)
        implementation(libs.compose.navigation)
        implementation(libs.activity.compose)
        implementation(libs.lifecycle.runtime.compose)
        implementation(libs.lifecycle.viewmodel.compose)
        implementation(libs.koin.android)
        implementation(libs.koin.compose)
        implementation(libs.kotlinx.datetime)
        implementation(libs.camerax.core)
        implementation(libs.camerax.camera2)
        implementation(libs.camerax.lifecycle)
        implementation(libs.camerax.view)
        implementation(libs.mlkit.barcode)
        implementation(libs.health.connect)
        implementation(libs.browser)
        implementation(libs.sentry.android)
        implementation(libs.coil.compose)
        implementation(libs.glance.appwidget)
        implementation(libs.work.runtime)
        implementation("com.google.guava:guava:33.5.0-android")
        debugImplementation(libs.compose.ui.tooling)
        testImplementation(libs.kotlin.test)
        testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.3.10")
        testImplementation(libs.mockk)
        testImplementation(libs.kotlinx.coroutines.test)
        testImplementation(libs.turbine)
        testImplementation(libs.compose.ui.test.junit4)
        testImplementation(libs.robolectric)
        testImplementation("androidx.navigation:navigation-testing:2.8.5")
        debugImplementation(libs.compose.ui.test.manifest)
        androidTestImplementation(platform(libs.compose.bom))
        androidTestImplementation(libs.compose.ui.test.junit4.android)
        androidTestImplementation(libs.test.runner)
        androidTestImplementation(libs.test.rules)
    }
}
