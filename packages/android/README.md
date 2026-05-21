# notes-android

Gradle multi-project root for everything Kotlin/Android. The app module
(navigation, Hilt, Compose) lands in M12; M01 seeds this folder with the
first library module, `core-domain`, plus the Gradle wrapper and root
build files.

Sub-modules:

- [`core-domain`](core-domain/README.md) — M01 — pure-Kotlin domain types.

## Build & test

```powershell
# From notes-app\packages\android
.\gradlew.bat test
```

CI runs `./gradlew test --stacktrace` on every PR and push to main.

## Toolchain

- JDK 17 (Temurin)
- Kotlin 2.0.21 JVM
- Gradle 8.10.2 (pinned in `gradle/wrapper/gradle-wrapper.properties`)
