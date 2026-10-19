plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.vpssentinel"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.vpssentinel"
        minSdk = 26
        targetSdk = 36
        versionCode = (System.getenv("APP_BUILD") ?: "1").toInt()
        versionName = "1.0"
    }

    // 固定的簽章：新版才能直接蓋過舊版安裝
    signingConfigs {
        create("sentinel") {
            storeFile = file("sentinel.jks")
            storePassword = "vps-sentinel"
            keyAlias = "sentinel"
            keyPassword = "vps-sentinel"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("sentinel")
        }
        debug {
            signingConfig = signingConfigs.getByName("sentinel")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.material3:material3:1.5.0-beta01")
    implementation("androidx.compose.material:material-icons-core:1.7.8")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.graphics:graphics-shapes:1.0.1")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.navigation:navigation-compose:2.10.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.core:core-ktx:1.19.1")
}
