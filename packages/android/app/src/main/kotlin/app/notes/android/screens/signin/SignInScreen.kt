package app.notes.android.screens.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import app.notes.android.auth.AuthStateHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * V1 sign-in screen: paste a Supabase access token. The Custom Tabs +
 * deep-link OAuth flow lands when the SupabaseAuthHttp adapter binding is
 * wired — that's gated on M16-equivalent infrastructure. This surface
 * exercises the same [AuthStateHolder] the OAuth flow will eventually
 * publish to, so the rest of the graph stays unchanged.
 */
@Composable
fun SignInScreen(viewModel: SignInViewModel, onSignedIn: () -> Unit) {
    var pasted by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "Sign in to Notes")
        Text(
            text = "Paste a Supabase access token. Custom Tabs OAuth lands later.",
        )
        OutlinedTextField(
            value = pasted,
            onValueChange = { pasted = it },
            label = { Text("Supabase JWT") },
            singleLine = true,
        )
        Button(
            enabled = pasted.isNotBlank(),
            onClick = {
                viewModel.signIn(pasted.trim())
                onSignedIn()
            },
        ) { Text("Continue") }
    }
}

@HiltViewModel
class SignInViewModel @Inject constructor(
    private val auth: AuthStateHolder,
) : ViewModel() {
    fun signIn(jwt: String) {
        auth.setToken(jwt)
    }
}
