@file:Suppress("UnstableApiUsage")

pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        google()
    }
}

plugins {
    // Auto-provision missing JDK toolchains. The other modules pin 17;
    // Android Studio ships a 21 JBR, so without this resolver the build
    // fails on a fresh box.
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.9.0"
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        google()
    }
}

rootProject.name = "notes-android"

include(
    ":app",
    ":core-domain",
    ":auth-android",
    ":notes-android",
    ":editor-schema",
    ":sync-core",
    ":storage-android",
    ":attachments-android",
)
