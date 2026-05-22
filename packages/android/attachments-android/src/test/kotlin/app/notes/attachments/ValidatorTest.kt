package app.notes.attachments

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ValidatorTest {
    private fun row(id: String, externalId: String, thumbnailId: String? = null) =
        ValidationRow(id, externalId, thumbnailId, "owner-1")

    @Test
    fun `returns 0 dangling for a corpus where every row is present`() = runTest {
        val deps = FakeDeps(
            pages = mutableListOf(ValidationPage(listOf(row("a", "ext-a"), row("b", "ext-b")), null)),
            probeFn = { _ -> ProbeResult.PRESENT },
        )
        val summary = runValidator(deps)
        assertEquals(ValidatorSummary(scanned = 2, dangling = 0, probeErrors = 0), summary)
        assertEquals(0, deps.recordedDangling.size)
    }

    @Test
    fun `records a dangling entry when the original is missing`() = runTest {
        val deps = FakeDeps(
            pages = mutableListOf(ValidationPage(listOf(row("a", "ext-a")), null)),
            probeFn = { id -> if (id == "ext-a") ProbeResult.MISSING else ProbeResult.PRESENT },
        )
        val summary = runValidator(deps)
        assertEquals(1, summary.dangling)
        val r = deps.recordedDangling.single()
        assertEquals(true, r.missingOriginal)
        assertEquals(false, r.missingThumbnail)
    }

    @Test
    fun `flags missing thumbnail with present original`() = runTest {
        val deps = FakeDeps(
            pages = mutableListOf(ValidationPage(listOf(row("a", "ext-a", "thumb-a")), null)),
            probeFn = { id -> if (id == "thumb-a") ProbeResult.MISSING else ProbeResult.PRESENT },
        )
        val summary = runValidator(deps)
        assertEquals(1, summary.dangling)
        val r = deps.recordedDangling.single()
        assertEquals(false, r.missingOriginal)
        assertEquals(true, r.missingThumbnail)
    }

    @Test
    fun `does not record when probe errors out`() = runTest {
        val deps = FakeDeps(
            pages = mutableListOf(ValidationPage(listOf(row("a", "ext-a")), null)),
            probeFn = { _ -> ProbeResult.ERROR },
        )
        val summary = runValidator(deps)
        assertEquals(0, summary.dangling)
        assertEquals(1, summary.probeErrors)
        assertEquals(0, deps.recordedDangling.size)
    }

    @Test
    fun `paginates through every page until nextCursor is null`() = runTest {
        val deps = FakeDeps(
            pages = mutableListOf(
                ValidationPage(listOf(row("a", "ext-a")), "c1"),
                ValidationPage(listOf(row("b", "ext-b")), "c2"),
                ValidationPage(listOf(row("c", "ext-c")), null),
            ),
            probeFn = { _ -> ProbeResult.PRESENT },
        )
        val summary = runValidator(deps)
        assertEquals(3, summary.scanned)
    }
}

private class FakeDeps(
    private val pages: MutableList<ValidationPage>,
    private val probeFn: suspend (String) -> ProbeResult,
) : ValidatorDeps {
    val recordedDangling = mutableListOf<DanglingEntry>()
    override suspend fun fetchPage(cursor: String?): ValidationPage = pages.removeAt(0)
    override suspend fun probe(externalId: String): ProbeResult = probeFn(externalId)
    override suspend fun recordDangling(entry: DanglingEntry) { recordedDangling.add(entry) }
}
