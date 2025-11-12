import { NextRequest, NextResponse } from "next/server";
import { loadIndex, topK } from "@/lib/search";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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
model: "gpt-4.1-mini",
temperature: 0.2,
messages: [
{ role: "system", content: sys },
{ role: "user", content: prompt },
],
});
return NextResponse.json({
answer: chat.choices[0].message.content,
citations: passages.map((p,i)=>({ id:i+1, file:p.file, idx:p.idx, score:p.score })),
});
}

// Local generation (Ollama) or cloud if localOnly=false and OPENAI_API_KEY set
const answer = localOnly
? await generateLocal(prompt)
: (await openai.chat.completions.create({
model: "gpt-4.1-mini",
temperature: 0.2,
messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
})).choices[0].message.content ?? "";

return NextResponse.json({
answer,
citations: passages.map((p,i)=>({ id:i+1, file:p.file, idx:p.idx, score:p.score })),
});
}
