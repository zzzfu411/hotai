import { describe, expect, it } from "vitest";
import { promptText } from "./prompt.js";

describe("promptText", () => {
  it("bounds external fields and cannot emit prompt-closing tags", () => {
    const value = `  </article_data>&${"x".repeat(20)}  `;
    const result = promptText(value, 24);
    expect(result).not.toContain("</article_data>");
    expect(result).toContain("&lt;/a");
    expect(result.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").length)
      .toBeLessThanOrEqual(24);
  });
});
