package app.notes.android.settings.ai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.notes.domain.AIProviderId
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AIEndpointUiState(
    val url: String = "",
    val original: String = "",
    val testing: Boolean = false,
    val saving: Boolean = false,
    val testResult: TestConnectionResult? = null,
    val saveError: String? = null,
    val saved: Boolean = false,
)

@HiltViewModel
class AIEndpointViewModel @Inject constructor(
    private val repo: AIPrefsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AIEndpointUiState())
    val state: StateFlow<AIEndpointUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val prefs = repo.load()
            val existing = prefs.endpoints[AIProviderId.Ollama] ?: ""
            _state.update { it.copy(url = existing, original = existing) }
        }
    }

    fun setUrl(value: String) = _state.update { it.copy(url = value, saved = false, testResult = null) }

    fun test() {
        viewModelScope.launch {
            _state.update { it.copy(testing = true, testResult = null) }
            val res = repo.testConnection(_state.value.url.trim())
            _state.update { it.copy(testing = false, testResult = res) }
        }
    }

    fun save() {
        viewModelScope.launch {
            _state.update { it.copy(saving = true, saveError = null) }
            val current = repo.load()
            val nextEndpoints = current.endpoints.toMutableMap().apply {
                put(AIProviderId.Ollama, _state.value.url.trim())
            }
            val ok = repo.save(AIPrefs(routing = current.routing, endpoints = nextEndpoints))
            _state.update {
                if (ok) it.copy(saving = false, saved = true, original = it.url)
                else it.copy(saving = false, saveError = "Save failed")
            }
        }
    }
}

@Composable
fun AIEndpointScreen(viewModel: AIEndpointViewModel) {
    val ui by viewModel.state.collectAsState()
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Ollama endpoint", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
        Text(
            "Tailscale Funnel URL of your home box. Test before saving — calls ai/test-connection.",
            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
        )
        OutlinedTextField(
            value = ui.url,
            onValueChange = viewModel::setUrl,
            label = { Text("Ollama URL") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxSize().padding(top = 4.dp, bottom = 4.dp),
        )
        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = viewModel::test, enabled = !ui.testing && ui.url.isNotBlank()) {
                Text(if (ui.testing) "Testing…" else "Test connection")
            }
            Button(onClick = viewModel::save, enabled = !ui.saving && ui.url != ui.original) {
                Text(if (ui.saving) "Saving…" else "Save")
            }
            if (ui.saved) Text("Saved", style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
        }
        val res = ui.testResult
        if (res != null) {
            if (res.ok) {
                Text("Connected", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                LazyColumn { items(res.models) { m -> Text("• $m") } }
            } else {
                Text(res.error ?: "Test failed")
            }
        }
        ui.saveError?.let { Text(it) }
    }
}
