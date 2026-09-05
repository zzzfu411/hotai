import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Tests run only on loopback, with isolated browser storage and fixture responses.
const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3100";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Browser smoke requires loopback");
const output = resolve("output/playwright");
await mkdir(output, { recursive: true });
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".cache/ms-playwright")) process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".cache/ms-playwright");
const { chromium } = await import("playwright");
let server;
let browser;
let page;
let logs = "";
const results = [];
const measurements = {};
try {
  if (!process.env.BROWSER_BASE_URL) {
    assert(/^\/[a-z0-9_]*_test$/.test(new URL(process.env.DATABASE_URL || "http://invalid").pathname), "Explicit test database required");
    server = spawn(process.execPath, [resolve("apps/web/node_modules/next/dist/bin/next"), ...(process.env.BROWSER_DEV === "1" ? ["dev", "--webpack"] : ["start"]), "-p", "3100", "-H", "127.0.0.1"], {
      cwd: resolve("apps/web"), windowsHide: true,
      env: { ...process.env, ANTHROPIC_AUTH_TOKEN: "", ANTHROPIC_API_KEY: "browser-test-only",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:9", ALLOW_THIRD_PARTY_AI: "true", ALLOW_INSECURE_AI_HTTP: "true", AI_DIGEST_ENABLED: "false", AI_ENRICH_PER_RUN: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", chunk => { logs += chunk; });
    server.stderr.on("data", chunk => { logs += chunk; });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (await fetch(`${base}/api/live`).then(r => r.ok).catch(() => false)) { ready = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    assert(ready, "Test server did not start");
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("https://**/*", route => route.abort()); // external images/fonts must not affect tests
  await context.route("**/api/readability", route => route.fulfill({ json: { ok: true, contentHtml: "<p>Readable fixture body.</p>" } }));
  const card = (title, age = 0) => ({ title, url: `https://example.com/${encodeURIComponent(title)}`, summary: "A deterministic signal.", publishedAt: new Date(Date.now() - age * 60_000).toISOString(), image: null });
  let revision = 0;
  let failure = false;
  await context.route("**/api/catalog/pull", async route => {
    if (failure) return route.fulfill({ status: 503, json: { error: "service unavailable" } });
    const { ids } = route.request().postDataJSON();
    const items = Array.from({ length: 32 }, (_, i) => card(`Original signal ${i}`, i + 100));
    if (revision) items.unshift(card("Fresh leading signal"));
    const events = ids.map(id => ({ source: { id, name: id, ok: true, stale: false,
      fetchedAt: new Date().toISOString(), items: id === "hn" ? items : [] } }));
    events.push({ done: true });
    return route.fulfill({ contentType: "application/x-ndjson", body: events.map(e => JSON.stringify(e)).join("\n") + "\n" });
  });
  const waitText = (text) => page.getByText(text, { exact: true }).first().waitFor();
  const pass = name => { results.push(name); console.log(`PASS ${name}`); };

  await page.goto(`${base}/?cat=tech`);
  await waitText("Original signal 0");
  revision++;
  await page.getByRole("button", { name: "刷新信号" }).click();
  await waitText("Fresh leading signal");
  assert.match(await page.locator(".kz-nook-list li").first().innerText(), /Fresh leading signal/);
  pass("explicit refresh applies new ordering");
  await page.getByRole("link", { name: /Fresh leading signal/ }).first().click();
  await page.getByRole("button", { name: "稍后读", exact: true }).click();
  await page.locator('.kz-tabs a[href="/subscribe"]').click();
  await page.locator(".kz-saved-list").getByRole("link", { name: "Fresh leading signal", exact: true }).waitFor();
  await page.reload();
  await page.locator(".kz-saved-list").getByRole("link", { name: "Fresh leading signal", exact: true }).waitFor();
  pass("remote reader saves and retrieves after reload");

  await page.setViewportSize({ width: 390, height: 740 });
  await page.waitForFunction(() => { const r = document.querySelector('.kz-tabs [aria-current="page"]').getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1; });
  measurements.mobileHeaderHeight = (await page.locator(".kz-topbar").boundingBox()).height;
  assert(measurements.mobileHeaderHeight < 135, "mobile header is too tall");
  const active = await page.locator('.kz-tabs [aria-current="page"]').boundingBox();
  assert(active.x >= 0 && active.x + active.width <= 391, "active tab is offscreen");
  const urlBox = await page.getByLabel("Feed 地址", { exact: true }).boundingBox();
  const nameBox = await page.getByLabel("名称（可留空，用 feed 标题）", { exact: true }).boundingBox();
  assert(urlBox.y < nameBox.y, "mobile form order is wrong");
  await page.getByRole("button", { name: "选择文件", exact: true }).focus();
  const fileChooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await fileChooser;
  await context.route("**/api/proxy/feed?**", route => route.fulfill({ json: { ok: true, title: "Fixture feed", items: [card("Subscription story")], stale: true, fetchedAt: new Date(Date.now() - 600000).toISOString() } }));
  await chooser.setFiles({ name: "fixture.opml", mimeType: "text/xml", buffer: Buffer.from('<opml version="2.0"><body><outline type="rss" text="Fixture feed" xmlUrl="https://example.com/rss"/></body></opml>') });
  await page.getByRole("link", { name: /Subscription story/ }).first().waitFor();
  await page.getByText("陈旧缓存", { exact: false }).waitFor();
  assert.match(await page.getByRole("link", { name: /Subscription story/ }).first().getAttribute("href"), /^\/r\?/);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/mine-mobile.png`, fullPage: true });
  pass("mobile form, active navigation and keyboard OPML import");

  await page.goto(`${base}/search?q=regression`);
  await page.locator(".kz-search-form input").waitFor();
  await page.getByRole("link", { name: "下一页", exact: true }).click();
  await page.waitForURL(/page=2/);
  assert.equal(await page.locator(".kz-article").count(), 26);
  await page.locator(".kz-search-form input").fill("notfound");
  await page.locator(".kz-search-form input").press("Enter");
  await page.waitForURL(/q=notfound/);
  assert(!new URL(page.url()).searchParams.has("page"));
  await page.goBack();
  await page.waitForURL(/page=2/);
  await page.waitForFunction(() => document.querySelector(".kz-search-form input")?.value === "regression");
  assert.equal(await page.locator(".kz-search-form input").inputValue(), "regression");
  await page.getByRole("button", { name: "最新", exact: true }).click();
  await page.waitForURL(/sort=recent/);
  assert(!new URL(page.url()).searchParams.has("page"));
  pass("search pagination, submitted state and browser back");

  await page.goto(`${base}/category/research`);
  await page.getByRole("link", { name: "下一页", exact: true }).click();
  await page.waitForURL(/page=2/);
  assert.equal(await page.locator(".kz-article").count(), 6);
  await page.goto(`${base}/source/regression-fixture?page=2`);
  assert.equal(await page.locator(".kz-article").count(), 6);
  const articleLink = page.locator(".kz-article-main").first();
  await articleLink.click();
  await page.getByRole("button", { name: "稍后读", exact: true }).click();
  await page.locator('.kz-tabs a[href="/subscribe"]').click();
  await page.locator(".kz-saved-list").getByRole("link", { name: /Regression story/ }).first().waitFor();
  pass("category and source pagination plus stored article reading");

  await page.goto(`${base}/digest`);
  await context.route("**/api/ask", route => route.fulfill({ contentType: "text/event-stream", body: 'data: {"delta":"Partial fixture answer"}\n\n' }));
  await page.locator(".kz-ask input").fill("Test answer");
  await page.locator(".kz-ask input").press("Enter");
  await page.getByText("连接中断，以下回答尚未完成，请重试。", { exact: false }).waitFor();
  pass("interrupted answer remains visibly incomplete");

  await context.addCookies([{ name: "hotai-lang", value: "en", url: base }]);
  const html = await context.request.get(`${base}/hot`).then(r => r.text());
  assert.match(html, /<html[^>]*lang="en"/);
  assert(html.includes("Hot list · last 14 days"));
  await page.goto(`${base}/hot`);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: `${output}/hot-desktop.png`, fullPage: true });
  pass("English preference is present in server HTML");

  await page.goto(`${base}/?cat=tech`);
  await waitText("Fresh leading signal");
  failure = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText("Showing previously cached stories", { exact: false }).waitFor();
  assert.match(await page.locator(".kz-console-stat").last().innerText(), /00/);
  await page.screenshot({ path: `${output}/feed-cached-desktop.png`, fullPage: true });
  pass("service outage retains cached feed without invented source failures");
  await page.setViewportSize({ width: 390, height: 740 });
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile horizontal overflow");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".kz-nook-item")).backgroundColor === "rgb(16, 19, 29)");
  await page.screenshot({ path: `${output}/feed-mobile-dark.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  pass("mobile dark theme and page width");

  await page.goto(`${base}/r?url=https%3A%2F%2Fexample.com%2Fstorage-failure&title=Storage+failure`);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("blocked", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "Read later", exact: true }).click();
  await page.getByText("Could not save to this browser.", { exact: false }).waitFor();
  await page.locator('.kz-tabs a[href="/subscribe"]').click();
  await page.locator(".kz-saved-list").getByRole("link", { name: "Storage failure", exact: true }).waitFor();
  pass("storage failure is disclosed and session record remains usable");
  assert.deepEqual(errors, [], "uncaught browser errors");
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: results, measurements, errors, checkedAt: new Date().toISOString() }, null, 2));
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  await writeFile(`${output}/server.log`, logs);
}
