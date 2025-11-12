import { NextRequest, NextResponse } from "next/server";
import { loadIndex, topK } from "@/lib/search";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const INPUT_PRICE = Number(process.env.OPENAI_INPUT_PRICE_PER_1K ?? "0.00015");
const OUTPUT_PRICE = Number(process.env.OPENAI_OUTPUT_PRICE_PER_1K ?? "0.0006");

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

async function generateLocal(prompt: string) {
const r = await fetch("http://127.0.0.1:11434/api/generate", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify({
model: process.env.OLLAMA_MODEL || "llama3.1:8b-instruct",
prompt, stream: false,
options: { temperature: 0.2 },
}),
});
const data = await r.json();
return data.response as string;
}

export async function POST(req: NextRequest) {
const { query, k = 6, localOnly = true } = await req.json();
if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

// Local query embedding
const { embedTexts } = await import("@/lib/localEmbeddings");
const [qvec] = await embedTexts([query]);

// Retrieve top-K chunks
const index = await loadIndex();
const passages = topK(qvec, index.items, Number(k) || 6);
const context = passages.map((p,i)=>`[#${i+1}] ${p.file}\n---\n${p.content}`).join("\n\n");

const sys = "You answer ONLY from the provided context. If info is missing, say 'Not in the docs.' Be concise and end with [#] citations.";
const prompt = `${sys}\n\nQuestion: ${query}\n\nContext:\n${context}`;

// Confidence threshold (optional)
const maxScore = passages[0]?.score ?? 0;
if (maxScore < 0.28 && !localOnly && process.env.OPENAI_API_KEY) {
  // fallback to cloud for tricky queries
  const chat = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });
  const cost = summarizeCost(chat.usage ?? undefined);
  return NextResponse.json({
    answer: chat.choices[0].message.content,
    citations: passages.map((p,i)=>({ id:i+1, file:p.file, idx:p.idx, score:p.score })),
    cost,
  });
}

// Local generation (Ollama) or cloud if localOnly=false and OPENAI_API_KEY set
let answer: string;
let cost = zeroCost;
if (localOnly) {
  answer = await generateLocal(prompt);
} else {
  const chat = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
  });
  cost = summarizeCost(chat.usage ?? undefined);
  answer = chat.choices[0].message.content ?? "";
}

return NextResponse.json({
  answer,
  citations: passages.map((p,i)=>({ id:i+1, file:p.file, idx:p.idx, score:p.score })),
  cost,
});
}
