import { describe, expect, it } from "vitest";
import {
  UnsafeUrlError,
  assertPublicHttpUrl,
  isBlockedAddress,
  isBlockedHostname,
  isBlockedResolvedAddress,
  parsePublicHttpUrl,
} from "./ssrf";

function rejects(raw: string) {
  expect(() => parsePublicHttpUrl(raw)).toThrow(UnsafeUrlError);
}

function accepts(raw: string, host?: string) {
  const url = parsePublicHttpUrl(raw);
  expect(url.protocol === "http:" || url.protocol === "https:").toBe(true);
  if (host) expect(url.hostname).toBe(host);
  return url;
}

describe("parsePublicHttpUrl", () => {
  it("rejects http://127.0.0.1/1", () => {
    rejects("http://127.0.0.1/1");
  });

  it("rejects loopback, localhost, and metadata hosts", () => {
    rejects("http://127.0.0.1/");
    rejects("https://127.0.0.1/latest");
    rejects("http://localhost/");
    rejects("http://localhost:8080/admin");
    rejects("http://[::1]/");
    rejects("http://[::ffff:127.0.0.1]/");
    rejects("http://[::ffff:7f00:1]/");
    rejects("http://metadata.google.internal/");
    rejects("http://169.254.169.254/latest/meta-data/");
    rejects("http://instance-data/");
  });

  it("rejects private IPv4 / IPv6 / fake-ip ranges", () => {
    rejects("http://10.0.0.1/");
    rejects("http://192.168.1.1/");
    rejects("http://172.16.5.4/");
    rejects("http://172.31.255.255/");
    rejects("http://100.64.0.1/");
    rejects("http://198.18.0.1/");
    rejects("http://198.19.255.1/");
    rejects("http://0.0.0.0/");
    rejects("http://[fc00::1]/");
    rejects("http://[fe80::1]/");
  });

  it("rejects non-http schemes, credentials, and empty hosts", () => {
    rejects("ftp://example.com/");
    rejects("file:///etc/passwd");
    rejects("gopher://example.com/");
    rejects("http://user:pass@example.com/");
    rejects("not a url");
  });

  it("rejects dotted / decimal aliases of loopback", () => {
    rejects("http://127.1/");
    rejects("http://2130706433/");
  });

  it("allows public http(s) hostnames (syntax only)", () => {
    accepts("https://example.com/path", "example.com");
    accepts("http://news.ycombinator.com/rss", "news.ycombinator.com");
    accepts("https://openai.com/news/rss.xml");
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects http://127.0.0.1/1 without DNS", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/1")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("isBlockedAddress / isBlockedHostname", () => {
  it("flags loopback and link-local", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("169.254.1.1")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("1.1.1.1")).toBe(false);
    expect(isBlockedAddress("198.18.0.23")).toBe(true);
    expect(isBlockedResolvedAddress("198.18.0.23")).toBe(false);
    expect(isBlockedResolvedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedResolvedAddress("64:ff9b::7f00:1")).toBe(true);
    expect(isBlockedResolvedAddress("64:ff9b::808:808")).toBe(false);
  });

  it("flags localhost-style names", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("foo.localhost")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});
