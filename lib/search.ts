import { get } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

const DOCS_DIR = process.env.DOCS_DIR ?? "./docs";
const INDEX_PATH = path.join(DOCS_DIR, "index.json");

export type IndexItem = { id: string; file: string; idx: number; content: string; vector: number[] };
let _cache: { items: IndexItem[] } | null = null;

export async function loadIndex() {
  if (_cache) return _cache;

  let raw: string;
  // Use Vercel Blob in production, otherwise use local filesystem
  if (process.env.VERCEL_ENV) {
    try {
      const blob = await get("index.json", {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const response = await fetch(blob.url);
      if (!response.ok) {
        throw new Error(`Failed to download index.json from blob storage. Status: ${response.status}`);
      }
      raw = await response.text();
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.includes('not found')) {
        throw new Error("index.json not found in Vercel Blob storage. Please run the reindexing process.");
      }
      throw error;
    }
  } else {
    raw = await fs.readFile(INDEX_PATH, "utf8");
  }

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
