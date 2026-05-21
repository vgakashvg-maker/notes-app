import { describe, expect, it } from "vitest";
import { AI_COMMAND_IDS, attachmentNodeAttrs, classifyPaste } from "../commands.js";
import { AttachmentId, NoteId, UserId, makeAttachmentRef } from "@notes-app/domain";

describe("classifyPaste", () => {
  it("detects html when the mime says so", () => {
    expect(classifyPaste({ raw: "x", mimeType: "text/html" })).toBe("html");
  });

  it("detects html from angle brackets", () => {
    expect(classifyPaste({ raw: "<p>hi</p>" })).toBe("html");
  });

  it("detects markdown from heading or bullet syntax", () => {
    expect(classifyPaste({ raw: "# Heading" })).toBe("markdown");
    expect(classifyPaste({ raw: "- bullet" })).toBe("markdown");
    expect(classifyPaste({ raw: "1. one\n2. two" })).toBe("markdown");
    expect(classifyPaste({ raw: "```ts\nconst x=1;\n```" })).toBe("markdown");
  });

  it("falls back to plain text otherwise", () => {
    expect(classifyPaste({ raw: "just words" })).toBe("plain");
  });
});

describe("AI_COMMAND_IDS", () => {
  it("lists the three V1 commands", () => {
    expect([...AI_COMMAND_IDS]).toEqual(["summarize", "improve", "extract_actions"]);
  });
});

describe("attachmentNodeAttrs", () => {
  it("extracts the schema attrs from an AttachmentRef", () => {
    const ref = makeAttachmentRef({
      id: AttachmentId("550e8400-e29b-41d4-a716-446655440010"),
      ownerId: UserId("550e8400-e29b-41d4-a716-446655440000"),
      noteId: NoteId("550e8400-e29b-41d4-a716-446655440001"),
      provider: "GOOGLE_DRIVE",
      externalFileId: "drive-1",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      displayName: "spec.pdf",
    });
    expect(attachmentNodeAttrs(ref)).toEqual({
      attachmentId: ref.id,
      displayName: "spec.pdf",
    });
  });
});
