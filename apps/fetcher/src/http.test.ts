import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "./config.js";
import { httpText } from "./http.js";

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

describe("fetcher HTTP client", () => {
  it("follows bounded redirects and returns the final body", async () => {
    server = createServer((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" }).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    }).listen(0);
    await onceListening(server);
    const port = (server.address() as { port: number }).port;
    await expect(httpText(`http://127.0.0.1:${port}/start`)).resolves.toBe("ok");
  });

  it("aborts bodies that exceed the configured byte cap", async () => {
    const previous = config.fetchMaxBytes;
    config.fetchMaxBytes = 8;
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" }).end("0123456789");
    }).listen(0);
    await onceListening(server);
    const port = (server.address() as { port: number }).port;
    await expect(httpText(`http://127.0.0.1:${port}/big`)).rejects.toThrow("exceeds");
    config.fetchMaxBytes = previous;
  });
});

function onceListening(value: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    value.once("listening", () => resolve());
    value.once("error", reject);
  });
}
