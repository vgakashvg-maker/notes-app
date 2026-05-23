package app.notes.android.calendar

import app.notes.android.auth.AuthStateHolder
import app.notes.android.di.SupabaseAnonKey
import app.notes.android.di.SupabaseUrl
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * PostgREST binding for the M08 events_mirror table. RLS does the
 * scoping; the JWT comes from AuthStateHolder. M08's calendar/sync
 * Edge Function is what populates the table — this repo just reads.
 */
@Singleton
class CalendarRepository @Inject constructor(
    private val http: HttpClient,
    private val auth: AuthStateHolder,
    private val json: Json,
    @SupabaseUrl private val supabaseUrl: String,
    @SupabaseAnonKey private val anonKey: String,
) {
    suspend fun listEventsToday(): List<TodayEventRow> {
        val jwt = auth.token.value ?: return emptyList()
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val startIso = today.atStartOfDay(zone).format(DateTimeFormatter.ISO_INSTANT)
        val endIso = today.plusDays(1).atStartOfDay(zone).format(DateTimeFormatter.ISO_INSTANT)
        val url =
            "$supabaseUrl/rest/v1/events_mirror?select=id,title,start_at,end_at,calendar_id" +
                "&start_at=gte.$startIso&start_at=lt.$endIso&order=start_at.asc"
        val resp: HttpResponse = http.get(url) {
            headers {
                append(HttpHeaders.Authorization, "Bearer $jwt")
                append("apikey", anonKey)
                append(HttpHeaders.Accept, "application/json")
            }
        }
        if (!resp.status.isSuccess()) return emptyList()
        val arr = runCatching { json.parseToJsonElement(resp.bodyAsText()) as? JsonArray }.getOrNull()
            ?: return emptyList()
        return arr.mapNotNull(::parseRow)
    }

    suspend fun triggerSync(): Boolean {
        val jwt = auth.token.value ?: return false
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val startIso = today.atStartOfDay(zone).format(DateTimeFormatter.ISO_INSTANT)
        val endIso = today.plusDays(7).atStartOfDay(zone).format(DateTimeFormatter.ISO_INSTANT)
        val payload = """{"rangeStart":"$startIso","rangeEnd":"$endIso"}"""
        val resp: HttpResponse = http.post("$supabaseUrl/functions/v1/calendar-sync") {
            contentType(ContentType.Application.Json)
            headers { append(HttpHeaders.Authorization, "Bearer $jwt") }
            setBody(payload)
        }
        return resp.status.isSuccess()
    }

    private fun parseRow(element: kotlinx.serialization.json.JsonElement): TodayEventRow? {
        val obj = element as? JsonObject ?: return null
        val id = (obj["id"] as? JsonPrimitive)?.contentOrNull ?: return null
        val title = (obj["title"] as? JsonPrimitive)?.contentOrNull ?: return null
        val startAt = (obj["start_at"] as? JsonPrimitive)?.contentOrNull ?: return null
        val endAt = (obj["end_at"] as? JsonPrimitive)?.contentOrNull ?: return null
        val calendarId = (obj["calendar_id"] as? JsonPrimitive)?.contentOrNull ?: "primary"
        return TodayEventRow(id, title, startAt, endAt, calendarId)
    }
}

data class TodayEventRow(
    val id: String,
    val title: String,
    val startAt: String,
    val endAt: String,
    val calendarId: String,
)

