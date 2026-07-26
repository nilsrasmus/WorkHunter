import { describe, expect, it } from "vitest";
import { sanitizeDocumentHtml } from "./sanitizeHtml";

describe("sanitizeDocumentHtml", () => {
  it("strips script tags and event handlers", () => {
    const dirty =
      '<p onclick="alert(1)">Hi</p><script>alert(2)</script><img src=x onerror=alert(3)>';
    const clean = sanitizeDocumentHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).toContain("Hi");
  });

  it("keeps editor-safe markup and slots", () => {
    const html =
      '<div data-wh-slot="summary" style="color:#111"><strong>Hello</strong></div>';
    const clean = sanitizeDocumentHtml(html);
    expect(clean).toContain('data-wh-slot="summary"');
    expect(clean).toContain("<strong>Hello</strong>");
  });

  it("blocks javascript hrefs", () => {
    const clean = sanitizeDocumentHtml(
      '<a href="javascript:alert(1)">click</a><a href="https://example.com">ok</a>',
    );
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain("https://example.com");
  });

  it("returns a paragraph for empty input", () => {
    expect(sanitizeDocumentHtml("")).toBe("<p></p>");
  });
});
