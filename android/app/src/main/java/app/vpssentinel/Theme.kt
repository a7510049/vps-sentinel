@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app.vpssentinel

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/* 跟網頁預設的藍色主題一樣（#4a7dff 算出來的色調） */
private val Light = lightColorScheme(
    primary = Color(0xFF3F5DAA), onPrimary = Color.White, primaryContainer = Color(0xFFDAE2FF), onPrimaryContainer = Color(0xFF001848),
    secondary = Color(0xFF585E71), onSecondary = Color.White, secondaryContainer = Color(0xFFDCE2F9), onSecondaryContainer = Color(0xFF151B2C),
    tertiary = Color(0xFF735470), onTertiary = Color.White, tertiaryContainer = Color(0xFFFFD6F8), onTertiaryContainer = Color(0xFF2B122B),
    error = Color(0xFFBA1A1A), onError = Color.White, errorContainer = Color(0xFFFFDAD6), onErrorContainer = Color(0xFF410002),
    background = Color(0xFFF9F9FF), onBackground = Color(0xFF1A1B21), surface = Color(0xFFF9F9FF), onSurface = Color(0xFF1A1B21),
    surfaceVariant = Color(0xFFE1E2EC), onSurfaceVariant = Color(0xFF44464F), outline = Color(0xFF757780), outlineVariant = Color(0xFFC5C6D0),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF3F3FA), surfaceContainer = Color(0xFFEDEDF4),
    surfaceContainerHigh = Color(0xFFE8E7EF), surfaceContainerHighest = Color(0xFFE2E2E9),
    inverseSurface = Color(0xFF2F3036), inverseOnSurface = Color(0xFFF1F0F7), inversePrimary = Color(0xFFB2C5FF),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFB2C5FF), onPrimary = Color(0xFF0C2D78), primaryContainer = Color(0xFF264590), onPrimaryContainer = Color(0xFFDAE2FF),
    secondary = Color(0xFFC0C6DC), onSecondary = Color(0xFF2A3042), secondaryContainer = Color(0xFF404659), onSecondaryContainer = Color(0xFFDCE2F9),
    tertiary = Color(0xFFE2BBDB), onTertiary = Color(0xFF422741), tertiaryContainer = Color(0xFF5A3D58), onTertiaryContainer = Color(0xFFFFD6F8),
    error = Color(0xFFFFB4AB), onError = Color(0xFF690005), errorContainer = Color(0xFF93000A), onErrorContainer = Color(0xFFFFDAD6),
    background = Color(0xFF121318), onBackground = Color(0xFFE2E2E9), surface = Color(0xFF121318), onSurface = Color(0xFFE2E2E9),
    surfaceVariant = Color(0xFF44464F), onSurfaceVariant = Color(0xFFC5C6D0), outline = Color(0xFF8F909A), outlineVariant = Color(0xFF44464F),
    surfaceContainerLowest = Color(0xFF0C0E13), surfaceContainerLow = Color(0xFF1A1B21), surfaceContainer = Color(0xFF1E1F25),
    surfaceContainerHigh = Color(0xFF282A2F), surfaceContainerHighest = Color(0xFF33353A),
    inverseSurface = Color(0xFFE2E2E9), inverseOnSurface = Color(0xFF2F3036), inversePrimary = Color(0xFF3F5DAA),
)

/** 狀態色：只拿來表示正常／注意／異常 */
@Immutable
data class Status(val ok: Color, val okC: Color, val warn: Color, val warnC: Color, val bad: Color, val badC: Color, val onC: Color)

val LocalStatus = staticCompositionLocalOf { Status(Color.Green, Color.Green, Color.Yellow, Color.Yellow, Color.Red, Color.Red, Color.Black) }

object St {
    val c: Status @Composable @ReadOnlyComposable get() = LocalStatus.current
}

@Composable
fun SentinelTheme(dynamic: Boolean, content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val ctx = LocalContext.current
    val scheme: ColorScheme = when {
        dynamic && Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> Dark
        else -> Light
    }
    val status = if (dark) Status(Color(0xFF7DD99A), Color(0xFF1F4D2E), Color(0xFFFFB86B), Color(0xFF5A3500), scheme.error, scheme.errorContainer, Color(0xFFF1F0F7))
    else Status(Color(0xFF1E7A3E), Color(0xFFC9EFD2), Color(0xFFB45A00), Color(0xFFFFE0C2), scheme.error, scheme.errorContainer, Color(0xFF1A1B21))
    CompositionLocalProvider(LocalStatus provides status) {
        MaterialExpressiveTheme(colorScheme = scheme, motionScheme = MotionScheme.expressive(), typography = MaterialTheme.typography, content = content)
    }
}
