package app.notes.android.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import app.notes.android.auth.AuthStateHolder
import app.notes.android.nav.Destinations
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onSignedOut: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.titleLarge)
        Text("AI", style = MaterialTheme.typography.titleSmall)
        TextButton(onClick = { onNavigate(Destinations.SETTINGS_AI_ENDPOINT) }) { Text("Endpoint →") }
        TextButton(onClick = { onNavigate(Destinations.SETTINGS_AI_ROUTING) }) { Text("Routing →") }
        TextButton(onClick = { onNavigate(Destinations.SETTINGS_AI_USAGE) }) { Text("Usage →") }
        Text("Account", style = MaterialTheme.typography.titleSmall)
        Button(onClick = {
            viewModel.signOut()
            onSignedOut()
        }) { Text("Sign out") }
    }
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val auth: AuthStateHolder,
) : ViewModel() {
    fun signOut() {
        auth.clear()
    }
}
