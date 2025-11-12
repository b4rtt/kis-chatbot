import { list } from "@vercel/blob";

export type IndexItem = { id: string; file: string; idx: number; content: string; vector: number[] };
let _cache: { items: IndexItem[] } | null = null;

export async function loadIndex() {
  if (_cache) return _cache;

  const blob = await list({
    prefix: "index.json",
    limit: 1,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  if (blob.blobs.length === 0) {
    throw new Error("index.json not found in Vercel Blob storage. Please run the reindexing process.");
  }

  const indexUrl = blob.blobs[0].url;
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`Failed to download index.json from blob storage. Status: ${response.status}`);
  }

  const raw = await response.text();
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
