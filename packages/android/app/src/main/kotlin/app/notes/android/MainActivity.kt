package app.notes.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.notes.android.auth.AuthStateHolder
import app.notes.android.nav.AppNavGraph
import app.notes.android.ui.theme.NotesTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var auth: AuthStateHolder

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NotesTheme {
                AppScaffold { AppNavGraph(auth = auth) }
            }
        }
    }
}

@Composable
private fun AppScaffold(content: @Composable () -> Unit) {
    Scaffold(modifier = Modifier.fillMaxSize()) { padding ->
        Box(Modifier.padding(padding)) { content() }
    }
}
