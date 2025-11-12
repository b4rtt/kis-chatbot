"use client";

import { useCallback, useMemo, useState } from "react";

export type Citation = { id: number; file: string; idx: number; score: number };
export type CostSummary = {
  usd: number;
  tokens: { prompt: number; completion: number; total: number };
};
export type ChatMessage = {
  q: string;
  a: string;
  c: Citation[];
  cost: CostSummary;
};

const emptyCost: CostSummary = {
  usd: 0,
  tokens: { prompt: 0, completion: 0, total: 0 },
};

type UseChatOptions = {
  endpoint?: string;
  localOnly?: boolean;
};

export function useChatController(options: UseChatOptions = {}) {
  const { endpoint = "/api/ask", localOnly = false } = options;
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async () => {
    if (loading) return;
    const question = q.trim();
    if (!question) return;
    setError(null);
    setLoading(true);

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question, localOnly }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Dotaz selhal. Zkus to prosím znovu.");
      }
      const data = await r.json();
      setMsgs((prev) => [
        {
          q: question,
          a: data.answer ?? "",
          c: data.citations ?? [],
          cost: data.cost ?? emptyCost,
        },
        ...prev,
      ]);
      setQ("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Něco se pokazilo.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, loading, localOnly, q]);

  const totals = useMemo(
    () =>
      msgs.reduce(
        (acc, msg) => {
          acc.usd += msg.cost?.usd ?? 0;
          acc.tokens += msg.cost?.tokens.total ?? 0;
          return acc;
        },
        { usd: 0, tokens: 0 }
      ),
    [msgs]
  );

  return {
    q,
    setQ,
    msgs,
    loading,
    error,
    setError,
    ask,
    totals,
  };
}
