import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAskCorpus } from "@/lib/queries";
import {
  ASK_CACHE_TTL_MS,
  clientIp,
  estimateTokens,
  questionKey,
  rateLimit,
} from "@/lib/ask-guard";
import { reserveAskQuota, settleAskQuota } from "@/lib/ask-quota";
import { AI_ENABLED, AI_MODELS, client, systemBlock } from "@hotai/ai";
import { asJsonRecord, readJsonBody } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ask { question: string }
 * Streams a Claude answer grounded in the last 48h of articles.
 * Wire format (client: components/AskBox.tsx): Server-Sent Events where each
 * `data: {"delta":"..."}` line appends text and a final `data: {"done":true}`
 * closes the stream.
 *
 * Publicly reachable and it spends LLM tokens, so three guards apply in order:
 * per-IP rate limit → answer cache (identical question within TTL) → daily
 * token quota. Cache hits cost nothing and bypass the quota.
 */
export async function POST(req: Request) {
  if (!AI_ENABLED) {
    return NextResponse.json(
      { error: "AI features are not configured on this server." },
      { status: 503 },
    );
  }
  const parsed = await readJsonBody<{ question?: string }>(req, 16 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body = asJsonRecord(parsed.value);
  if (!body) return NextResponse.json({ error: "invalid JSON object" }, { status: 400 });
  const question = (typeof body.question === "string" ? body.question : "").trim().slice(0, 500);
  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const limited = rateLimit(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many questions — try again in a minute." },
      { status: 429, headers: { "retry-after": String(limited.retryAfterSec) } },
    );
  }

  const key = questionKey(question);
  const cached = await prisma.askCache
    .findUnique({ where: { hash: key } })
    .catch(() => null);
  if (cached && Date.now() - cached.createdAt.getTime() < ASK_CACHE_TTL_MS) {
    prisma.askCache
      .update({ where: { id: cached.id }, data: { hits: { increment: 1 } } })
      .catch(() => undefined);
    return sseResponse(async (send) => {
      send({ delta: cached.answer });
      send({ done: true, cached: true });
    });
  }

  let articles: Awaited<ReturnType<typeof getAskCorpus>>;
  try {
    articles = await getAskCorpus(48, 25);
  } catch (error) {
    // Do not reserve quota or invoke the provider when the grounding corpus
    // cannot be read; expose a retryable dependency failure instead of a
    // generic 500.
    console.warn("[ask] corpus unavailable:", safeError(error));
    return NextResponse.json(
      { error: "AI article corpus is temporarily unavailable." },
      { status: 503, headers: { "retry-after": "5" } },
    );
  }
  const corpus = articles
    .map(
      (a, i) =>
        `[${i + 1}] (${a.source.name}) ${a.title}\n    url: ${a.url}\n    ${
          a.aiSummaryEn || a.summary || ""
        }`,
    )
    .join("\n\n");

  const reservedTokens = estimateTokens(corpus + question) + 800;
  const quota = await reserveAskQuota(reservedTokens);
  if (!quota.ok) {
    const unavailable = quota.reason === "unavailable";
    return NextResponse.json(
      {
        error: unavailable
          ? "AI quota service is temporarily unavailable."
          : quota.reason === "concurrency"
            ? "Too many AI answers are already running — try again shortly."
            : "Daily AI quota exhausted — please come back tomorrow.",
      },
      { status: unavailable ? 503 : 429, headers: unavailable ? undefined : { "retry-after": "60" } },
    );
  }

  return sseResponse(async (send) => {
    let answer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const msgStream = await client().messages.stream({
        model: AI_MODELS.fast,
        max_tokens: 800,
        temperature: 0.4,
        system: systemBlock(
          "You are an AI-news analyst. Answer the user's question grounded ONLY in the provided article list. " +
            "When you reference an article, cite it inline like [3]. If the corpus doesn't cover the question, say so explicitly. " +
            "Be terse: prefer 2-4 short paragraphs over a wall of text.",
        ),
        messages: [
          {
            role: "user",
            content: `Recent articles (last 48h, top 25 by heat):\n\n${corpus}\n\n---\n\nQuestion: ${question}`,
          },
        ],
      }, { signal: req.signal });
      for await (const event of msgStream) {
        if (req.signal.aborted) {
          (msgStream as unknown as { abort?: () => void }).abort?.();
          // The provider may have billed output before the client abort reached
          // this loop, and no terminal usage event is guaranteed on cancellation.
          await settleAskQuota(quota.reservation, quota.reservation.reservedTokens);
          return;
        }
        if (event.type === "message_start") {
          inputTokens = event.message.usage?.input_tokens ?? 0;
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          answer += event.delta.text;
          if (!send({ delta: event.delta.text })) {
            // A disconnected browser can make enqueue throw before the SDK
            // emits its terminal usage event. Abort the provider stream and
            // charge the full reservation rather than settling input-only.
            (msgStream as unknown as { abort?: () => void }).abort?.();
            await settleAskQuota(quota.reservation, quota.reservation.reservedTokens);
            return;
          }
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }
      }

      await settleAskQuota(
        quota.reservation,
        (inputTokens || estimateTokens(corpus + question)) +
          (outputTokens || estimateTokens(answer)),
      );
      send({ done: true });
      if (answer.trim().length > 0) {
        await prisma.askCache
          .upsert({
            where: { hash: key },
            create: { hash: key, question, answer, model: AI_MODELS.fast },
            update: { answer, model: AI_MODELS.fast, createdAt: new Date(), hits: { increment: 1 } },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      // A provider failure may happen after input and part of the output have
      // already been billed while usage events are unavailable. The full
      // pre-flight reservation is the conservative charge for that path.
      await settleAskQuota(quota.reservation, quota.reservation.reservedTokens);
      console.warn("[ask] provider stream failed:", safeError(err));
      // Provider/network messages can contain endpoint or account metadata;
      // keep those in server logs rather than reflecting them to an anonymous
      // client.
      send({ error: "AI answer failed — please try again shortly." });
    }
  });
}

function safeError(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : "unknown provider error";
}

function sseResponse(handler: (send: (obj: unknown) => boolean) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
          return false;
        }
        return true;
      };
      try {
        await handler(send);
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
