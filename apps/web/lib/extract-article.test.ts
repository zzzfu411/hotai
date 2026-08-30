import { describe, expect, it } from "vitest";
import { extractArticle } from "./extract-article";

const html = `<!DOCTYPE html>
<html>
<head><title>Lab Note</title></head>
<body>
  <nav>ignore me</nav>
  <article>
    <h1>Lab Note</h1>
    <p>${"Dense paragraph about language models. ".repeat(40)}</p>
    <p>${"Second block with enough text for Readability. ".repeat(40)}</p>
  </article>
  <script>alert(1)</script>
</body>
</html>`;

describe("extractArticle", () => {
  it("returns sanitized article HTML without scripts", () => {
    const out = extractArticle(html, "https://example.com/post");
    expect(out).not.toBeNull();
    expect(out!.title.length).toBeGreaterThan(0);
    expect(out!.contentHtml).toContain("language models");
    expect(out!.contentHtml.toLowerCase()).not.toContain("<script");
    expect(out!.excerpt.length).toBeGreaterThan(0);
  });

  it("returns null on empty input", () => {
    expect(extractArticle("  ", "https://example.com")).toBeNull();
  });
});
