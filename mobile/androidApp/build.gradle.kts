plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.compose.compiler)
}

kotlin {
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "17"
            }
        }
    }

    sourceSets {
        androidMain.dependencies {
            implementation(project(":shared"))
        }
    }
}

android {
    namespace = "com.bissbilanz.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bissbilanz.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildFeatures {
        compose = true
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
        implementation(libs.camerax.core)
        implementation(libs.camerax.camera2)
        implementation(libs.camerax.lifecycle)
        implementation(libs.camerax.view)
        implementation(libs.mlkit.barcode)
        implementation(libs.health.connect)
        debugImplementation(libs.compose.ui.tooling)
    }
}
