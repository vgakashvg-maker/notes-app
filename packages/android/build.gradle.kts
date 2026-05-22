// M12 adds AGP, Compose, and Hilt plugins to the existing pure-Kotlin
// root build. Sub-modules opt-in via `plugins { id("com.android.application") }`
// / `kotlin("plugin.compose")` / `id("com.google.dagger.hilt.android")`.
plugins {
    kotlin("jvm") version "2.0.21" apply false
    id("com.android.application") version "8.7.3" apply false
    id("com.android.library") version "8.7.3" apply false
    kotlin("android") version "2.0.21" apply false
    kotlin("plugin.compose") version "2.0.21" apply false
    id("com.google.devtools.ksp") version "2.0.21-1.0.27" apply false
    id("com.google.dagger.hilt.android") version "2.52" apply false
}
