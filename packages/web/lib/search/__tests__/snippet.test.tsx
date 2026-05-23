import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SnippetText, renderSnippet } from "../snippet";

describe("renderSnippet", () => {
  it("renders plain text unchanged", () => {
    const nodes = renderSnippet("hello world");
    render(<p>{nodes}</p>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("wraps <mark> spans in a real <mark> element", () => {
    render(<SnippetText snippet="see <mark>match</mark> here" />);
    const mark = screen.getByText("match");
    expect(mark.tagName).toBe("MARK");
  });

  it("renders multiple highlights in order", () => {
    render(<SnippetText snippet="<mark>a</mark> and <mark>b</mark> and c" />);
    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("a");
    expect(marks[1]?.textContent).toBe("b");
  });

  it("does NOT execute <script> in the snippet (XSS regression)", () => {
    const payload = `before <script>window.__pwn=1</script> after`;
    render(<SnippetText snippet={payload} />);
    // The script text is rendered as literal characters, not parsed.
    expect(document.querySelector("script")).toBeNull();
    expect((globalThis as unknown as { __pwn?: number }).__pwn).toBeUndefined();
    // And the user still sees the raw text so they know something
    // funny was in the source note.
    expect(document.body.textContent).toContain("<script>");
  });

  it("does NOT execute event handlers smuggled inside a <mark>", () => {
    const payload = `<mark><img src=x onerror="window.__pwn2=1"></mark>`;
    render(<SnippetText snippet={payload} />);
    expect(document.querySelector("img")).toBeNull();
    expect((globalThis as unknown as { __pwn2?: number }).__pwn2).toBeUndefined();
  });

  it("ignores fake closing tags / malformed input", () => {
    render(<SnippetText snippet="<mark>open without close" />);
    expect(document.querySelector("mark")).toBeNull();
    expect(document.body.textContent).toContain("<mark>open without close");
  });
});
