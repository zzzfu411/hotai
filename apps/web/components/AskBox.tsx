"use client";

import { useState } from "react";
import { useLang } from "./LangContext";

export function AskBox() {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions =
    lang === "zh"
      ? ["今天最值得关注的开源模型?", "OpenAI / Anthropic 这两天有什么动静?", "学术圈在讨论哪些新论文?"]
      : ["What's the biggest open-source release today?", "Any major news from OpenAI or Anthropic?", "Which new papers is the community talking about?"];

  const ask = async (question: string) => {
    setQ(question);
    setAnswer("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const m = line.match(/^data:\s*(.+)$/);
          if (!m) continue;
          try {
            const obj = JSON.parse(m[1]!);
            if (typeof obj.delta === "string") setAnswer((a) => a + obj.delta);
            if (obj.error) throw new Error(obj.error);
            if (obj.done) {
              setBusy(false);
              return;
            }
          } catch (err) {
            setError((err as Error).message);
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-ember-700 dark:text-ember-200">
        <span aria-hidden>✶</span>
        {lang === "zh" ? "问问 Hot AI" : "Ask Hot AI"}
      </div>
      <p className="mt-1 text-sm text-ink-500">
        {lang === "zh"
          ? "基于过去 48 小时的头条文章,由 Claude 实时回答。"
          : "Streamed by Claude, grounded in the last 48 hours of headlines."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === "zh" ? "提个问题…" : "Ask a question…"}
          disabled={busy}
          className="flex-1 px-3 py-2 rounded-xl border border-ink-200 dark:border-ink-700 bg-white/70 dark:bg-ink-900/40 focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none transition disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="px-4 py-2 rounded-xl fire-gradient text-white font-semibold disabled:opacity-50"
        >
          {busy ? "…" : lang === "zh" ? "发送" : "Send"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            disabled={busy}
            className="chip-soft hover:border-accent hover:text-accent transition disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {(answer || error) && (
        <div className="mt-4 p-4 rounded-xl bg-ink-50/70 dark:bg-ink-900/60 border border-ink-200/60 dark:border-ink-800/60 text-sm leading-relaxed whitespace-pre-wrap">
          {answer}
          {busy && <span className="inline-block w-2 h-4 ml-0.5 align-middle bg-accent animate-pulse" />}
          {error && (
            <p className="mt-2 text-red-500 text-xs">⚠ {error}</p>
          )}
        </div>
      )}
    </div>
  );
}
