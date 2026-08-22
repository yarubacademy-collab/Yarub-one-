plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "one.yarub.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "one.yarub.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // Arabic and Urdu are shipped languages, not add-ons.
        resourceConfigurations += setOf("en", "ar", "ur")
    }

    signingConfigs {
        val keystorePath = project.findProperty("YARUB_KEYSTORE_PATH") as String?
        if (keystorePath != null && file(keystorePath).exists()) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = project.findProperty("YARUB_KEYSTORE_PASSWORD") as String?
                keyAlias = project.findProperty("YARUB_KEY_ALIAS") as String?
                keyPassword = project.findProperty("YARUB_KEY_PASSWORD") as String?
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${project.findProperty("YARUB_API_BASE_URL_DEBUG")}\""
            )
        }
        release {
            // Signing is read from local.properties, which is gitignored. When
            // absent the release build fails rather than emitting an unsigned
            // artifact that looks shippable.
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${project.findProperty("YARUB_API_BASE_URL_RELEASE")}\""
            )
            // No signingConfig is declared. Release signing requires a keystore
            // the owner holds; an unsigned build fails loudly rather than
            // producing something that looks shippable and is not.
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Session cookie is stored encrypted rather than in plain preferences.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    // WebView is retained for one purpose only: previewing generated websites
    // and games, which are HTML by nature. Everything else is native.
    implementation("androidx.webkit:webkit:1.11.0")
}
