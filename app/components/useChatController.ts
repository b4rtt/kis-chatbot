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

const CONTACT_MESSAGE = `Na tuto otázku bohužel nemáme odpověď.

--------------------------------
Kontakt
Nevíte si rady? Máte dotaz?

Než nás kontaktujete, doporučujeme navštívit stránku Časté dotazy (https://kis.esportsmedia.com/caste-dotazy), kde najdete odpovědi na nejčastější otázky.
Pokud odpověď nenajdete, náš tým technické podpory je vám k dispozici každý den, včetně víkendů, od 8:00 do 20:00.

Technická podpora (Denně 8 - 20)

+420 777 044 960
Napište nám

kis@esportsmedia.cz`;

type UseChatOptions = {
  endpoint?: string;
  admin?: boolean;
  language?: string;
};

export function useChatController(options: UseChatOptions = {}) {
  const { endpoint = "/api/ask", admin = false, language = "cs_CZ" } = options;
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
        body: JSON.stringify({ 
          query: question, 
          includeCitations: true, 
          includeCosts: true, 
          includeMarkdown: true,
          isAdmin: admin ? "true" : "false",
          language: language
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Dotaz selhal. Zkus to prosím znovu.");
      }
      const data = await r.json();
      setMsgs((prev) => [
        {
          q: question,
          a: data.answer === null ? CONTACT_MESSAGE : (data.answer ?? ""),
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
  }, [endpoint, loading, q, admin, language]);

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
