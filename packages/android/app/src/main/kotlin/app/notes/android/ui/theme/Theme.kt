package app.notes.android.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val Brand = Color(0xFF3B6CF2)
private val BrandFg = Color(0xFFFFFFFF)
private val InkLight = Color(0xFF101015)
private val InkDark = Color(0xFFF4F4F5)

// Static fallback palette mirroring tailwind.config.ts on the web side. The
// Android M3 spec asks for full tonal palettes; we keep the surface small
// for V1 — once M15 brings a real design-tokens package both platforms
// pull from it.
private val LightColors = lightColorScheme(
    primary = Brand,
    onPrimary = BrandFg,
    background = Color(0xFFFFFFFF),
    onBackground = InkLight,
    surface = Color(0xFFF4F4F5),
    onSurface = InkLight,
)

private val DarkColors = darkColorScheme(
    primary = Brand,
    onPrimary = BrandFg,
    background = Color(0xFF0B0B0D),
    onBackground = InkDark,
    surface = Color(0xFF14141A),
    onSurface = InkDark,
)

@Composable
fun NotesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S,
    content: @Composable () -> Unit,
) {
    val colors = when {
        dynamicColor && darkTheme -> dynamicDarkColorScheme(LocalContext.current)
        dynamicColor && !darkTheme -> dynamicLightColorScheme(LocalContext.current)
        darkTheme -> DarkColors
        else -> LightColors
    }
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colors.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    MaterialTheme(colorScheme = colors, content = content)
}
