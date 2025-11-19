import { head } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

const DOCS_DIR = process.env.VERCEL_ENV 
  ? "/tmp/docs" 
  : (process.env.DOCS_DIR ?? "./docs");

export type IndexItem = { 
  id: string; 
  file: string; 
  idx: number; 
  content: string; 
  vector: number[];
  idType?: 1 | 2; // 1 = user, 2 = admin
  itemId?: number;
};

type IndexCache = { items: IndexItem[] };
const _cache: Record<string, IndexCache | null> = {
  user: null,
  admin: null,
};

function normalizeText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Načte index pro daný typ (user/admin)
 */
export async function loadIndex(idType: 1 | 2 = 1) {
  const cacheKey = idType === 1 ? "user" : "admin";
  
  if (_cache[cacheKey]) return _cache[cacheKey]!;

  const indexFilename = idType === 1 ? "index-user.json" : "index-admin.json";
  let raw: string;
  
  // Use Vercel Blob in production, otherwise use local filesystem
  if (process.env.VERCEL_ENV) {
    try {
      const blob = await head(indexFilename, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const response = await fetch(blob.url);
      if (!response.ok) {
        throw new Error(`Failed to download ${indexFilename} from blob storage. Status: ${response.status}`);
      }
      raw = await response.text();
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.includes('not found')) {
        throw new Error(`${indexFilename} not found in Vercel Blob storage. Please run the reindexing process.`);
      }
      throw error;
    }
  } else {
    const indexPath = path.join(DOCS_DIR, indexFilename);
    try {
      raw = await fs.readFile(indexPath, "utf8");
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`${indexFilename} not found. Please run sync and reindex first. Path: ${indexPath}`);
      }
      throw error;
    }
  }

  const parsed = JSON.parse(raw) as IndexCache;
  _cache[cacheKey] = parsed;
  return parsed;
}

export function resetIndexCache() {
  _cache.user = null;
  _cache.admin = null;
}

export function topK(qvec: number[], items: IndexItem[], k = 6) {
  const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  return items
    .map(it => ({ it, score: dot(qvec, it.vector) }))
    .sort((a,b)=>b.score - a.score)
    .slice(0, k)
    .map(s => ({ ...s.it, score: s.score }));
}

export function keywordSearch(query: string, items: IndexItem[], limit = 3) {
  const baseTokens = normalizeText(query)
    .split(/\s+/)
    .filter((tok) => tok.length > 2);
  if (!baseTokens.length) return [];

  return items
    .map((it) => {
      const text = normalizeText(`${it.file}\n${it.content}`);
      const hits = baseTokens.reduce(
        (count, token) => count + (text.includes(token) ? 1 : 0),
        0
      );
      const coverage = hits / baseTokens.length;
      return coverage > 0 ? { ...it, score: coverage } : null;
    })
    .filter((entry): entry is IndexItem & { score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
