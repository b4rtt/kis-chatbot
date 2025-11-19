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

function formatAnswer(answer: string): string | null {
  const text = answer?.trim() ?? "";
  if (!text) return null;
  const normalized = text.toLowerCase();
  const triggers = [
    "not in the docs",
    "not in docs",
    "neni v dokumentaci",
    "není v dokumentaci",
  ];
  if (triggers.some((phrase) => normalized.includes(phrase))) {
    return null;
  }
  return answer;
}

function stripMarkdown(text: string): string {
  if (!text) return text;
  
  // Odstranit markdown syntaxi
  return text
    // Headers (# ## ###)
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    // Bold (**text** nebo __text__)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Italic (*text* nebo _text_)
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Code blocks ```
    .replace(/```[\s\S]*?```/g, '')
    // Inline code `code`
    .replace(/`([^`]+)`/g, '$1')
    // Lists (- * +)
    .replace(/^[\s]*[-*+]\s+(.+)$/gm, '$1')
    // Numbered lists
    .replace(/^\s*\d+\.\s+(.+)$/gm, '$1')
    // Blockquotes (>)
    .replace(/^>\s+(.+)$/gm, '$1')
    // Horizontal rules (---)
    .replace(/^---+$/gm, '')
    // Clean up multiple spaces
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


export async function POST(req: NextRequest) {
  try {
    // 1. Kontrola autentizace pro veřejné API (pokud je poslán x-api-key)
    const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    const isPublicAPI = !!apiKey;
    
    if (isPublicAPI) {
      if (!PUBLIC_API_KEY || apiKey !== PUBLIC_API_KEY) {
        return NextResponse.json(
          { error: "Unauthorized", message: "Invalid or missing API key" },
          { status: 401 }
        );
      }
    }

    // 2. Rate limiting
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

    // 3. Parsování těla požadavku
    const body = await req.json();
    // Pro veřejné API je výchozí includeMarkdown false (plain text), pro interní API true (markdown)
    const defaultIncludeMarkdown = isPublicAPI ? false : true;
    const { query, websiteUrl, k = 6, includeCitations = false, includeCosts = false, includeMarkdown = defaultIncludeMarkdown, isAdmin } = body;
    
    // Určit idType: isAdmin="true" => idType=2 (admin), jinak idType=1 (user)
    const idType: 1 | 2 = (isAdmin === "true" || isAdmin === true) ? 2 : 1;

    // 4. Validace povinných parametrů
    if (!query) {
      return NextResponse.json(
        { error: "Bad Request", message: "Missing required parameter: query" },
        { status: 400 }
      );
    }

    // Pro veřejné API je websiteUrl povinný
    if (isPublicAPI) {
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
    }

    // 5. Zpracování dotazu
    const { embedTexts } = await import("@/lib/localEmbeddings");
    const [qvec] = await embedTexts([query]);

    const index = await loadIndex(idType);
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
      const response: any = {
        answer: null,
      };
      if (includeCosts) {
        response.cost = zeroCost;
      }
      if (includeCitations) {
        response.citations = [];
      }
      return NextResponse.json(response, {
        headers: {
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": String(rateLimit.resetAt),
        },
      });
    }

    // Formátování kontextu - pokud jsou vypnuté citace, nepřidávej čísla
    const context = includeCitations
      ? passages.map((p, i) => `[#${i + 1}] ${p.file}\n---\n${p.content}`).join("\n\n")
      : passages.map((p) => `${p.file}\n---\n${p.content}`).join("\n\n");
    
    const sys = includeCitations
      ? "Odpovídej pouze z dodaného kontextu. Když informace chybí, řekni 'Není v dokumentaci.' Buď stručný a odpověď zakonči citacemi ve formátu [#]."
      : "Odpovídej pouze z dodaného kontextu. Když informace chybí, řekni 'Není v dokumentaci.' Buď stručný.";
    
    const prompt = `${sys}\n\nQuestion: ${query}\n\nContext:\n${context}`;

    const rateLimitHeaders = {
      "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
      "X-RateLimit-Remaining": String(rateLimit.remaining),
      "X-RateLimit-Reset": String(rateLimit.resetAt),
    };

    // Generate answer using OpenAI
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured. Please set it in environment variables.");
    }

    const chat = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
    });
    
    // Počítat cost pouze pokud je požadováno
    const cost = includeCosts ? summarizeCost(chat.usage ?? undefined) : undefined;
    let answer = formatAnswer(chat.choices[0].message.content ?? "");
    
    // Pokud jsou vypnuté citace, odstraň všechny [#X] reference z odpovědi
    if (!includeCitations && answer) {
      answer = answer.replace(/\s*\[#\d+\]\s*/g, " ").trim();
    }
    
    // Pokud je vypnutý markdown, převeď na plain text
    if (!includeMarkdown && answer) {
      answer = stripMarkdown(answer);
    }

    const response: any = {
      answer,
    };
    if (includeCosts) {
      response.cost = cost;
    }
    if (includeCitations) {
      response.citations = passages.map((p, i) => ({ id: i + 1, file: p.file, idx: p.idx, score: p.score }));
    }
    return NextResponse.json(response, {
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error("API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Pokud index neexistuje, vrať 404
    if (errorMessage.includes("not found") || errorMessage.includes("Please run")) {
      return NextResponse.json(
        { error: "Not Found", message: errorMessage },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
