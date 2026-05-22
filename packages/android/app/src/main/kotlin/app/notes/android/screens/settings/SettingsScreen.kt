package app.notes.android.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import app.notes.android.auth.AuthStateHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onSignedOut: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings")
        Text(
            "Theme controls + M15 AI routing surface here later. " +
                "M12 ships the sign-out hook only.",
        )
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
