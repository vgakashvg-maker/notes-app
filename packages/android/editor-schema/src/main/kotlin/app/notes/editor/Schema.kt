package app.notes.editor

/**
 * Mirror of the TS `@notes-app/editor-schema`. The two are kept in sync by
 * hand — there is no codegen because the schema is intentionally tiny and
 * any drift would be visible in the round-trip tests on both sides.
 */

const val SCHEMA_VERSION: Int = 1

enum class BlockNodeName(val wireName: String) {
    PARAGRAPH("paragraph"),
    HEADING("heading"),
    BULLET_LIST("bullet_list"),
    ORDERED_LIST("ordered_list"),
    CHECK_LIST("check_list"),
    CODE_BLOCK("code_block"),
    IMAGE("image"),
    ATTACHMENT("attachment"),
    ;

    companion object {
        fun fromWire(value: String): BlockNodeName? = entries.firstOrNull { it.wireName == value }
    }
}

enum class InlineNodeName(val wireName: String) {
    TEXT("text"),
    CODE_INLINE("code_inline"),
    INTERNAL_LINK("internal_link"),
    HARD_BREAK("hard_break"),
    ;

    companion object {
        fun fromWire(value: String): InlineNodeName? = entries.firstOrNull { it.wireName == value }
    }
}

enum class MarkName(val wireName: String) {
    BOLD("bold"),
    ITALIC("italic"),
    STRIKE("strike"),
    ;

    companion object {
        fun fromWire(value: String): MarkName? = entries.firstOrNull { it.wireName == value }
    }
}

/**
 * Lightweight document model. Mirrors the TS `DocNode` shape. We don't
 * pull in a JSON dependency at this layer — the Android shell (M12) wires
 * Moshi/Gson to (de)serialise this onto `notes.body_json`.
 */
data class DocNode(
    val type: String,
    val attrs: Map<String, Any?> = emptyMap(),
    val text: String? = null,
    val marks: List<Mark> = emptyList(),
    val content: List<DocNode> = emptyList(),
)

data class Mark(val type: MarkName)

/** A doc is just a DocNode of type "doc" — the helper makes intent explicit. */
data class Doc(val content: List<DocNode>) {
    fun toNode(): DocNode = DocNode(type = "doc", content = content)

    companion object {
        fun empty(): Doc = Doc(content = listOf(DocNode(type = "paragraph")))

        fun fromNode(node: DocNode): Doc {
            require(node.type == "doc") { "Doc.fromNode expected type=doc, got ${node.type}" }
            return Doc(content = node.content)
        }
    }
}
