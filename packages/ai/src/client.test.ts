import { describe, expect, it } from "vitest";
import { readAIConfig } from "./client.js";

describe("readAIConfig", () => {
  it("keeps AI disabled when credentials are empty", () => {
    expect(readAIConfig({})).toEqual({
      authToken: "",
      apiKey: "",
      baseURL: "",
      enabled: false,
      error: null,
    });
  });

  it("ignores placeholder credentials instead of enabling AI", () => {
    const config = readAIConfig({
      ANTHROPIC_AUTH_TOKEN: " <your-relay-key> ",
      ANTHROPIC_API_KEY: "changeme",
    });
    expect(config.authToken).toBe("");
    expect(config.apiKey).toBe("");
    expect(config.enabled).toBe(false);
    expect(config.error).toBeNull();
  });

  it("rejects setting both credential modes at once", () => {
    const config = readAIConfig({
      ANTHROPIC_AUTH_TOKEN: "relay-token",
      ANTHROPIC_API_KEY: "sk-test-key",
    });
    expect(config.enabled).toBe(false);
    expect(config.error).toContain("set only one");
  });

  it("accepts an official Anthropic API key and normalizes the URL", () => {
    expect(
      readAIConfig({
        ANTHROPIC_API_KEY: "  sk-test-key  ",
        ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1/",
      }),
    ).toEqual({
      authToken: "",
      apiKey: "sk-test-key",
      baseURL: "https://api.anthropic.com/v1",
      enabled: true,
      error: null,
    });
  });

  it("uses the official SDK endpoint when the base URL is empty", () => {
    const config = readAIConfig({ ANTHROPIC_API_KEY: "sk-test-key" });
    expect(config.enabled).toBe(true);
    expect(config.baseURL).toBe("");
    expect(config.error).toBeNull();
  });

  it("rejects a third-party relay unless it is explicitly opted in", () => {
    const config = readAIConfig({
      ANTHROPIC_AUTH_TOKEN: "relay-token",
      ANTHROPIC_BASE_URL: "https://relay.example.test",
    });
    expect(config.enabled).toBe(false);
    expect(config.error).toContain("ALLOW_THIRD_PARTY_AI");
  });

  it("accepts an HTTPS third-party relay only with explicit opt-in", () => {
    expect(
      readAIConfig({
        ANTHROPIC_AUTH_TOKEN: "relay-token",
        ANTHROPIC_BASE_URL: "https://relay.example.test/v1/",
        ALLOW_THIRD_PARTY_AI: "TrUe",
      }),
    ).toEqual({
      authToken: "relay-token",
      apiKey: "",
      baseURL: "https://relay.example.test/v1",
      enabled: true,
      error: null,
    });
  });

  it("rejects remote HTTP even when third-party opt-in is enabled", () => {
    const config = readAIConfig({
      ANTHROPIC_API_KEY: "sk-test-key",
      ANTHROPIC_BASE_URL: "http://relay.example.test",
      ALLOW_THIRD_PARTY_AI: "true",
    });
    expect(config.enabled).toBe(false);
    expect(config.error).toContain("ALLOW_INSECURE_AI_HTTP");
  });

  it("allows localhost HTTP only with third-party opt-in", () => {
    const config = readAIConfig({
      ANTHROPIC_AUTH_TOKEN: "local-relay-token",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:8787/",
      ALLOW_THIRD_PARTY_AI: "true",
    });
    expect(config).toEqual({
      authToken: "local-relay-token",
      apiKey: "",
      baseURL: "http://127.0.0.1:8787",
      enabled: true,
      error: null,
    });
  });

  it("rejects URL credentials and non-HTTP protocols", () => {
    expect(
      readAIConfig({
        ANTHROPIC_API_KEY: "sk-test-key",
        ANTHROPIC_BASE_URL: "https://user:pass@relay.example.test",
        ALLOW_THIRD_PARTY_AI: "true",
      }).error,
    ).toContain("without credentials");

    expect(
      readAIConfig({
        ANTHROPIC_API_KEY: "sk-test-key",
        ANTHROPIC_BASE_URL: "ftp://relay.example.test",
        ALLOW_THIRD_PARTY_AI: "true",
      }).error,
    ).toContain("http(s) URL");
  });
});
