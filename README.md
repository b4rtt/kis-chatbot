# Lokální chatbot nad dokumentací — Next.js + lokální embeddingy (+ volitelný lokální LLM)

Plně lokální chatbot nad dokumentací, který může běžet na vlastním notebooku nebo serveru. Umí stáhnout Markdown z veřejného HTTPS úložiště, vytvořit lokální embeddingy (bez Pinecone) a odpovídat pouze z vašeho obsahu. Pokud chcete, můžete generování provádět lokálním modelem přes Ollamu nebo levným cloudovým modelem.

## ✨ Funkce

- **HTTPS → lokální mirror**: `POST /api/admin/sync` stáhne `.md` soubory s využitím ETag/Last-Modified.
- **Lokální vektorový index**: `POST /api/admin/reindex` vytvoří embeddingy pomocí `@xenova/transformers` do `docs/index.json`.
- **RAG odpovědi**: `POST /api/ask` kombinuje vektorové vyhledávání s fallbackem na klíčová slova, generuje odpověď a přikládá citace.
- **Bez externí DB**: žádné Pinecone/Supabase, všechno žije v repozitáři.
- **Volitelný lokální LLM**: Ollama (`llama3.1:8b-instruct`) pro 100% offline režim.
- **Ochrana admin rout**: vše chráněno přes `x-admin-key`.
- **Vložitelný chat widget**: `/embed/widget.js` přidá FAB tlačítko a vloží chat v iframe (`/embed/panel`) na libovolný web.

## 🧰 Předpoklady

- Node.js 20+ a npm
- Pro lokální embeddingy není potřeba nic dalšího (model se stáhne při prvním běhu)
- Pro lokální LLM (volitelné): Ollama nainstalovaná a spuštěná

## 🚀 Rychlý start

```bash
# 1) Vytvoř projekt
npm create next@latest local-docs-chat --typescript --eslint
cd local-docs-chat

# 2) Nainstaluj závislosti
npm i @xenova/transformers openai

# 3) Vytvoř složky
mkdir -p docs app/api/admin lib

# 4) Přidej proměnné prostředí
cat > .env.local <<'ENV'
DOCS_BASE_URLS=https://docs.example.com,https://help.example.com # veřejné HTTPS kořeny (odděluj čárkou)
# DOCS_BASE_URL=https://docs.example.com # volitelné, pokud chceš zadat jen jeden zdroj
DOCS_DIR=./docs
ADMIN_KEY=super_secret_key

# Volitelné pro hybridní režim (generování v cloudu):
# OPENAI_API_KEY=sk-...

# Volitelné pro lokální LLM:
# OLLAMA_MODEL=llama3.1:8b-instruct
ENV
```

Vytvoř `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

Vytvoř `.gitignore`:

```
node_modules
.next
.env*
docs
```

## 📁 Struktura projektu

```
local-docs-chat/
├─ app/
│  ├─ page.tsx              # jednoduché UI
│  └─ api/
│     ├─ ask/route.ts       # RAG endpoint
│     └─ admin/
│        ├─ sync/route.ts   # HTTPS → ./docs mirror
│        └─ reindex/route.ts# embeddingy → ./docs/index.json
├─ lib/
│  ├─ crawler.ts            # vyhledání .md URL
│  ├─ sync.ts               # mirror s ETag/Last-Modified
│  ├─ md.ts                 # dělení markdownu na bloky
│  ├─ localEmbeddings.ts    # lokální embeddingy
│  ├─ ingest.ts             # stavba index.json
│  └─ search.ts             # kosinová podobnost/topK
├─ docs/                    # lokální mirror + index.json (gitignore)
├─ .env.local
├─ next.config.mjs
└─ package.json
```

## 🧱 Kód (zkopíruj do souborů)

### `lib/crawler.ts`

```ts
const RAW_BASES = process.env.DOCS_BASE_URLS ?? process.env.DOCS_BASE_URL ?? "";
const BASES = RAW_BASES.split(/[, \s]+/)
  .map((b) => b.trim())
  .filter(Boolean);
const MAX_PAGES = 200;

if (!BASES.length) {
  throw new Error(
    "Set DOCS_BASE_URL or DOCS_BASE_URLS with at least one HTTPS root."
  );
}

function abs(u: string, base: string) {
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

async function listFromManifest(base: string) {
  try {
    const r = await fetch(new URL("index.json", base));
    if (!r.ok) return [];
    const j = await r.json();
    const arr = Array.isArray(j) ? j : Array.isArray(j.urls) ? j.urls : [];
    return arr
      .map((u: string) => abs(u, base))
      .filter(Boolean)
      .filter((u: string) => u.endsWith(".md")) as string[];
  } catch {
    return [];
  }
}

async function crawlBase(base: string) {
  const seen = new Set<string>(),
    out = new Set<string>(),
    q = [base];
  while (q.length && seen.size < MAX_PAGES) {
    const u = q.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);

    let res: Response;
    try {
      res = await fetch(u, { redirect: "follow" });
    } catch {
      continue;
    }
    if (!res.ok) continue;

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/markdown") || u.endsWith(".md")) {
      out.add(u);
      continue;
    }
    if (!ct.includes("text/html")) continue;

    const html = await res.text();
    const links = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
    for (const l of links) {
      const u2 = abs(l, base);
      if (!u2 || !u2.startsWith(base)) continue;
      if (u2.endsWith(".md")) out.add(u2);
      else if (!u2.includes("#")) q.push(u2);
    }
  }
  return Array.from(out);
}

export async function listMarkdownUrls(): Promise<string[]> {
  const urls = new Set<string>();

  for (const base of BASES) {
    const manifest = await listFromManifest(base);
    if (manifest.length) {
      manifest.forEach((u) => urls.add(u));
      continue;
    }
    const crawled = await crawlBase(base);
    crawled.forEach((u) => urls.add(u));
  }

  if (!urls.size) {
    throw new Error(
      "No .md URLs found. Provide index.json manifests or check DOCS_BASE_URLS."
    );
  }

  return Array.from(urls);
}
```

### `lib/sync.ts`

```ts
import fs from "fs/promises";
import path from "path";
import { listMarkdownUrls } from "./crawler";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const CACHE_FILE = path.join(DOCS_DIR, ".cache.json");

type Cache = Record<string, { etag?: string; lastModified?: string }>;

async function readCache(): Promise<Cache> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
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
    else if (meta?.lastModified)
      headers["If-Modified-Since"] = meta.lastModified;

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
```

### `lib/md.ts`

```ts
export function splitMarkdownToChunks(md: string) {
  // Automaticky detekuje typ dokumentu
  const hasHeadings = /\n#{1,6}\s/.test(md);

  // Pro MD s headingy: větší chunky (800 tokenů), headingy dávají kontext
  // Pro prostý text: menší chunky (300 tokenů) pro lepší granularitu
  const maxTokens = hasHeadings ? 800 : 300;
  const overlap = hasHeadings ? 120 : 50;

  // Rozdělení podle typu dokumentu
  const sections = hasHeadings
    ? md.split(/\n(?=#{1,6}\s)/g) // podle headingů
    : md.split(/\n\s*\n/g); // podle odstavců

  const chunks: string[] = [];
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/);
    if (words.length <= maxTokens) {
      chunks.push(trimmed);
      continue;
    }

    // Delší sekce rozdělíme s překryvem
    for (let i = 0; i < words.length; i += Math.max(1, maxTokens - overlap)) {
      const part = words
        .slice(i, i + maxTokens)
        .join(" ")
        .trim();
      if (part) chunks.push(part);
    }
  }
  return chunks.filter((c) => c.length > 0);
}
```

### `lib/localEmbeddings.ts`

```ts
import { pipeline } from "@xenova/transformers";

const MODEL_ID = process.env.EMB_MODEL_ID || "Xenova/multilingual-e5-small"; // malý vícejazyčný model

let extractor: any;
async function getExtractor() {
  if (!extractor) extractor = await pipeline("feature-extraction", MODEL_ID);
  return extractor;
}

// mean pooling + normalizace => cosine = dot product
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await getExtractor();
  const out = await model(texts, { pooling: "mean", normalize: true });
  const arr = Array.isArray(out.data) ? out.data : Array.from(out.data);
  return Array.isArray(arr[0]) ? (arr as number[][]) : [arr as number[]];
}
```

### `lib/ingest.ts`

```ts
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
      all.push({
        id: `${rel}#${i}`,
        file: rel,
        idx: i,
        content: chunks[i],
        vector: v,
      });
    });
  }

  await fs.writeFile(
    INDEX_PATH,
    JSON.stringify({ items: all }, null, 2),
    "utf8"
  );
  return {
    ok: true,
    files: files.length,
    chunks: all.length,
    indexPath: INDEX_PATH,
  };
}
```

### `lib/search.ts`

```ts
import { head } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const INDEX_PATH = path.join(DOCS_DIR, "index.json");

export type IndexItem = {
  id: string;
  file: string;
  idx: number;
  content: string;
  vector: number[];
};
let _cache: { items: IndexItem[] } | null = null;

function normalizeText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export async function loadIndex() {
  if (_cache) return _cache;

  let raw: string;
  if (process.env.VERCEL_ENV) {
    const blob = await head("index.json", {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const response = await fetch(blob.url);
    if (!response.ok) {
      throw new Error(
        `Failed to download index.json from blob storage. Status: ${response.status}`
      );
    }
    raw = await response.text();
  } else {
    raw = await fs.readFile(INDEX_PATH, "utf8");
  }

  _cache = JSON.parse(raw);
  return _cache;
}

export function resetIndexCache() {
  _cache = null;
}

export function topK(qvec: number[], items: IndexItem[], k = 6) {
  const dot = (a: number[], b: number[]) =>
    a.reduce((s, x, i) => s + x * b[i], 0);
  return items
    .map((it) => ({ it, score: dot(qvec, it.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({ ...s.it, score: s.score }));
}

export function keywordSearch(query: string, items: IndexItem[], limit = 3) {
  const tokens = normalizeText(query)
    .split(/\s+/)
    .filter((tok) => tok.length > 2);
  if (!tokens.length) return [];

  return items
    .map((it) => {
      const text = normalizeText(`${it.file}\n${it.content}`);
      const hits = tokens.reduce(
        (count, token) => count + (text.includes(token) ? 1 : 0),
        0
      );
      const coverage = hits / tokens.length;
      return coverage > 0 ? { ...it, score: coverage } : null;
    })
    .filter((entry): entry is IndexItem & { score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

## 🌐 API trasy

### `app/api/admin/sync/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { syncDocs } from "@/lib/sync";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await syncDocs();
  return NextResponse.json(res);
}
```

### `app/api/admin/reindex/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { ingestAllMarkdown } from "@/lib/ingest";
import { syncDocs } from "@/lib/sync";
import { resetIndexCache } from "@/lib/search";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const doSync = new URL(req.url).searchParams.get("sync") === "1";
  if (doSync) await syncDocs();

  const res = await ingestAllMarkdown();
  resetIndexCache();
  return NextResponse.json(res);
}
```

### `app/api/ask/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { loadIndex, topK, keywordSearch } from "@/lib/search";
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
  if (!query) return NextResponse.json({ error: "Chybí dotaz" }, { status: 400 });

  const { embedTexts } = await import("@/lib/localEmbeddings");
  const [qvec] = await embedTexts([query]);

  const index = await loadIndex();
  const items = index?.items ?? [];
  const vectorPassages = topK(qvec, items, Number(k) || 6);
  const keywordPassages = keywordSearch(query, items, 3);
  const merged = [...vectorPassages];
  for (const candidate of keywordPassages) {
    if (!merged.find((p) => p.id === candidate.id)) merged.push(candidate);
  }
  const passages = merged.slice(0, Number(k) || 6);
  if (!passages.length) {
    return NextResponse.json({ answer: "Kontakt…", citations: [], cost: { ... } });
  }

  const context = passages.map((p,i)=>`[#${i+1}] ${p.file}\n---\n${p.content}`).join("\n\n");
  const sys = "Odpovídej pouze z kontextu…";
  const prompt = `${sys}\n\nQuestion: ${query}\n\nContext:\n${context}`;

  const maxScore = vectorPassages[0]?.score ?? 0;
  if (maxScore < 0.28 && !localOnly && process.env.OPENAI_API_KEY) {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

  const answer = localOnly
    ? await generateLocal(prompt)
    : (await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
      })).choices[0].message.content ?? "";

  return NextResponse.json({
    answer,
    citations: passages.map((p,i)=>({ id:i+1, file:p.file, idx:p.idx, score:p.score })),
  });
}
```

## 🖥️ UI s Markdown renderingem (`app/page.tsx`)

```tsx
"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Page() {
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<{ q: string; a: string; c: any[] }[]>([]);

  async function ask() {
    const r = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, localOnly: false }),
    });
    const data = await r.json();
    setMsgs((m) => [...m, { q, a: data.answer, c: data.citations }]);
    setQ("");
  }

  return (
    <main
      style={{ maxWidth: 800, margin: "40px auto", fontFamily: "system-ui" }}
    >
      <h1>Local Docs Chat</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask your docs..."
          style={{ flex: 1, padding: 10, border: "1px solid #ccc" }}
        />
        <button onClick={ask}>Ask</button>
      </div>
      <div style={{ marginTop: 24 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{ border: "1px solid #eee", padding: 12, margin: "12px 0" }}
          >
            <div>
              <strong>You:</strong> {m.q}
            </div>
            <div style={{ marginTop: 8 }}>
              <strong>Answer:</strong>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.a}</ReactMarkdown>
            </div>
            {m.c?.length ? (
              <div style={{ fontSize: 14, color: "#555", marginTop: 8 }}>
                Sources: {m.c.map((c: any) => `[#${c.id} ${c.file}]`).join(" ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
```

**Instalace závislostí pro markdown:**

```bash
npm install react-markdown remark-gfm
```

## ▶️ Spuštění

```bash
npm run dev
```

Synchronizace dokumentace:

```bash
curl -X POST -H "x-admin-key: $ADMIN_KEY" http://localhost:3000/api/admin/sync
```

Reindex (volitelně i se sync):

```bash
curl -X POST -H "x-admin-key: $ADMIN_KEY" "http://localhost:3000/api/admin/reindex?sync=1"
```

Po reindexaci se cache v paměti automaticky invaliduje, takže další dotazy hned čtou nový `index.json`.

Dotaz:

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{ "query": "How do I reset my password?" }'
```

## 🧱 Volitelně: Lokální LLM přes Ollamu

1. Nainstaluj Ollamu (macOS/Linux/Win): https://ollama.com
2. Stáhni model:
   ```bash
   ollama pull llama3.1:8b-instruct
   ```
3. Spusť server: `ollama serve`
4. V `.env.local` nastav `OLLAMA_MODEL=llama3.1:8b-instruct`

`/api/ask` použije Ollamu, pokud `localOnly: true` (výchozí).

## 🔁 Hybridní režim (lokálně + cloud)

- Embeddingy zůstávají lokální.
- Generování může spadnout do cloudu (levný model) jen když je potřeba.
- Pošli `localOnly: false` v těle `/api/ask`, případně využij prah hodnoty relevance (`maxScore`).
- Cena je na malém provozu v řádu centů za měsíc.

## 🔒 Bezpečnost

- Admin trasy chraň přes `x-admin-key` + ideálně IP whitelist v reverzní proxy (Caddy/Nginx).
- Složku `docs/` měj na perzistentním disku (je v `.gitignore`).

## 🛠️ Nasazení

- Server s Node 20+ za HTTPS proxy (Caddy/Nginx).
- Dbej na to, aby `docs/` přežila redeploy (volume/bind mount).
- Systemd (volitelné): `npm run build && npm start` pod službou.
- První běh embeddingu stáhne model `@xenova/transformers` (počítej s tím).

## 🧪 Odstraňování potíží

- **Žádné markdowny**: přidej manifest `<tvůj_koren>/index.json` pro každý z kořenů v `DOCS_BASE_URLS`.
- **První reindex je pomalý**: stahuje se model, pak už to běží rychle.
- **Halucinace**: sniž `k` (třeba na 4), zpřísni systémový prompt, kontroluj dělení na bloky.
- **Lokální LLM je pomalé**: zvol menší model (např. `mistral:7b`) nebo hybridní režim.

## 📏 Dimenzování

- ~20 stran A4 (~12–16k tokenů) → po rozdělení vyjde 20–40 chunků.
- Lokální hledání je okamžité, index má stovky kB, nepotřebuješ externí vektorovou DB.

## 🔄 Vylepšení a změny

### Vylepšené dělení textu (2024-11)

- ✅ **Adaptivní zpracování dokumentů**: Funkce `splitMarkdownToChunks` automaticky detekuje typ dokumentu:
  - **Markdown s headingy**: Větší chunky (800 tokenů), protože headingy poskytují strukturu a kontext
  - **Prostý text**: Menší chunky (300 tokenů) pro lepší granularitu, rozdělení podle odstavců
- ✅ **Univerzální kompatibilita**: Funguje s klasickými MD soubory i prostými textovými soubory bez formátování
- ✅ **Opravené embedování v batch**: Funkce `embedTexts` nyní správně zpracovává více textů najednou (dříve vrátila jen 1 vektor pro všechny texty)
- ✅ **Pomocný skript**: Přidán `scripts/reindex-docs.ts` pro snadnou reindexaci dokumentů

### Markdown rendering v UI (2024-11)

- ✅ **Automatické renderování markdownu**: Odpovědi se nyní zobrazují s formátováním namísto surového markdownu
- ✅ **Podpora pro**:
  - **Tučný text** a _kurzíva_
  - [Odkazy](https://example.com)
  - `Inline kód` a bloky kódu
  - Seznamy (odrážkové i číslované)
  - > Citace
  - Nadpisy (h1, h2, h3)
  - Tabulky (GitHub Flavored Markdown)
- ✅ **Pěkné styling**: Markdown elementy jsou stylované v souladu s designem UI (oranžové akcenty pro odkazy a tučný text)

## 🔌 Vložení widgetu na jiné weby

Chat můžeš nově vložit jako plovoucí FAB tlačítko s rozbalovacím panelem:

```html
<script
  src="https://tvoje-domena.cz/embed/widget.js"
  data-title="Pomoc s dokumentací"
  data-subtitle="Chat, který čerpá jen z našich zdrojů"
  data-color="#ff6200"
  data-label="Zeptej se"
  async
></script>
```

- Skript vytvoří kruhové tlačítko v pravém (nebo levém) dolním rohu, které otevře iframe s aplikací na adrese `/embed/panel`.
- Vše běží na stejné doméně, takže není potřeba řešit CORS ani další backend změny.
- Panel je responzivní (max šířka/výška podle viewportu) a zachovává stejné funkce jako hlavní UI, včetně citací a markdown renderingu.

### Dostupné atributy

- `data-title` / `data-subtitle` – texty v záhlaví panelu.
- `data-color` – primární barva (dotkne se FAB tlačítka i widgetu, zároveň se propíše do query parametru `accent`).
- `data-label` – text ve FAB tlačítku, `data-icon` pro emoji/znak vedle textu.
- `data-position` – `"left"` nebo `"right"` (výchozí).
- `data-width` / `data-height` – rozměr panelu (např. `data-width="420px"`).
- `data-offset`, případně `data-offset-x` a `data-offset-y` – odsazení od okrajů stránky.
- `data-panel-url` – pokud chceš načíst jinou adresu (např. proxy nebo jinou jazykovou mutaci). Musí jít o URL hostované na stejné doméně kvůli přístupu na API.

Chceš-li widget vložit ručně do vlastní komponenty, můžeš použít rovnou iframe:

```html
<iframe
  src="https://tvoje-domena.cz/embed/panel?accent=%23ff6200&title=Support%20Bot"
  width="360"
  height="520"
  style="border:0;border-radius:20px;box-shadow:0 30px 60px rgba(5,6,8,0.45)"
></iframe>
```

Interakce můžeš ovládat vlastním kódem:

- `window.postMessage({ type: "esports-chat-open" }, "*")` — otevře panel.
- `window.postMessage({ type: "esports-chat-close" }, "*")` — zavře panel.
- `window.postMessage({ type: "esports-chat-toggle" }, "*")` — přepne stav.
- Nebo přímo `window.esportsChatWidget?.open()/close()/toggle()`.

### Jak reindexovat dokumenty

```bash
# Pomocí skriptu (doporučeno)
npx tsx scripts/reindex-docs.ts

# Nebo pomocí API
curl -X POST -H "x-admin-key: $ADMIN_KEY" "http://localhost:3000/api/admin/reindex"
```

## ✅ Co má agent udělat

- Vytvořit soubory podle README.
- Nainstalovat závislosti a nastavit `.env.local`.
- Implementovat endpointy a knihovny.
- Spustit dev server a ověřit:
  - `POST /api/admin/sync` stahuje `.md` soubory
  - `POST /api/admin/reindex` vytváří `docs/index.json`
  - `POST /api/ask` vrací stručné odpovědi s citacemi

Hotovo. Zkopíruj tento README do Cursoru, nech Agenta projekt vystavět, doplň `DOCS_BASE_URLS` (nebo `DOCS_BASE_URL`), spusť sync → reindex → otázka a máš lokální, levný chatbot nad dokumentací.
