import fs from "fs/promises";
import path from "path";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const INDEX_PATH = path.join(DOCS_DIR, "index.json");

export type IndexItem = { id: string; file: string; idx: number; content: string; vector: number[] };
let _cache: { items: IndexItem[] } | null = null;

export async function loadIndex() {
if (_cache) return _cache;
const raw = await fs.readFile(INDEX_PATH, "utf8");
_cache = JSON.parse(raw);
return _cache;
}

export function topK(qvec: number[], items: IndexItem[], k = 6) {
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
return items
.map(it => ({ it, score: dot(qvec, it.vector) }))
.sort((a,b)=>b.score - a.score)
.slice(0, k)
.map(s => ({ ...s.it, score: s.score }));
}
