package app.notes.editor

/**
 * Mirror of `markdown.ts`. Serializes/parses the subset of Markdown the
 * frozen schema produces. The two implementations are kept in lockstep by
 * the round-trip property tests on both sides.
 */

private val MARK_ORDER = listOf(MarkName.BOLD, MarkName.ITALIC, MarkName.STRIKE)
private val MARK_DELIM = mapOf(
    MarkName.BOLD to "**",
    MarkName.ITALIC to "_",
    MarkName.STRIKE to "~~",
)

// ---------- JSON → Markdown ----------

fun jsonToMarkdown(doc: Doc): String {
    validateDoc(doc)
    return doc.content.joinToString("\n\n") { blockToMarkdown(it) }
}

private fun blockToMarkdown(node: DocNode): String = when (BlockNodeName.fromWire(node.type)!!) {
    BlockNodeName.PARAGRAPH -> inlineToMarkdown(node.content)
    BlockNodeName.HEADING -> {
        val level = node.attrs["level"] as Int
        "${"#".repeat(level)} ${inlineToMarkdown(node.content)}"
    }
    BlockNodeName.BULLET_LIST -> listToMarkdown(node) { "- " }
    BlockNodeName.ORDERED_LIST -> listToMarkdown(node) { idx -> "${idx + 1}. " }
    BlockNodeName.CHECK_LIST -> checkListToMarkdown(node)
    BlockNodeName.CODE_BLOCK -> codeBlockToMarkdown(node)
    BlockNodeName.IMAGE -> {
        val src = node.attrs["src"] as String
        val alt = node.attrs["alt"] as? String ?: ""
        "![${alt}](${src})"
    }
    BlockNodeName.ATTACHMENT -> {
        val id = node.attrs["attachmentId"] as String
        val name = node.attrs["displayName"] as String
        "[[attachment:$id|${escapeAttachmentLabel(name)}]]"
    }
}

private fun listToMarkdown(node: DocNode, prefix: (Int) -> String): String =
    node.content.mapIndexed { idx, item ->
        val itemBody = item.content.joinToString("\n") { blockToMarkdown(it) }
        indentContinuation("${prefix(idx)}$itemBody", prefix(idx).length)
    }.joinToString("\n")

private fun checkListToMarkdown(node: DocNode): String =
    node.content.joinToString("\n") { item ->
        val checked = item.attrs["checked"] as Boolean
        val marker = if (checked) "- [x] " else "- [ ] "
        val itemBody = item.content.joinToString("\n") { blockToMarkdown(it) }
        indentContinuation("$marker$itemBody", marker.length)
    }

private fun indentContinuation(text: String, indent: Int): String {
    val parts = text.split("\n")
    if (parts.size == 1) return parts[0]
    val pad = " ".repeat(indent)
    return parts.first() + "\n" + parts.drop(1).joinToString("\n") { "$pad$it" }
}

private fun codeBlockToMarkdown(node: DocNode): String {
    val lang = node.attrs["language"] as? String ?: ""
    val body = node.content.joinToString("") { it.text ?: "" }
    return "```$lang\n$body\n```"
}

private fun inlineToMarkdown(inline: List<DocNode>): String =
    inline.joinToString("") { inlineNodeToMarkdown(it) }

private fun inlineNodeToMarkdown(node: DocNode): String =
    when (InlineNodeName.fromWire(node.type)!!) {
        InlineNodeName.TEXT -> applyMarks(escapeInline(node.text ?: ""), node.marks)
        InlineNodeName.CODE_INLINE -> wrapInlineCode(node.text ?: "")
        InlineNodeName.INTERNAL_LINK -> {
            val id = node.attrs["noteId"] as String
            val label = node.attrs["label"] as? String
            if (!label.isNullOrEmpty()) "[[note:$id|$label]]" else "[[note:$id]]"
        }
        InlineNodeName.HARD_BREAK -> "  \n"
    }

private fun applyMarks(text: String, marks: List<Mark>): String {
    if (marks.isEmpty()) return text
    val ordered = marks.sortedBy { MARK_ORDER.indexOf(it.type) }
    var out = text
    for (m in ordered) {
        val d = MARK_DELIM.getValue(m.type)
        out = "$d$out$d"
    }
    return out
}

private fun wrapInlineCode(text: String): String {
    val runs = Regex("`+").findAll(text).maxOfOrNull { it.value.length } ?: 0
    val fence = "`".repeat(runs + 1)
    val padded = if (text.startsWith("`") || text.endsWith("`")) " $text " else text
    return "$fence$padded$fence"
}

private fun escapeInline(text: String): String =
    text.replace(Regex("([\\\\`*_~\\[\\]])"), "\\\\$1")

private fun escapeAttachmentLabel(label: String): String =
    label.replace("|", "\\|").replace("]]", "\\]\\]")

// ---------- Markdown → JSON ----------

private val HEADING_RE = Regex("^(#{1,3})\\s+(.*)$")
private val FENCE_RE = Regex("^```(\\S*)\\s*$")
private val BULLET_RE = Regex("^(\\s*)[-*]\\s+(.*)$")
private val ORDERED_RE = Regex("^(\\s*)(\\d+)\\.\\s+(.*)$")
private val CHECK_RE = Regex("^(\\s*)[-*]\\s+\\[( |x|X)]\\s+(.*)$")
private val ATTACHMENT_BLOCK_RE = Regex("^\\[\\[attachment:([^|\\]]+)\\|((?:\\\\.|[^\\]])+)]]$")
private val IMAGE_BLOCK_RE = Regex("^!\\[([^\\]]*)]\\(([^)]+)\\)$")

private class Cursor(val lines: List<String>) {
    var index: Int = 0
}

fun markdownToJson(markdown: String): Doc {
    val cursor = Cursor(markdown.split("\n"))
    val blocks = mutableListOf<DocNode>()
    while (cursor.index < cursor.lines.size) {
        val line = (cursor.lines[cursor.index]).trimEnd()
        if (line.isEmpty()) {
            cursor.index += 1
            continue
        }
        blocks.add(parseBlock(cursor))
    }
    val doc = if (blocks.isEmpty()) Doc.empty() else Doc(blocks)
    validateDoc(doc)
    return doc
}

private fun parseBlock(cursor: Cursor): DocNode {
    val line = cursor.lines[cursor.index].trimEnd()
    HEADING_RE.matchEntire(line)?.let { m ->
        cursor.index += 1
        return DocNode(
            type = "heading",
            attrs = mapOf("level" to m.groupValues[1].length),
            content = parseInline(m.groupValues[2]),
        )
    }
    if (FENCE_RE.matches(line)) return parseCodeBlock(cursor)
    IMAGE_BLOCK_RE.matchEntire(line)?.let { m ->
        cursor.index += 1
        val attrs = mutableMapOf<String, Any?>("src" to m.groupValues[2])
        if (m.groupValues[1].isNotEmpty()) attrs["alt"] = m.groupValues[1]
        return DocNode(type = "image", attrs = attrs)
    }
    ATTACHMENT_BLOCK_RE.matchEntire(line)?.let { m ->
        cursor.index += 1
        return DocNode(
            type = "attachment",
            attrs = mapOf(
                "attachmentId" to m.groupValues[1],
                "displayName" to unescapeAttachmentLabel(m.groupValues[2]),
            ),
        )
    }
    if (CHECK_RE.matches(line)) return parseList(cursor, "check_list")
    if (BULLET_RE.matches(line)) return parseList(cursor, "bullet_list")
    if (ORDERED_RE.matches(line)) return parseList(cursor, "ordered_list")
    return parseParagraph(cursor)
}

private fun parseCodeBlock(cursor: Cursor): DocNode {
    val fence = cursor.lines[cursor.index].trim()
    val lang = FENCE_RE.matchEntire(fence)?.groupValues?.get(1).orEmpty()
    cursor.index += 1
    val body = mutableListOf<String>()
    while (cursor.index < cursor.lines.size) {
        val l = cursor.lines[cursor.index]
        if (l.trimEnd() == "```") {
            cursor.index += 1
            break
        }
        body.add(l)
        cursor.index += 1
    }
    val text = body.joinToString("\n")
    return DocNode(
        type = "code_block",
        attrs = mapOf("language" to if (lang.isEmpty()) null else lang),
        content = if (text.isEmpty()) emptyList() else listOf(DocNode(type = "text", text = text)),
    )
}

private fun detectListKind(line: String): String? = when {
    CHECK_RE.matches(line) -> "check_list"
    BULLET_RE.matches(line) -> "bullet_list"
    ORDERED_RE.matches(line) -> "ordered_list"
    else -> null
}

private fun parseList(cursor: Cursor, kind: String): DocNode {
    val items = mutableListOf<DocNode>()
    while (cursor.index < cursor.lines.size) {
        val line = cursor.lines[cursor.index].trimEnd()
        if (line.isEmpty()) break
        if (detectListKind(line) != kind) break
        items.add(parseListItem(cursor, kind))
    }
    return DocNode(type = kind, content = items)
}

private fun parseListItem(cursor: Cursor, kind: String): DocNode {
    val line = cursor.lines[cursor.index].trimEnd()
    val (rest, checked) = when (kind) {
        "check_list" -> {
            val m = CHECK_RE.matchEntire(line)!!
            m.groupValues[3] to (m.groupValues[2].equals("x", ignoreCase = true))
        }
        "bullet_list" -> BULLET_RE.matchEntire(line)!!.groupValues[2] to null
        else -> ORDERED_RE.matchEntire(line)!!.groupValues[3] to null
    }
    cursor.index += 1
    val collected = mutableListOf(rest)
    while (cursor.index < cursor.lines.size) {
        val next = cursor.lines[cursor.index]
        if (next.isEmpty()) break
        if (detectListKind(next.trimStart()) != null && !next.startsWith(" ")) break
        if (next.startsWith(" ")) {
            collected.add(next.trimStart())
            cursor.index += 1
        } else break
    }
    val paragraph = DocNode(type = "paragraph", content = parseInline(collected.joinToString("\n")))
    val itemType = if (kind == "check_list") "check_list_item" else "list_item"
    val attrs: Map<String, Any?> = if (checked != null) mapOf("checked" to checked) else emptyMap()
    return DocNode(type = itemType, attrs = attrs, content = listOf(paragraph))
}

private fun parseParagraph(cursor: Cursor): DocNode {
    val collected = mutableListOf<String>()
    while (cursor.index < cursor.lines.size) {
        val line = cursor.lines[cursor.index].trimEnd()
        if (line.isEmpty()) break
        if (
            HEADING_RE.matches(line) ||
            FENCE_RE.matches(line) ||
            detectListKind(line) != null ||
            IMAGE_BLOCK_RE.matches(line) ||
            ATTACHMENT_BLOCK_RE.matches(line)
        ) break
        collected.add(cursor.lines[cursor.index])
        cursor.index += 1
    }
    return DocNode(type = "paragraph", content = parseInline(collected.joinToString("\n")))
}

private fun parseInline(text: String): List<DocNode> {
    if (text.isEmpty()) return emptyList()
    val nodes = mutableListOf<DocNode>()
    val buffer = StringBuilder()
    fun flush(marks: List<MarkName> = emptyList()) {
        if (buffer.isEmpty()) return
        nodes.add(
            DocNode(
                type = "text",
                text = buffer.toString(),
                marks = marks.map { Mark(it) },
            ),
        )
        buffer.clear()
    }
    var pos = 0
    while (pos < text.length) {
        val c = text[pos]
        // Hard break: two spaces before \n.
        if (c == ' ' && pos + 2 < text.length && text[pos + 1] == ' ' && text[pos + 2] == '\n') {
            flush()
            nodes.add(DocNode(type = "hard_break"))
            pos += 3
            continue
        }
        if (c == '\\' && pos + 1 < text.length) {
            buffer.append(text[pos + 1])
            pos += 2
            continue
        }
        if (c == '`') {
            flush()
            val closing = text.indexOf('`', pos + 1)
            if (closing == -1) {
                buffer.append(c)
                pos += 1
                continue
            }
            val raw = text.substring(pos + 1, closing)
            val padded = raw.length >= 2 && raw.startsWith(" ") && raw.endsWith(" ") &&
                (raw[1] == '`' || raw[raw.length - 2] == '`')
            val trimmed = if (padded) raw.substring(1, raw.length - 1) else raw
            nodes.add(DocNode(type = "code_inline", text = trimmed))
            pos = closing + 1
            continue
        }
        if (c == '[' && pos + 1 < text.length && text[pos + 1] == '[') {
            val end = text.indexOf("]]", pos + 2)
            if (end == -1) {
                buffer.append(c)
                pos += 1
                continue
            }
            val body = text.substring(pos + 2, end)
            val noteMatch = Regex("^note:([^|]+)(?:\\|(.*))?$").matchEntire(body)
            if (noteMatch != null) {
                flush()
                val attrs = mutableMapOf<String, Any?>("noteId" to noteMatch.groupValues[1])
                val label = noteMatch.groupValues[2]
                if (label.isNotEmpty()) attrs["label"] = label
                nodes.add(DocNode(type = "internal_link", attrs = attrs))
                pos = end + 2
                continue
            }
            buffer.append(c)
            pos += 1
            continue
        }
        if (c == '*' && pos + 1 < text.length && text[pos + 1] == '*') {
            val close = findMarkClose(text, pos + 2, "**")
            if (close != -1) {
                flush()
                nodes.addAll(parseInlineMarked(text.substring(pos + 2, close), MarkName.BOLD))
                pos = close + 2
                continue
            }
        }
        if (c == '_') {
            val close = findMarkClose(text, pos + 1, "_")
            if (close != -1) {
                flush()
                nodes.addAll(parseInlineMarked(text.substring(pos + 1, close), MarkName.ITALIC))
                pos = close + 1
                continue
            }
        }
        if (c == '~' && pos + 1 < text.length && text[pos + 1] == '~') {
            val close = findMarkClose(text, pos + 2, "~~")
            if (close != -1) {
                flush()
                nodes.addAll(parseInlineMarked(text.substring(pos + 2, close), MarkName.STRIKE))
                pos = close + 2
                continue
            }
        }
        buffer.append(c)
        pos += 1
    }
    flush()
    return nodes
}

private fun findMarkClose(text: String, start: Int, delim: String): Int {
    var i = start
    while (i < text.length) {
        if (text[i] == '\\') {
            i += 2
            continue
        }
        if (i + delim.length <= text.length && text.substring(i, i + delim.length) == delim) return i
        i += 1
    }
    return -1
}

private fun parseInlineMarked(text: String, mark: MarkName): List<DocNode> {
    val inner = parseInline(text)
    return inner.map { node ->
        if (node.type != "text" && node.type != "code_inline") return@map node
        if (node.marks.any { it.type == mark }) return@map node
        node.copy(marks = node.marks + Mark(mark))
    }
}

private fun unescapeAttachmentLabel(label: String): String =
    label.replace("\\]\\]", "]]").replace("\\|", "|")
