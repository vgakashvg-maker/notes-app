package app.notes.android.screens.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.notes.android.chat.RenderSegment
import app.notes.android.chat.splitWithCitations

@Composable
fun ChatScreen(viewModel: ChatViewModel) {
    val ui by viewModel.state.collectAsState()
    var input by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Chat")
        ClickableText(
            text = renderBody(ui.text, ui.citations),
            onClick = { /* note-open wiring TBD when /notes/{id} loads real data */ },
        )
        ui.warnings.forEach { Text("⚠ $it") }
        ui.error?.let { Text("✖ $it", color = Color.Red) }
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Ask anything…") },
        )
        Button(
            enabled = input.isNotBlank() && !ui.pending,
            onClick = {
                viewModel.send(input.trim())
                input = ""
            },
        ) { Text(if (ui.pending) "Thinking…" else "Ask") }
    }
}

private fun renderBody(
    text: String,
    citations: Map<String, app.notes.android.chat.CitationEntry>,
): AnnotatedString {
    val segments = splitWithCitations(text, citations)
    return buildAnnotatedString {
        for (segment in segments) {
            when (segment) {
                is RenderSegment.Text -> append(segment.text)
                is RenderSegment.Citation -> withStyle(SpanStyle(color = Color(0xFF3B6CF2))) {
                    append("[${segment.rank}] ${segment.title}")
                }
            }
        }
    }
}
