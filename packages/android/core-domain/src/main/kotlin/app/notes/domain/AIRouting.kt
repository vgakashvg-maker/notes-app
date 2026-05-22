package app.notes.domain

/**
 * Canonical AI task taxonomy. Matches the TS twin and the keys M09's
 * V1_ROUTES already uses.
 */
enum class AITask(val key: String) {
    Chat("chat"),
    Summarize("summarize"),
    SuggestTags("suggest_tags"),
    SuggestTitle("suggest_title"),
    ExtractActions("extract_actions"),
    Rewrite("rewrite"),
    Briefing("briefing"),
    Compression("compression"),
    Embed("embed"),
    ;

    companion object {
        fun fromKey(key: String): AITask? = entries.firstOrNull { it.key == key }
    }
}

data class AdapterBinding(val provider: AIProviderId, val model: String) {
    init { require(model.isNotBlank()) { "AdapterBinding.model cannot be empty" } }
}

/**
 * Partial routing override. Any null entry resolves to V1_ROUTES at
 * routing time.
 */
data class RoutingConfig(
    val chat: AdapterBinding? = null,
    val summarize: AdapterBinding? = null,
    val suggestTags: AdapterBinding? = null,
    val suggestTitle: AdapterBinding? = null,
    val extractActions: AdapterBinding? = null,
    val rewrite: AdapterBinding? = null,
    val briefing: AdapterBinding? = null,
    val compression: AdapterBinding? = null,
    val embed: AdapterBinding? = null,
) {
    fun bindingFor(task: AITask): AdapterBinding? = when (task) {
        AITask.Chat -> chat
        AITask.Summarize -> summarize
        AITask.SuggestTags -> suggestTags
        AITask.SuggestTitle -> suggestTitle
        AITask.ExtractActions -> extractActions
        AITask.Rewrite -> rewrite
        AITask.Briefing -> briefing
        AITask.Compression -> compression
        AITask.Embed -> embed
    }
}

/** Provider-keyed endpoint map. Only OLLAMA has a meaningful entry in V1. */
typealias ProviderEndpoints = Map<AIProviderId, String>

/**
 * Full ai_prefs payload. version lets the persisted shape evolve.
 */
data class AIPrefsPayload(
    val version: Int = 1,
    val routing: RoutingConfig? = null,
    val endpoints: ProviderEndpoints = emptyMap(),
)

/** M15 settings-side port. The Android adapter binds via Hilt. */
interface AIRouting {
    suspend fun providersAvailable(): List<AIProviderId>
    suspend fun getRouting(): RoutingConfig
    suspend fun setRouting(config: RoutingConfig)
    suspend fun getEndpoint(provider: AIProviderId): String?
    suspend fun setEndpoint(provider: AIProviderId, url: String)
    suspend fun resolveFor(task: AITask): AdapterBinding
}

/**
 * V2 key store. Lights up when Anthropic / OpenAI providers land —
 * V1 ships the table + RLS only.
 */
interface AIKeyStore {
    suspend fun putKey(provider: AIProviderId, secret: String)
    suspend fun hasKey(provider: AIProviderId): Boolean
    suspend fun deleteKey(provider: AIProviderId)
}
