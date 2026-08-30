import { describe, expect, it } from "vitest";
import {
  CATALOG_BY_ID,
  CATALOG_ITEMS_PER_SOURCE,
  CATALOG_SOURCES,
  DEFAULT_ENABLED_IDS,
  MAX_PULL_IDS,
  idsForCategory,
  resolveCatalogSources,
} from "./catalog";

describe("catalog", () => {
  it("has unique ids and http(s) or site-relative urls", () => {
    const ids = CATALOG_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CATALOG_SOURCES) {
      if (s.url.startsWith("/")) {
        expect(s.url.startsWith("/")).toBe(true);
        continue;
      }
      expect(s.url.startsWith("http://") || s.url.startsWith("https://")).toBe(true);
    }
  });

  it("drops unknown ids and caps the pull list", () => {
    const ids = ["nope", "sspai", "sspai", "ithome", ...Array.from({ length: 40 }, (_, i) => `x${i}`)];
    const resolved = resolveCatalogSources(["gnews-top", ...ids, "hn"]);
    expect(resolved.every((s) => CATALOG_BY_ID.has(s.id))).toBe(true);
    expect(resolved.length).toBeLessThanOrEqual(MAX_PULL_IDS);
    expect(resolved.filter((s) => s.id === "sspai")).toHaveLength(1);
  });

  it("mix follows enabled ids; topic chips fill from the category list", () => {
    const enabled = ["sspai", "hn"];
    expect(idsForCategory("mix", enabled).sort()).toEqual(["hn", "sspai"].sort());
    const tech = idsForCategory("tech", enabled);
    expect(tech[0]).toBe("sspai");
    expect(tech).toContain("ithome");
    expect(tech.length).toBeGreaterThan(2);
  });

  it("caps per-source cards well below the parser ceiling", () => {
    expect(CATALOG_ITEMS_PER_SOURCE).toBeGreaterThanOrEqual(12);
    expect(CATALOG_ITEMS_PER_SOURCE).toBeLessThanOrEqual(40);
  });

  it("default-enabled set is non-empty and in the catalog", () => {
    expect(DEFAULT_ENABLED_IDS.length).toBeGreaterThan(8);
    expect(DEFAULT_ENABLED_IDS.length).toBeLessThanOrEqual(MAX_PULL_IDS);
    for (const id of DEFAULT_ENABLED_IDS) {
      expect(CATALOG_BY_ID.has(id)).toBe(true);
    }
  });
});
