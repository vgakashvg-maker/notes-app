# Keep the workspace data classes used in serialization. These are
# tiny + heavily reflected by kotlinx.serialization; shrinking them
# saves nothing and breaks the chat SSE payloads at runtime.
-keep class app.notes.** { *; }
-keepclassmembers class app.notes.** { *; }

# Hilt-generated classes
-keep class dagger.hilt.** { *; }
-keep class androidx.hilt.** { *; }

# Compose runtime keeps these alive via reflection in some configs.
-dontwarn org.jetbrains.compose.**
