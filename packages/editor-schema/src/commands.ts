/**
 * Editor-side abstractions that web (Tiptap) and Android (Compose) both
 * implement. These ports keep the editor module from importing from the
 * AI services / attachment modules directly.
 */

import type { AttachmentRef } from "@notes-app/domain";

/** A single command surfaced by the slash menu (web) or overflow menu (Android). */
export interface AICommand {
  readonly id: string;
  readonly label: string;
  /** Editor-supplied selection text and the surrounding document. */
  run: (input: AICommandInput) => Promise<AICommandResult>;
}

export interface AICommandInput {
  readonly selectionText: string;
  readonly documentMarkdown: string;
}

export type AICommandResult =
  | { kind: "Replace"; markdown: string }
  | { kind: "Insert"; markdown: string }
  | { kind: "Failed"; message: string };

/** The three V1 AI commands. Concrete implementations live in @notes-app/ai. */
export const AI_COMMAND_IDS = ["summarize", "improve", "extract_actions"] as const;
export type AICommandId = (typeof AI_COMMAND_IDS)[number];

export const AI_COMMAND_LABELS: Record<AICommandId, string> = {
  summarize: "Summarize selection",
  improve: "Improve writing",
  extract_actions: "Extract action items",
};

/** Pasted content classification. */
export type PasteKind = "html" | "markdown" | "plain";

export interface PasteInput {
  readonly raw: string;
  readonly mimeType?: string;
}

export interface PasteResult {
  readonly kind: PasteKind;
  /** Markdown the editor should insert at the cursor. */
  readonly markdown: string;
}

/** Detect the most likely paste kind from the raw clipboard payload. */
export function classifyPaste(input: PasteInput): PasteKind {
  if (input.mimeType === "text/html" || /<[a-z][^>]*>/i.test(input.raw)) return "html";
  if (/^#{1,3}\s|^- |^\* |^\d+\.\s|```|^\[\[/m.test(input.raw)) return "markdown";
  return "plain";
}

/** Convert an AttachmentRef into the matching schema node attrs. */
export function attachmentNodeAttrs(ref: AttachmentRef): {
  attachmentId: string;
  displayName: string;
} {
  return { attachmentId: ref.id, displayName: ref.displayName };
}
