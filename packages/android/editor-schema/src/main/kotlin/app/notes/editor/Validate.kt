package app.notes.editor

class SchemaValidationException(message: String) : IllegalArgumentException(message)

/**
 * Structural validation against the frozen schema. Mirrors validate.ts.
 * Throws on the first violation with a path so the offending node is easy
 * to locate.
 */
fun validateDoc(doc: Doc) {
    for ((i, node) in doc.content.withIndex()) {
        validateBlock(node, "content[$i]")
    }
}

private fun validateBlock(node: DocNode, path: String) {
    val name = BlockNodeName.fromWire(node.type)
        ?: throw SchemaValidationException("$path: unknown block node \"${node.type}\"")
    when (name) {
        BlockNodeName.PARAGRAPH -> validateInlineContent(node, path)
        BlockNodeName.HEADING -> validateHeading(node, path)
        BlockNodeName.BULLET_LIST, BlockNodeName.ORDERED_LIST -> validateListItems(node, path, "list_item")
        BlockNodeName.CHECK_LIST -> validateListItems(node, path, "check_list_item")
        BlockNodeName.CODE_BLOCK -> validateCodeBlock(node, path)
        BlockNodeName.IMAGE -> validateImage(node, path)
        BlockNodeName.ATTACHMENT -> validateAttachment(node, path)
    }
}

private fun validateHeading(node: DocNode, path: String) {
    val level = node.attrs["level"]
    if (level !is Int || level !in 1..3) {
        throw SchemaValidationException("$path: heading.attrs.level must be 1, 2, or 3")
    }
    validateInlineContent(node, path)
}

private fun validateListItems(node: DocNode, path: String, expected: String) {
    for ((i, item) in node.content.withIndex()) {
        if (item.type != expected) {
            throw SchemaValidationException("$path.content[$i]: expected $expected, got \"${item.type}\"")
        }
        if (expected == "check_list_item" && item.attrs["checked"] !is Boolean) {
            throw SchemaValidationException("$path.content[$i].attrs.checked must be a boolean")
        }
        for ((j, child) in item.content.withIndex()) {
            validateBlockInListItem(child, "$path.content[$i].content[$j]")
        }
    }
}

private fun validateBlockInListItem(node: DocNode, path: String) {
    if (node.type !in setOf("paragraph", "bullet_list", "ordered_list", "check_list")) {
        throw SchemaValidationException(
            "$path: only paragraph or nested lists allowed inside list items, got \"${node.type}\"",
        )
    }
    validateBlock(node, path)
}

private fun validateCodeBlock(node: DocNode, path: String) {
    val lang = node.attrs["language"]
    if (lang != null && lang !is String) {
        throw SchemaValidationException("$path: code_block.attrs.language must be a string or null")
    }
    for ((i, child) in node.content.withIndex()) {
        if (child.type != "text" || child.text == null) {
            throw SchemaValidationException("$path.content[$i]: code_block may only contain text nodes")
        }
        if (child.marks.isNotEmpty()) {
            throw SchemaValidationException("$path.content[$i]: marks are not allowed inside a code_block")
        }
    }
}

private fun validateImage(node: DocNode, path: String) {
    val src = node.attrs["src"]
    if (src !is String || src.isEmpty()) {
        throw SchemaValidationException("$path: image.attrs.src must be a non-empty string")
    }
    val alt = node.attrs["alt"]
    if (alt != null && alt !is String) {
        throw SchemaValidationException("$path: image.attrs.alt must be a string when present")
    }
}

private fun validateAttachment(node: DocNode, path: String) {
    val attachmentId = node.attrs["attachmentId"]
    val displayName = node.attrs["displayName"]
    if (attachmentId !is String || attachmentId.isEmpty()) {
        throw SchemaValidationException("$path: attachment.attrs.attachmentId must be a non-empty string")
    }
    if (displayName !is String || displayName.isEmpty()) {
        throw SchemaValidationException("$path: attachment.attrs.displayName must be a non-empty string")
    }
}

private fun validateInlineContent(node: DocNode, path: String) {
    for ((i, child) in node.content.withIndex()) {
        val name = InlineNodeName.fromWire(child.type)
            ?: throw SchemaValidationException("$path.content[$i]: unknown inline node \"${child.type}\"")
        when (name) {
            InlineNodeName.TEXT -> {
                if (child.text.isNullOrEmpty()) {
                    throw SchemaValidationException("$path.content[$i]: text nodes need a non-empty text field")
                }
                validateMarks(child.marks, "$path.content[$i]")
            }
            InlineNodeName.CODE_INLINE -> {
                if (child.text.isNullOrEmpty()) {
                    throw SchemaValidationException("$path.content[$i]: code_inline needs a non-empty text field")
                }
            }
            InlineNodeName.INTERNAL_LINK -> {
                val noteId = child.attrs["noteId"]
                if (noteId !is String || noteId.isEmpty()) {
                    throw SchemaValidationException("$path.content[$i]: internal_link.attrs.noteId must be non-empty")
                }
            }
            InlineNodeName.HARD_BREAK -> Unit
        }
    }
}

private fun validateMarks(marks: List<Mark>, path: String) {
    val seen = mutableSetOf<MarkName>()
    for ((i, m) in marks.withIndex()) {
        if (!seen.add(m.type)) {
            throw SchemaValidationException("$path.marks[$i]: duplicate mark \"${m.type.wireName}\"")
        }
    }
}
