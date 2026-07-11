import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAskCorpus } from "@/lib/queries";
import {
  ASK_CACHE_TTL_MS,
  addQuotaUsage,
  clientIp,
  estimateTokens,
  questionKey,
  quotaExceeded,
  rateLimit,
} from "@/lib/ask-guard";
import { AI_ENABLED, AI_MODELS, client, systemBlock } from "@hotai/ai";

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
  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = (body.question ?? "").trim().slice(0, 500);
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

  if (quotaExceeded()) {
    return NextResponse.json(
      { error: "Daily AI quota exhausted — please come back tomorrow." },
      { status: 429 },
    );
  }

  const articles = await getAskCorpus(48, 25);
  const corpus = articles
    .map(
      (a, i) =>
        `[${i + 1}] (${a.source.name}) ${a.title}\n    url: ${a.url}\n    ${
          a.aiSummaryEn || a.summary || ""
        }`,
    )
    .join("\n\n");

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
      });
      for await (const event of msgStream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage?.input_tokens ?? 0;
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          answer += event.delta.text;
          send({ delta: event.delta.text });
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }
      }
      send({ done: true });

      addQuotaUsage(
        (inputTokens || estimateTokens(corpus + question)) +
          (outputTokens || estimateTokens(answer)),
      );
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
      send({ error: (err as Error).message });
    }
  });
}

function sseResponse(handler: (send: (obj: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        await handler(send);
      } finally {
        controller.close();
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
