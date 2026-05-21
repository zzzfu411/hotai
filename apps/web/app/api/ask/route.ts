import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AI_ENABLED, AI_MODELS, client, systemBlock } from "@hotai/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ask { question: string }
 * Streams a Claude answer grounded in today's top articles.
 * Sends Server-Sent Events: each `data: {"delta":"..."}` line is appended text;
 * a final `data: {"done":true}` closes the stream.
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

  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const articles = await prisma.article.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 25,
    include: { source: { select: { name: true } } },
  });

  const corpus = articles
    .map(
      (a, i) =>
        `[${i + 1}] (${a.source.name}) ${a.title}\n    url: ${a.url}\n    ${
          a.aiSummaryEn || a.summary || ""
        }`,
    )
    .join("\n\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
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
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ delta: event.delta.text });
          }
        }
        send({ done: true });
      } catch (err) {
        send({ error: (err as Error).message });
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
