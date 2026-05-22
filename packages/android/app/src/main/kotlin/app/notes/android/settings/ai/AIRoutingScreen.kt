package app.notes.android.settings.ai

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.notes.domain.AIProviderId
import app.notes.domain.AITask
import app.notes.domain.AdapterBinding
import app.notes.domain.RoutingConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private data class TaskGroup(val title: String, val description: String, val rows: List<Pair<AITask, String>>)

private val GROUPS = listOf(
    TaskGroup(
        title = "Content",
        description = "Defaults to qwen2.5:7b.",
        rows = listOf(
            AITask.Chat to "Chat with notes",
            AITask.Summarize to "Summarize note",
            AITask.Rewrite to "Rewrite selection",
            AITask.ExtractActions to "Extract action items",
            AITask.Briefing to "Daily briefing",
        ),
    ),
    TaskGroup(
        title = "Metadata",
        description = "Defaults to llama3.2:3b.",
        rows = listOf(
            AITask.SuggestTags to "Suggest tags",
            AITask.SuggestTitle to "Suggest title",
            AITask.Compression to "Compress conversation",
        ),
    ),
    TaskGroup(
        title = "Embeddings",
        description = "Changing this re-embeds all notes.",
        rows = listOf(AITask.Embed to "Embed for search"),
    ),
)

private val DEFAULT_MODELS = mapOf(
    AITask.Chat to "qwen2.5:7b",
    AITask.Summarize to "qwen2.5:7b",
    AITask.SuggestTags to "llama3.2:3b",
    AITask.SuggestTitle to "llama3.2:3b",
    AITask.ExtractActions to "qwen2.5:7b",
    AITask.Rewrite to "qwen2.5:7b",
    AITask.Briefing to "qwen2.5:7b",
    AITask.Compression to "llama3.2:3b",
    AITask.Embed to "nomic-embed-text",
)

data class AIRoutingUiState(
    val routing: RoutingConfig = RoutingConfig(),
    val initialEmbed: String = DEFAULT_MODELS[AITask.Embed]!!,
    val availableModels: List<String> = DEFAULT_MODELS.values.distinct(),
    val saving: Boolean = false,
    val saved: Boolean = false,
    val reindexing: Boolean = false,
    val reindexNote: String? = null,
    val error: String? = null,
)

@HiltViewModel
class AIRoutingViewModel @Inject constructor(
    private val repo: AIPrefsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AIRoutingUiState())
    val state: StateFlow<AIRoutingUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val prefs = repo.load()
            val routing = prefs.routing ?: RoutingConfig()
            val endpoint = prefs.endpoints[AIProviderId.Ollama]
            val available = if (endpoint != null) {
                val res = repo.testConnection(endpoint)
                if (res.ok) (res.models + DEFAULT_MODELS.values).distinct()
                else DEFAULT_MODELS.values.distinct()
            } else DEFAULT_MODELS.values.distinct()
            _state.update {
                it.copy(
                    routing = routing,
                    initialEmbed = routing.embed?.model ?: DEFAULT_MODELS[AITask.Embed]!!,
                    availableModels = available,
                )
            }
        }
    }

    fun setModel(task: AITask, model: String) {
        _state.update { state ->
            val current = state.routing
            val binding = AdapterBinding(AIProviderId.Ollama, model)
            val nextRouting = when (task) {
                AITask.Chat -> current.copy(chat = binding)
                AITask.Summarize -> current.copy(summarize = binding)
                AITask.SuggestTags -> current.copy(suggestTags = binding)
                AITask.SuggestTitle -> current.copy(suggestTitle = binding)
                AITask.ExtractActions -> current.copy(extractActions = binding)
                AITask.Rewrite -> current.copy(rewrite = binding)
                AITask.Briefing -> current.copy(briefing = binding)
                AITask.Compression -> current.copy(compression = binding)
                AITask.Embed -> current.copy(embed = binding)
            }
            state.copy(routing = nextRouting, saved = false)
        }
    }

    fun save() {
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null, reindexNote = null) }
            val current = repo.load()
            val ok = repo.save(AIPrefs(routing = _state.value.routing, endpoints = current.endpoints))
            if (!ok) {
                _state.update { it.copy(saving = false, error = "Save failed") }
                return@launch
            }
            val newEmbed = _state.value.routing.embed?.model ?: DEFAULT_MODELS[AITask.Embed]!!
            val changed = newEmbed != _state.value.initialEmbed
            _state.update { it.copy(saving = false, saved = true, initialEmbed = newEmbed) }
            if (changed) reindex()
        }
    }

    private fun reindex() {
        viewModelScope.launch {
            _state.update { it.copy(reindexing = true, reindexNote = "Re-embedding all notes…") }
            val r = repo.reindex()
            _state.update {
                it.copy(
                    reindexing = false,
                    reindexNote = if (r.ok) "Re-embed kicked off — ${r.processed} notes touched."
                    else "Re-embed failed; check Endpoint.",
                )
            }
        }
    }

    fun modelFor(task: AITask): String =
        _state.value.routing.bindingFor(task)?.model ?: DEFAULT_MODELS[task]!!
}

@Composable
fun AIRoutingScreen(viewModel: AIRoutingViewModel) {
    val ui by viewModel.state.collectAsState()
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Routing", style = MaterialTheme.typography.titleMedium)
        Text(
            "Pick a model per task. Empty endpoint? Set Ollama URL in Endpoint first.",
            style = MaterialTheme.typography.bodySmall,
        )
        for (group in GROUPS) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(group.title, style = MaterialTheme.typography.titleSmall)
                Text(group.description, style = MaterialTheme.typography.bodySmall)
                for ((task, label) in group.rows) {
                    Row(
                        modifier = Modifier.fillMaxSize().padding(vertical = 4.dp),
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(label, modifier = Modifier.weight(1f))
                        var expanded by remember { mutableStateOf(false) }
                        val current = viewModel.modelFor(task)
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Text(current, style = MaterialTheme.typography.bodyMedium)
                            IconButton(onClick = { expanded = true }) {
                                Icon(Icons.Default.ArrowDropDown, contentDescription = "Pick model")
                            }
                            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                for (model in ui.availableModels) {
                                    DropdownMenuItem(
                                        text = { Text(model) },
                                        onClick = {
                                            viewModel.setModel(task, model)
                                            expanded = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = viewModel::save, enabled = !ui.saving) {
                Text(if (ui.saving) "Saving…" else "Save routing")
            }
            if (ui.saved) Text("Saved", style = MaterialTheme.typography.labelSmall)
            if (ui.reindexing) Text("Re-embedding…", style = MaterialTheme.typography.labelSmall)
        }
        ui.error?.let { Text(it, color = androidx.compose.ui.graphics.Color.Red) }
        ui.reindexNote?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}
