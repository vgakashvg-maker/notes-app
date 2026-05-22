package app.notes.android.screens.search

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SearchScreen() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
    ) {
        Text("Search")
        Text(
            "Keyword + semantic search land with the NotesService binding " +
                "and a Ktor call to ai/related. Screen scaffolded only.",
        )
    }
}
