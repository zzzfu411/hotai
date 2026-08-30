"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";

export function AskBox({ compact = false }: { compact?: boolean }) {
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions =
    lang === "zh"
      ? ["今天最值得关注的开源模型?", "OpenAI / Anthropic 这两天有什么动静?", "学术圈在讨论哪些新论文?"]
      : ["What's the biggest open-source release today?", "Any major news from OpenAI or Anthropic?", "Which new papers is the community talking about?"];

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const ask = async (question: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setQ(question);
    setAnswer("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
        signal: ac.signal,
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
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (ac.signal.aborted) return;
      setError((err as Error).message);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  if (compact) {
    return (
      <div className="kz-ask-compact">
        <p className="kz-pulse-kicker">{lang === "zh" ? "问问 Hot AI" : "Ask Hot AI"}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) ask(q.trim());
          }}
          className="kz-search kz-ask-form"
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "zh" ? "提个问题…" : "Ask a question…"}
            disabled={busy}
            className="kz-input"
            aria-label={lang === "zh" ? "提问" : "Ask"}
          />
          <button
            type="submit"
            disabled={busy || !q.trim()}
            className="kz-search-go"
            aria-label={lang === "zh" ? "发送" : "Send"}
          >
            {busy ? "…" : "→"}
          </button>
        </form>
        {(answer || error) && (
          <div className="kz-ask-answer">
            {answer}
            {busy && <span className="kz-ask-caret" />}
            {error && <p className="kz-ask-error">⚠ {error}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="kz-card kz-ask">
      <p className="kz-ask-kicker">{lang === "zh" ? "问问 Hot AI" : "Ask Hot AI"}</p>
      <p className="kz-ask-hint">
        {lang === "zh"
          ? "基于过去 48 小时的头条文章，由 Claude 实时回答。"
          : "Streamed by Claude, grounded in the last 48 hours of headlines."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="kz-search kz-ask-form"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === "zh" ? "提个问题…" : "Ask a question…"}
          disabled={busy}
          className="kz-input"
          aria-label={lang === "zh" ? "提问" : "Ask"}
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="kz-search-go"
          aria-label={lang === "zh" ? "发送" : "Send"}
        >
          {busy ? "…" : "→"}
        </button>
      </form>

      <div className="kz-ask-suggestions">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            disabled={busy}
            className="kz-chip"
          >
            {s}
          </button>
        ))}
      </div>

      {(answer || error) && (
        <div className="kz-ask-answer">
          {answer}
          {busy && <span className="kz-ask-caret" />}
          {error && <p className="kz-ask-error">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}
