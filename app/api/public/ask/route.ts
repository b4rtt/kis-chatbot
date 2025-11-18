import { NextRequest, NextResponse } from "next/server";
import { loadIndex, topK, keywordSearch } from "@/lib/search";
import OpenAI from "openai";
import { checkRateLimit, getIdentifier } from "@/lib/rateLimit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const INPUT_PRICE = Number(process.env.OPENAI_INPUT_PRICE_PER_1K ?? "0.00015");
const OUTPUT_PRICE = Number(process.env.OPENAI_OUTPUT_PRICE_PER_1K ?? "0.0006");
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY || "";
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? "20");
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minut

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

type UsageSummary = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

const zeroCost = {
  usd: 0,
  tokens: { prompt: 0, completion: 0, total: 0 },
};

function summarizeCost(usage?: UsageSummary) {
  const prompt = usage?.prompt_tokens ?? 0;
  const completion = usage?.completion_tokens ?? 0;
  const total = prompt + completion;
  const usd = prompt / 1000 * INPUT_PRICE + completion / 1000 * OUTPUT_PRICE;
  return {
    usd,
    tokens: { prompt, completion, total },
  };
}

function formatAnswer(answer: string) {
  const text = answer?.trim() ?? "";
  if (!text) return CONTACT_MESSAGE;
  const normalized = text.toLowerCase();
  const triggers = [
    "not in the docs",
    "not in docs",
    "neni v dokumentaci",
    "není v dokumentaci",
  ];
  if (triggers.some((phrase) => normalized.includes(phrase))) {
    return CONTACT_MESSAGE;
  }
  return answer;
}

async function generateLocal(prompt: string) {
  const r = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3.1:8b-instruct",
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  const data = await r.json();
  return data.response as string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Kontrola autentizace přes secret key
    const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!PUBLIC_API_KEY || apiKey !== PUBLIC_API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid or missing API key" },
        { status: 401 }
      );
    }

    // 2. Parsování těla požadavku
    const body = await req.json();
    const { query, websiteUrl, k = 6, localOnly = true } = body;

    // 3. Validace povinných parametrů
    if (!query) {
      return NextResponse.json(
        { error: "Bad Request", message: "Missing required parameter: query" },
        { status: 400 }
      );
    }

    if (!websiteUrl) {
      return NextResponse.json(
        { error: "Bad Request", message: "Missing required parameter: websiteUrl" },
        { status: 400 }
      );
    }

    // Validace URL formátu
    try {
      new URL(websiteUrl);
    } catch {
      return NextResponse.json(
        { error: "Bad Request", message: "Invalid URL format in websiteUrl parameter" },
        { status: 400 }
      );
    }

    // 4. Rate limiting
    const identifier = getIdentifier(req);
    const rateLimit = checkRateLimit(identifier, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
    
    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetAt);
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per 10 minutes.`,
          resetAt: resetDate.toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.resetAt),
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // 5. Zpracování dotazu (stejná logika jako v /api/ask)
    const { embedTexts } = await import("@/lib/localEmbeddings");
    const [qvec] = await embedTexts([query]);

    const index = await loadIndex();
    const items = index?.items ?? [];
    const vectorPassages = topK(qvec, items, Number(k) || 6);
    const keywordPassages = keywordSearch(query, items, 3);
    const merged = [...vectorPassages];
    for (const candidate of keywordPassages) {
      if (!merged.find((p) => p.id === candidate.id)) {
        merged.push(candidate);
      }
    }
    const passages = merged.slice(0, Number(k) || 6);

    if (!passages.length) {
      return NextResponse.json({
        answer: CONTACT_MESSAGE,
        citations: [],
        cost: zeroCost,
      });
    }

    const context = passages.map((p, i) => `[#${i + 1}] ${p.file}\n---\n${p.content}`).join("\n\n");
    const sys = "Odpovídej pouze z dodaného kontextu. Když informace chybí, řekni 'Není v dokumentaci.' Buď stručný a odpověď zakonči citacemi ve formátu [#].";
    const prompt = `${sys}\n\nQuestion: ${query}\n\nContext:\n${context}`;

    const maxScore = vectorPassages[0]?.score ?? 0;
    if (maxScore < 0.28 && !localOnly && process.env.OPENAI_API_KEY) {
      const chat = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
      });
      const cost = summarizeCost(chat.usage ?? undefined);
      const rawAnswer = chat.choices[0].message.content ?? "";
      const answer = formatAnswer(rawAnswer);
      return NextResponse.json({
        answer,
        citations: passages.map((p, i) => ({ id: i + 1, file: p.file, idx: p.idx, score: p.score })),
        cost,
      }, {
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": String(rateLimit.resetAt),
        },
      });
    }

    let answer: string;
    let cost = zeroCost;
    if (localOnly) {
      answer = formatAnswer(await generateLocal(prompt));
    } else {
      const chat = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
      });
      cost = summarizeCost(chat.usage ?? undefined);
      answer = formatAnswer(chat.choices[0].message.content ?? "");
    }

    return NextResponse.json({
      answer,
      citations: passages.map((p, i) => ({ id: i + 1, file: p.file, idx: p.idx, score: p.score })),
      cost,
    }, {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(rateLimit.resetAt),
      },
    });
  } catch (error) {
    console.error("Public API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}

