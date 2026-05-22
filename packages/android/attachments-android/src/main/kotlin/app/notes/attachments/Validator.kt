package app.notes.attachments

/**
 * Pure-logic backing for the `attachments/validate` Edge Function.
 * The Kotlin twin is kept here for parity with the TS package and so
 * any future Android-side periodic check (e.g. user-triggered "scan
 * Drive now") can reuse the same code path.
 */

enum class ProbeResult { PRESENT, MISSING, ERROR }

interface ValidatorDeps {
    suspend fun fetchPage(cursor: String?): ValidationPage
    suspend fun probe(externalId: String): ProbeResult
    suspend fun recordDangling(entry: DanglingEntry)
}

data class ValidatorSummary(val scanned: Int, val dangling: Int, val probeErrors: Int)

suspend fun runValidator(deps: ValidatorDeps): ValidatorSummary {
    var scanned = 0
    var dangling = 0
    var probeErrors = 0
    var cursor: String? = null
    do {
        val page = deps.fetchPage(cursor)
        for (row in page.rows) {
            scanned += 1
            val originalProbe = deps.probe(row.externalId)
            val thumbnailProbe = if (row.thumbnailId != null) deps.probe(row.thumbnailId) else ProbeResult.PRESENT
            if (originalProbe == ProbeResult.ERROR || thumbnailProbe == ProbeResult.ERROR) {
                probeErrors += 1
                continue
            }
            val missingOriginal = originalProbe == ProbeResult.MISSING
            val missingThumbnail = thumbnailProbe == ProbeResult.MISSING
            if (missingOriginal || missingThumbnail) {
                dangling += 1
                deps.recordDangling(
                    DanglingEntry(
                        attachmentId = row.id,
                        ownerId = row.ownerId,
                        externalId = row.externalId,
                        missingOriginal = missingOriginal,
                        missingThumbnail = missingThumbnail,
                    ),
                )
            }
        }
        cursor = page.nextCursor
    } while (cursor != null)
    return ValidatorSummary(scanned, dangling, probeErrors)
}
