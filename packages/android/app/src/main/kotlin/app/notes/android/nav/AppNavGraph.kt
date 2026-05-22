package app.notes.android.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.notes.android.auth.AuthStateHolder
import app.notes.android.screens.chat.ChatScreen
import app.notes.android.screens.editor.EditorScreen
import app.notes.android.screens.notes.NotesScreen
import app.notes.android.screens.search.SearchScreen
import app.notes.android.screens.settings.SettingsScreen
import app.notes.android.screens.signin.SignInScreen
import app.notes.android.screens.today.TodayScreen
import app.notes.android.settings.ai.AIEndpointScreen
import app.notes.android.settings.ai.AIRoutingScreen
import app.notes.android.settings.ai.AIUsageScreen

/**
 * Single-activity Compose Navigation graph. Auth gate is observed via
 * [AuthStateHolder]; when the token transitions to null the user is
 * pushed back to /sign-in, when it's set we hop to /today. The
 * MainShell composable renders the actual graph + tab bar.
 */
@Composable
fun AppNavGraph(auth: AuthStateHolder) {
    val token by auth.token.collectAsState()
    val nav = rememberNavController()
    val startDest = if (token != null) Destinations.TODAY else Destinations.SIGN_IN

    NavHost(navController = nav, startDestination = startDest) {
        composable(Destinations.SIGN_IN) {
            SignInScreen(
                viewModel = hiltViewModel(),
                onSignedIn = {
                    nav.navigate(Destinations.TODAY) {
                        popUpTo(Destinations.SIGN_IN) { inclusive = true }
                    }
                },
            )
        }
        composable(Destinations.TODAY) {
            TodayScreen(onNavigate = nav::navigate)
        }
        composable(Destinations.NOTES) {
            NotesScreen(onOpen = { id -> nav.navigate(Destinations.editor(id)) })
        }
        composable(
            route = Destinations.EDITOR,
            arguments = listOf(navArgument("id") { type = NavType.StringType }),
        ) { entry ->
            EditorScreen(noteId = entry.arguments?.getString("id") ?: "new")
        }
        composable(Destinations.SEARCH) { SearchScreen() }
        composable(Destinations.CHAT) {
            ChatScreen(viewModel = hiltViewModel())
        }
        composable(Destinations.SETTINGS) {
            SettingsScreen(
                viewModel = hiltViewModel(),
                onSignedOut = {
                    nav.navigate(Destinations.SIGN_IN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onNavigate = nav::navigate,
            )
        }
        composable(Destinations.SETTINGS_AI_ENDPOINT) {
            AIEndpointScreen(viewModel = hiltViewModel())
        }
        composable(Destinations.SETTINGS_AI_ROUTING) {
            AIRoutingScreen(viewModel = hiltViewModel())
        }
        composable(Destinations.SETTINGS_AI_USAGE) {
            AIUsageScreen(viewModel = hiltViewModel())
        }
    }
}
