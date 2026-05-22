package app.notes.android.settings.ai

import app.notes.android.auth.AuthStateHolder
import app.notes.android.di.SupabaseAnonKey
import app.notes.android.di.SupabaseUrl
import app.notes.domain.AIProviderId
import app.notes.domain.AdapterBinding
import app.notes.domain.AITask
import app.notes.domain.RoutingConfig
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * Thin client for the M15 ai_prefs payload. Talks PostgREST directly
 * (the broader NotesService binding stays decoupled). All reads/writes
 * are RLS-scoped by the caller's JWT.
 */
@Singleton
class AIPrefsRepository @Inject constructor(
    private val http: HttpClient,
    private val auth: AuthStateHolder,
    private val json: Json,
    @SupabaseUrl private val supabaseUrl: String,
    @SupabaseAnonKey private val anonKey: String,
) {
    suspend fun load(): AIPrefs {
        val jwt = auth.token.value ?: return AIPrefs(routing = RoutingConfig(), endpoints = emptyMap())
        val resp: HttpResponse = http.get("$supabaseUrl/rest/v1/users_profile?select=ai_prefs") {
            headers {
                append(HttpHeaders.Authorization, "Bearer $jwt")
                append("apikey", anonKey)
                append("Accept", "application/json")
            }
        }
        if (!resp.status.isSuccess()) return AIPrefs(routing = RoutingConfig(), endpoints = emptyMap())
        val body = resp.bodyAsText()
        val rows = runCatching { json.parseToJsonElement(body) }.getOrNull()
        val ai = rows?.let {
            if (it is kotlinx.serialization.json.JsonArray && it.isNotEmpty()) {
                (it[0] as? JsonObject)?.get("ai_prefs") as? JsonObject
            } else null
        } ?: return AIPrefs(routing = RoutingConfig(), endpoints = emptyMap())
        return AIPrefs(routing = parseRouting(ai), endpoints = parseEndpoints(ai))
    }

    suspend fun save(prefs: AIPrefs): Boolean {
        val jwt = auth.token.value ?: return false
        val payload = buildJsonObject {
            put("ai_prefs", encode(prefs))
        }
        val resp: HttpResponse = http.patch(
            "$supabaseUrl/rest/v1/users_profile?user_id=neq.00000000-0000-0000-0000-000000000000",
        ) {
            contentType(ContentType.Application.Json)
            headers {
                append(HttpHeaders.Authorization, "Bearer $jwt")
                append("apikey", anonKey)
                append("Prefer", "return=minimal")
            }
            setBody(json.encodeToString(JsonObject.serializer(), payload))
        }
        return resp.status.isSuccess()
    }

    suspend fun testConnection(url: String): TestConnectionResult {
        val jwt = auth.token.value ?: return TestConnectionResult(ok = false, error = "not signed in")
        val resp: HttpResponse = http.post("$supabaseUrl/functions/v1/ai/test-connection") {
            contentType(ContentType.Application.Json)
            headers { append(HttpHeaders.Authorization, "Bearer $jwt") }
            setBody(json.encodeToString(JsonObject.serializer(), buildJsonObject {
                put("endpoint_url", url)
            }))
        }
        val body = resp.bodyAsText()
        val root = runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull()
            ?: return TestConnectionResult(ok = false, error = "Bad response")
        val ok = (root["ok"] as? JsonPrimitive)?.contentOrNull == "true"
        if (!ok) {
            val errMessage = ((root["error"] as? JsonObject)?.get("message") as? JsonPrimitive)?.contentOrNull
            return TestConnectionResult(ok = false, error = errMessage ?: "Test failed")
        }
        val modelsArr = (root["models"] as? kotlinx.serialization.json.JsonArray) ?: kotlinx.serialization.json.JsonArray(emptyList())
        val models = modelsArr.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        return TestConnectionResult(ok = true, models = models)
    }

    suspend fun reindex(): ReindexResult {
        val jwt = auth.token.value ?: return ReindexResult(ok = false)
        val resp: HttpResponse = http.post("$supabaseUrl/functions/v1/ai/reindex") {
            headers {
                append(HttpHeaders.Authorization, "Bearer $jwt")
                append(HttpHeaders.ContentType, "application/json")
            }
        }
        if (!resp.status.isSuccess()) return ReindexResult(ok = false)
        val root = runCatching { json.parseToJsonElement(resp.bodyAsText()).jsonObject }.getOrNull()
            ?: return ReindexResult(ok = false)
        val processed = ((root["processed"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull()) ?: 0
        return ReindexResult(ok = true, processed = processed)
    }

    suspend fun fetchUsage(days: Int = 14): UsagePayload? {
        val jwt = auth.token.value ?: return null
        val resp: HttpResponse = http.get("$supabaseUrl/functions/v1/ai/usage?days=$days") {
            headers { append(HttpHeaders.Authorization, "Bearer $jwt") }
        }
        if (!resp.status.isSuccess()) return null
        val root = runCatching { json.parseToJsonElement(resp.bodyAsText()).jsonObject }.getOrNull()
            ?: return null
        val buckets = (root["buckets"] as? kotlinx.serialization.json.JsonArray) ?: return UsagePayload(emptyList())
        val days = buckets.mapNotNull { (it as? JsonObject)?.let(::parseDay) }
        return UsagePayload(days)
    }

    private fun parseDay(obj: JsonObject): UsageDay? {
        val date = (obj["date"] as? JsonPrimitive)?.contentOrNull ?: return null
        val byTask = (obj["byTask"] as? JsonObject)?.entries?.associate { (task, value) ->
            val row = value as? JsonObject ?: return@associate task to UsageTotals()
            task to UsageTotals(
                calls = (row["calls"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: 0,
                promptTokens = (row["promptTokens"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: 0,
                completionTokens = (row["completionTokens"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: 0,
                latencyMsSum = (row["latencyMsSum"] as? JsonPrimitive)?.contentOrNull?.toLongOrNull() ?: 0L,
            )
        } ?: emptyMap()
        return UsageDay(date, byTask)
    }

    private fun parseRouting(ai: JsonObject): RoutingConfig {
        val routing = ai["routing"] as? JsonObject ?: return RoutingConfig()
        return RoutingConfig(
            chat = routing.binding("chat"),
            summarize = routing.binding("summarize"),
            suggestTags = routing.binding("suggest_tags"),
            suggestTitle = routing.binding("suggest_title"),
            extractActions = routing.binding("extract_actions"),
            rewrite = routing.binding("rewrite"),
            briefing = routing.binding("briefing"),
            compression = routing.binding("compression"),
            embed = routing.binding("embed"),
        )
    }

    private fun parseEndpoints(ai: JsonObject): Map<AIProviderId, String> {
        val endpoints = ai["endpoints"] as? JsonObject ?: return emptyMap()
        val out = mutableMapOf<AIProviderId, String>()
        for ((k, v) in endpoints) {
            val provider = runCatching { AIProviderId.fromWireName(k) }.getOrNull() ?: continue
            val url = (v as? JsonPrimitive)?.contentOrNull ?: continue
            if (url.isNotBlank()) out[provider] = url
        }
        return out
    }

    private fun JsonObject.binding(key: String): AdapterBinding? {
        val obj = this[key] as? JsonObject ?: return null
        val providerStr = (obj["provider"] as? JsonPrimitive)?.contentOrNull ?: return null
        val model = (obj["model"] as? JsonPrimitive)?.contentOrNull ?: return null
        if (model.isBlank()) return null
        val provider = runCatching { AIProviderId.fromWireName(providerStr) }.getOrNull() ?: return null
        return AdapterBinding(provider, model)
    }

    private fun encode(prefs: AIPrefs): JsonObject = buildJsonObject {
        put("version", 1)
        if (prefs.routing != null) {
            putJsonObject("routing") {
                for (task in AITask.entries) {
                    val binding = prefs.routing.bindingFor(task) ?: continue
                    putJsonObject(task.key) {
                        put("provider", binding.provider.wireName)
                        put("model", binding.model)
                    }
                }
            }
        }
        if (prefs.endpoints.isNotEmpty()) {
            putJsonObject("endpoints") {
                for ((p, url) in prefs.endpoints) put(p.wireName, url)
            }
        }
    }
}

data class AIPrefs(val routing: RoutingConfig?, val endpoints: Map<AIProviderId, String>)

data class TestConnectionResult(val ok: Boolean, val models: List<String> = emptyList(), val error: String? = null)

data class ReindexResult(val ok: Boolean, val processed: Int = 0)

data class UsagePayload(val days: List<UsageDay>)

data class UsageDay(val date: String, val byTask: Map<String, UsageTotals>)

data class UsageTotals(
    val calls: Int = 0,
    val promptTokens: Int = 0,
    val completionTokens: Int = 0,
    val latencyMsSum: Long = 0L,
)
