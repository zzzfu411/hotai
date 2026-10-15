import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { shapeJuyaHtml } from "./juya-shape";

// Trimmed from the daily.juya.uk feed (2026-10-12), after sanitizing.
const ISSUE = `<div><p><img src="https://assets.juya.uk/cover/a.png" alt=""></p>
<h1>AI 早报 2026-10-12</h1>
<p><strong>视频版</strong>：<a href="https://www.youtube.com/watch?v=abc">YouTube</a> ｜ <a href="https://www.bilibili.com/video/BV1">哔哩哔哩</a></p>
<h2 id="s1">概览</h2>
<h3 id="s2">要闻</h3>
<ul><li>GPT 上下文升至 500k <a href="https://x.com/a/1">↗</a> <code>#1</code></li></ul>
<h3 id="s3">产品应用</h3>
<ul><li>豆包上线导入功能 <code>#2</code></li></ul>
<hr>
<h2 id="s7">要闻</h2>
<h3 id="s8"><a href="https://x.com/a/1">GPT 上下文升至 500k</a> <code>#1</code></h3>
<blockquote><strong>OpenAI</strong> 宣布默认上下文改为 500k。</blockquote>
<p>正文第一段，<code>Codex</code> 可用。</p>
<p><img src="https://assets.juya.uk/i/1.png" alt=""></p>
<p><img src="https://assets.juya.uk/i/2.png" alt=""></p>
<p>相关链接：</p>
<ul><li><a href="https://x.com/a/1">https://x.com/a/1</a></li><li><a href="https://x.com/a/2">https://x.com/a/2</a></li><li><a href="https://openai.com/b">https://openai.com/b</a></li></ul>
<hr>
<h2 id="s9">产品应用</h2>
<h3 id="s10">豆包上线导入功能 <code>#2</code></h3>
<p>只有正文，没有摘要。</p>
<hr>
<p><strong>提示</strong>：内容由AI辅助创作，可能存在<strong>幻觉</strong>和<strong>错误</strong>。</p><hr><p><a href="https://daily.juya.uk/issues/2026-10-12/">查看网页全文</a> · <a href="https://daily.juya.uk/markdown/2026-10-12.md">查看 Markdown</a></p></div>`;

function dom(html: string) {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
}

describe("shapeJuyaHtml", () => {
  const shaped = shapeJuyaHtml(ISSUE);
  const doc = dom(shaped.html);

  it("lifts the masthead out of the body", () => {
    expect(shaped.cover).toBe("https://assets.juya.uk/cover/a.png");
    expect(shaped.heading).toBe("AI 早报 2026-10-12");
    expect(shaped.videos).toEqual([
      { platform: "youtube", url: "https://www.youtube.com/watch?v=abc" },
      { platform: "bilibili", url: "https://www.bilibili.com/video/BV1" },
    ]);
    expect(doc.querySelector("h1")).toBeNull();
    expect(shaped.html).not.toContain("视频版");
    expect(shaped.html).not.toContain("查看网页全文");
    expect(doc.querySelector(".kz-juya-note")?.textContent).toContain("AI辅助创作");
  });

  it("links overview lines and story numbers both ways", () => {
    const line = doc.querySelector("#juya-ov-1");
    expect(line?.querySelector(".kz-juya-ov-link")?.getAttribute("href")).toBe("#s8");
    expect(line?.querySelector(".kz-juya-ov-link")?.textContent).toBe("1GPT 上下文升至 500k");
    expect(line?.querySelector(".kz-juya-ext")?.getAttribute("href")).toBe("https://x.com/a/1");
    // No source link in the overview line: no ↗.
    expect(doc.querySelector("#juya-ov-2 .kz-juya-ext")).toBeNull();
    const story = doc.querySelector("#s8");
    expect(story?.querySelector("a.kz-juya-n")?.getAttribute("href")).toBe("#juya-ov-1");
    expect(story?.querySelector(".kz-juya-title")?.getAttribute("target")).toBe("_blank");
    expect(story?.querySelector("code")).toBeNull();
  });

  it("folds the full text under the summary and collects images and sources", () => {
    const item = doc.querySelector("#s8")!.closest(".kz-juya-item")!;
    expect(item.querySelector(".kz-juya-sum")?.textContent).toContain("500k");
    expect(item.querySelector("details.kz-juya-more .kz-juya-full")?.textContent).toContain("正文第一段");
    expect(Array.from(item.querySelectorAll(".kz-juya-imgs img")).map((img) => img.getAttribute("src"))).toEqual([
      "https://assets.juya.uk/i/1.png",
      "https://assets.juya.uk/i/2.png",
    ]);
    expect(item.querySelector(".kz-juya-imgs img")?.getAttribute("loading")).toBe("lazy");
    expect(Array.from(item.querySelectorAll(".kz-juya-src a")).map((a) => a.textContent)).toEqual([
      "x.com",
      "x.com 2",
      "openai.com",
    ]);
    expect(item.textContent).not.toContain("相关链接");
  });

  it("leaves a story without a summary unfolded", () => {
    const item = doc.querySelector("#s10")!.closest(".kz-juya-item")!;
    expect(item.querySelector("details")).toBeNull();
    expect(item.textContent).toContain("只有正文");
  });

  it("builds contents without the overview's duplicate headings", () => {
    expect(shaped.count).toBe(2);
    expect(shaped.toc).toEqual([
      { id: "s1", text: "概览", level: 2 },
      { id: "s7", text: "要闻", level: 2, count: 1 },
      { id: "s8", text: "GPT 上下文升至 500k", level: 3, n: 1 },
      { id: "s9", text: "产品应用", level: 2, count: 1 },
      { id: "s10", text: "豆包上线导入功能", level: 3, n: 2 },
    ]);
    expect(doc.querySelector("#s7 .kz-juya-cat-count")?.textContent).toBe("1");
  });

  it("keeps an unnumbered issue in its original layout", () => {
    const plain = shapeJuyaHtml("<h1>标题</h1><h2>第一部分</h2><p>内容</p><h3>小节</h3><p>更多</p>");
    expect(plain.count).toBe(0);
    expect(plain.html).toContain("<p>内容</p>");
    expect(plain.html).not.toContain("<h1>");
    expect(plain.toc.map((t) => [t.level, t.text])).toEqual([
      [2, "第一部分"],
      [3, "小节"],
    ]);
  });
});
