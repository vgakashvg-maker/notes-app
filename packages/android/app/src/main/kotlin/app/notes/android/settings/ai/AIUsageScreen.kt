package app.notes.android.settings.ai

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TaskAggregate(
    val task: String,
    val calls: Int,
    val promptTokens: Int,
    val completionTokens: Int,
    val avgLatencyMs: Int,
)

data class AIUsageUiState(
    val loading: Boolean = true,
    val days: List<UsageDay> = emptyList(),
    val aggregates: List<TaskAggregate> = emptyList(),
    val avgLatencyPerDay: List<Int> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class AIUsageViewModel @Inject constructor(
    private val repo: AIPrefsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AIUsageUiState())
    val state: StateFlow<AIUsageUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val payload = repo.fetchUsage(days = 14)
            if (payload == null) {
                _state.update { it.copy(loading = false, error = "Could not load usage") }
                return@launch
            }
            val aggregates = aggregate(payload.days)
            val latency = payload.days.map { day ->
                val totalCalls = day.byTask.values.sumOf { it.calls }
                val totalLatencySum = day.byTask.values.sumOf { it.latencyMsSum }
                if (totalCalls == 0) 0 else (totalLatencySum / totalCalls).toInt()
            }
            _state.update { it.copy(loading = false, days = payload.days, aggregates = aggregates, avgLatencyPerDay = latency) }
        }
    }

    private fun aggregate(days: List<UsageDay>): List<TaskAggregate> {
        val acc = mutableMapOf<String, MutableList<UsageTotals>>()
        for (day in days) for ((task, totals) in day.byTask) {
            acc.getOrPut(task) { mutableListOf() }.add(totals)
        }
        return acc.map { (task, all) ->
            val calls = all.sumOf { it.calls }
            val prompt = all.sumOf { it.promptTokens }
            val completion = all.sumOf { it.completionTokens }
            val latencySum = all.sumOf { it.latencyMsSum }
            TaskAggregate(
                task = task,
                calls = calls,
                promptTokens = prompt,
                completionTokens = completion,
                avgLatencyMs = if (calls == 0) 0 else (latencySum / calls).toInt(),
            )
        }.sortedByDescending { it.calls }
    }
}

@Composable
fun AIUsageScreen(viewModel: AIUsageViewModel) {
    val ui by viewModel.state.collectAsState()
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Usage", style = MaterialTheme.typography.titleMedium)
        Text(
            "Calls + tokens + latency per task per day, last 14 days.",
            style = MaterialTheme.typography.bodySmall,
        )
        if (ui.loading) {
            Text("Loading…")
            return@Column
        }
        ui.error?.let { Text(it, color = Color.Red) }
        if (ui.aggregates.isEmpty() && ui.error == null) {
            Text("No usage logged yet.", style = MaterialTheme.typography.bodySmall)
            return@Column
        }
        if (ui.avgLatencyPerDay.isNotEmpty()) Sparkline(points = ui.avgLatencyPerDay)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            items(ui.aggregates) { row ->
                Column {
                    Text(row.task, style = MaterialTheme.typography.titleSmall)
                    Text(
                        "${row.calls} calls · ${row.promptTokens + row.completionTokens} tokens · ${row.avgLatencyMs} ms avg",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun Sparkline(points: List<Int>) {
    val maxY = (points.maxOrNull() ?: 1).coerceAtLeast(1)
    val color = MaterialTheme.colorScheme.primary
    Canvas(
        modifier = Modifier.fillMaxWidth().height(80.dp),
    ) {
        if (points.size < 2) return@Canvas
        val padding = 12f
        val w = size.width - 2 * padding
        val h = size.height - 2 * padding
        val step = w / (points.size - 1)
        val path = Path().apply {
            points.forEachIndexed { i, value ->
                val x = padding + step * i
                val y = padding + h - (value.toFloat() / maxY) * h
                if (i == 0) moveTo(x, y) else lineTo(x, y)
            }
        }
        drawPath(path = path, color = color, style = Stroke(width = 3f))
        // dot for the last point
        val last = points.last()
        val x = padding + step * (points.size - 1)
        val y = padding + h - (last.toFloat() / maxY) * h
        drawCircle(color = color, radius = 4f, center = Offset(x, y))
    }
}
