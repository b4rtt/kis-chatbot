Local Docs Chatbot — Next.js + Local Embeddings (+ optional Local LLM)
A fully local documentation chatbot you can run on your own server or laptop.
It fetches Markdown docs from a public HTTPS site, builds local embeddings (no Pinecone), and answers questions strictly from your docs.
Optionally, you can run generation via a local LLM (Ollama).
If you prefer a hybrid, you can keep embeddings local and call a cheap cloud model for generation.

✨ Features

HTTPS → local mirror: POST /api/admin/sync downloads .md files using ETag/Last-Modified

Local vector index: POST /api/admin/reindex builds embeddings with @xenova/transformers and writes docs/index.json

RAG answers: POST /api/ask retrieves top-K chunks and generates an answer strictly from context (citations included)

Zero external DB: no Pinecone/Supabase; everything lives in the repo

Optional local LLM: use Ollama (e.g., llama3.1:8b-instruct) for fully offline Q&A

Admin protection: admin endpoints secured with x-admin-key

🧰 Prerequisites

Node.js 20+ and npm

For local embeddings: nothing extra (models download on first run)

For local LLM (optional): Ollama installed and running

🚀 Quick Start

# 1) Create the project

npm create next@latest local-docs-chat --typescript --eslint
cd local-docs-chat

# 2) Install dependencies

npm i @xenova/transformers openai

# 3) Create folders

mkdir -p docs app/api/admin lib

# 4) Add environment variables

cat > .env.local << 'EOF'
DOCS_BASE_URL=https://docs.example.com # your public HTTPS docs root
DOCS_DIR=./docs
ADMIN_KEY=super_secret_key

# Optional for hybrid mode (cloud generation):

# OPENAI_API_KEY=sk-...

# Optional for local LLM:

# OLLAMA_MODEL=llama3.1:8b-instruct

EOF

Create next.config.mjs:
/\*_ @type {import('next').NextConfig} _/
const nextConfig = { reactStrictMode: true };
export default nextConfig;

Create .gitignore:
node_modules
.next
.env\*
docs

📁 Project Structure
local-docs-chat/
├─ app/
│ ├─ page.tsx # simple UI (optional)
│ └─ api/
│ ├─ ask/route.ts # RAG Q&A endpoint
│ └─ admin/
│ ├─ sync/route.ts # HTTPS → ./docs mirror
│ └─ reindex/route.ts # embeddings → ./docs/index.json
├─ lib/
│ ├─ crawler.ts # discovers .md URLs (manifest or shallow crawl)
│ ├─ sync.ts # mirror with ETag/Last-Modified
│ ├─ md.ts # markdown chunking
│ ├─ localEmbeddings.ts # local embedding generation
│ ├─ ingest.ts # builds index.json
│ └─ search.ts # cosine similarity/topK
├─ docs/ # local mirror + index.json (gitignored)
├─ .env.local
├─ next.config.mjs
└─ package.json

🧱 Code (copy into files)
lib/crawler.ts
const BASE = process.env.DOCS_BASE_URL!;
const MAX_PAGES = 200;

function abs(u: string) {
try { return new URL(u, BASE).toString(); } catch { return null; }
}

export async function listMarkdownUrls(): Promise<string[]> {
// Prefer a manifest at BASE/index.json (["/a.md", "/b.md"])
try {
const r = await fetch(new URL("index.json", BASE));
if (r.ok) {
const j = await r.json();
const arr = Array.isArray(j) ? j : Array.isArray(j.urls) ? j.urls : [];
const urls = arr.map((u: string) => abs(u)).filter(Boolean).filter((u: string) => u.endsWith(".md"));
if (urls.length) return urls as string[];
}
} catch {}

// Fallback: shallow crawl same origin
const seen = new Set<string>(), out = new Set<string>(), q = [BASE];
while (q.length && seen.size < MAX_PAGES) {
const u = q.shift()!;
if (seen.has(u)) continue; seen.add(u);

    let res: Response;
    try { res = await fetch(u, { redirect: "follow" }); } catch { continue; }
    if (!res.ok) continue;

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/markdown") || u.endsWith(".md")) { out.add(u); continue; }
    if (!ct.includes("text/html")) continue;

    const html = await res.text();
    const links = Array.from(html.matchAll(/href="([^"]+)"/g)).map(m => m[1]);
    for (const l of links) {
      const u2 = abs(l);
      if (!u2 || !u2.startsWith(BASE)) continue;
      if (u2.endsWith(".md")) out.add(u2);
      else if (!u2.includes("#")) q.push(u2);
    }

}
if (!out.size) throw new Error("No .md URLs found. Consider providing index.json manifest.");
return Array.from(out);
}

lib/sync.ts
import fs from "fs/promises";
import path from "path";
import { listMarkdownUrls } from "./crawler";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const CACHE_FILE = path.join(DOCS_DIR, ".cache.json");

type Cache = Record<string, { etag?: string; lastModified?: string }>;

async function readCache(): Promise<Cache> {
try { return JSON.parse(await fs.readFile(CACHE_FILE, "utf8")); } catch { return {}; }
}
async function writeCache(c: Cache) {
await fs.mkdir(DOCS_DIR, { recursive: true });
await fs.writeFile(CACHE_FILE, JSON.stringify(c, null, 2), "utf8");
}
function urlToLocalPath(u: string) {
const { hostname, pathname } = new URL(u);
const safe = pathname.replace(/^\/+/, "");
return path.join(DOCS_DIR, hostname, safe);
}

export async function syncDocs() {
const urls = await listMarkdownUrls();
const cache = await readCache();
const changed: string[] = [];

for (const u of urls) {
const headers: Record<string, string> = {};
const meta = cache[u];
if (meta?.etag) headers["If-None-Match"] = meta.etag;
else if (meta?.lastModified) headers["If-Modified-Since"] = meta.lastModified;

    const r = await fetch(u, { headers });
    if (r.status === 304) continue;
    if (!r.ok) continue;

    const etag = r.headers.get("etag") || undefined;
    const lastModified = r.headers.get("last-modified") || undefined;
    const text = await r.text();

    const lp = urlToLocalPath(u);
    await fs.mkdir(path.dirname(lp), { recursive: true });
    await fs.writeFile(lp, text, "utf8");

    cache[u] = { etag, lastModified };
    changed.push(lp);

}

await writeCache(cache);
return { ok: true, downloaded: changed.length, changedPaths: changed };
}

lib/md.ts
export function splitMarkdownToChunks(md: string, maxTokens = 800, overlap = 120) {
const sections = md.split(/\n(?=#{1,6}\s)/g);
const chunks: string[] = [];
for (const sec of sections) {
const words = sec.split(/\s+/);
for (let i = 0; i < words.length; i += Math.max(1, maxTokens - overlap)) {
const part = words.slice(i, i + maxTokens).join(" ").trim();
if (part) chunks.push(part);
}
}
return chunks;
}

lib/localEmbeddings.ts
import { pipeline } from "@xenova/transformers";

const MODEL_ID = process.env.EMB_MODEL_ID || "Xenova/multilingual-e5-small"; // good multilingual small model

let extractor: any;
async function getExtractor() {
if (!extractor) extractor = await pipeline("feature-extraction", MODEL_ID);
return extractor;
}

// mean pooling + normalize => cosine = dot product
export async function embedTexts(texts: string[]): Promise<number[][]> {
const model = await getExtractor();
const out = await model(texts, { pooling: "mean", normalize: true });
const arr = Array.isArray(out.data) ? out.data : Array.from(out.data);
return Array.isArray(arr[0]) ? arr as number[][] : [arr as number[]];
}

lib/ingest.ts
import fs from "fs/promises";
import path from "path";
import { splitMarkdownToChunks } from "./md";
import { embedTexts } from "./localEmbeddings";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const INDEX_PATH = path.join(DOCS_DIR, "index.json");

export async function ingestAllMarkdown() {
const files: string[] = [];
async function walk(dir: string) {
const entries = await fs.readdir(dir, { withFileTypes: true });
for (const e of entries) {
const p = path.join(dir, e.name);
if (e.isDirectory()) await walk(p);
else if (e.isFile() && e.name.endsWith(".md")) files.push(p);
}
}
await walk(DOCS_DIR);

const all: any[] = [];
for (const file of files) {
const raw = await fs.readFile(file, "utf8");
const rel = path.relative(DOCS_DIR, file);
const chunks = splitMarkdownToChunks(raw);
const vectors = await embedTexts(chunks);

    vectors.forEach((v, i) => {
      all.push({ id: `${rel}#${i}`, file: rel, idx: i, content: chunks[i], vector: v });
    });

}

await fs.writeFile(INDEX_PATH, JSON.stringify({ items: all }, null, 2), "utf8");
return { ok: true, files: files.length, chunks: all.length, indexPath: INDEX_PATH };
}

lib/search.ts
import fs from "fs/promises";
import path from "path";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const INDEX_PATH = path.join(DOCS_DIR, "index.json");

export type IndexItem = { id: string; file: string; idx: number; content: string; vector: number[] };
let \_cache: { items: IndexItem[] } | null = null;

export async function loadIndex() {
if (\_cache) return \_cache;
const raw = await fs.readFile(INDEX_PATH, "utf8");
\_cache = JSON.parse(raw);
return \_cache;
}

export function topK(qvec: number[], items: IndexItem[], k = 6) {
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x \* b[i], 0);
return items
.map(it => ({ it, score: dot(qvec, it.vector) }))
.sort((a,b)=>b.score - a.score)
.slice(0, k)
.map(s => ({ ...s.it, score: s.score }));
}

🌐 API Routes
app/api/admin/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { syncDocs } from "@/lib/sync";

export async function POST(req: NextRequest) {
if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY)
return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const res = await syncDocs();
return NextResponse.json(res);
}

app/api/admin/reindex/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ingestAllMarkdown } from "@/lib/ingest";
import { syncDocs } from "@/lib/sync";

export async function POST(req: NextRequest) {
if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY)
return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const doSync = new URL(req.url).searchParams.get("sync") === "1";
if (doSync) await syncDocs();

const res = await ingestAllMarkdown();
return NextResponse.json(res);
}

app/api/ask/route.ts (local embeddings; local or cloud generation)
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

🖥️ Optional UI — app/page.tsx
"use client";
import { useState } from "react";

export default function Page() {
const [q, setQ] = useState("");
const [msgs, setMsgs] = useState<{q:string,a:string,c:any[]}[]>([]);

async function ask() {
const r = await fetch("/api/ask", {
method: "POST",
headers: {"Content-Type":"application/json"},
body: JSON.stringify({ query: q, localOnly: true })
});
const data = await r.json();
setMsgs(m => [...m, { q, a: data.answer, c: data.citations }]);
setQ("");
}

return (

<main style={{maxWidth:800, margin:"40px auto", fontFamily:"system-ui"}}>
<h1>Local Docs Chat</h1>
<div style={{display:"flex", gap:8}}>
<input
value={q}
onChange={e=>setQ(e.target.value)}
onKeyDown={e=>e.key==="Enter" && ask()}
placeholder="Ask your docs..."
style={{flex:1, padding:10, border:"1px solid #ccc"}}
/>
<button onClick={ask}>Ask</button>
</div>
<div style={{marginTop:24}}>
{msgs.map((m,i)=>(
<div key={i} style={{border:"1px solid #eee", padding:12, margin:"12px 0"}}>
<div><strong>You:</strong> {m.q}</div>
<div style={{whiteSpace:"pre-wrap", marginTop:8}}><strong>Answer:</strong> {m.a}</div>
{m.c?.length ? (
<div style={{fontSize:14, color:"#555", marginTop:8}}>
Sources: {m.c.map((c:any)=>`[#${c.id} ${c.file}]`).join(" ")}
</div>
) : null}
</div>
))}
</div>
</main>
);
}

▶️ Run
npm run dev

Sync docs:
curl -X POST -H "x-admin-key: $ADMIN_KEY" http://localhost:3000/api/admin/sync

Reindex (optionally triggers sync first):
curl -X POST -H "x-admin-key: $ADMIN_KEY" "http://localhost:3000/api/admin/reindex?sync=1"

Ask:
curl -X POST http://localhost:3000/api/ask \
 -H "Content-Type: application/json" \
 -d '{ "query": "How do I reset my password?" }'

🧱 Optional: Local LLM via Ollama

Install Ollama (macOS/Linux/Win): https://ollama.com

Pull a model:

ollama pull llama3.1:8b-instruct

Run server:

ollama serve

Set env (optional):

OLLAMA_MODEL=llama3.1:8b-instruct

The /api/ask route will call Ollama if localOnly: true (default).

🔁 Hybrid Mode (Local + Cloud)

Keep embeddings local.

For generation, call cloud only when needed:

Pass localOnly: false in /api/ask body, or

Keep localOnly: true but implement a confidence threshold fallback (already scaffolded with maxScore check).

Costs in hybrid mode are typically cents/month at small scale.

🔒 Security

Protect admin routes with x-admin-key and (optionally) IP allow-list at reverse proxy (Caddy/Nginx).

The docs/ folder is gitignored; mount it as a persistent volume in production.

🛠️ Deployment Notes

Server: Node 20+, behind Caddy/Nginx with HTTPS.

Persistence: ensure docs/ survives redeploys (bind mount / volume).

Systemd (optional): run npm run build && npm start under a service.

First run: expect model download for @xenova/transformers on first embedding call.

🧪 Troubleshooting

No markdown found: provide a manifest at ${DOCS_BASE_URL}/index.json listing .md URLs.

Slow first reindex: model download is one-time; subsequent runs are fast.

Answers hallucinate: reduce k (e.g., 4), tighten the system prompt, ensure chunking respects headings.

Local LLM too slow: try a smaller model (e.g., mistral:7b) or enable hybrid mode.

📏 Sizing (why local is enough)
For ~20 A4 pages (~12–16k tokens), after chunking you’ll have 20–40 chunks.
Local search is instant, index size is only a few hundred KB, and you don’t need a vector DB.

✅ What the Agent Should Do

Create files exactly as in this README.

Install dependencies and set up .env.local.

Implement endpoints and libs verbatim.

Start dev server and verify:

POST /api/admin/sync downloads .md

POST /api/admin/reindex produces docs/index.json

POST /api/ask returns concise answers with citations

Done. Paste this README into Cursor, let the Agent scaffold the project, add your DOCS_BASE_URL, run sync → reindex → ask, and you’ve got a local, low-cost docs chatbot.
