import fs from "fs/promises";
import path from "path";
import { splitMarkdownToChunks } from "./md";
import { embedTexts } from "./localEmbeddings";
import { put } from "@vercel/blob";

// Use /tmp on Vercel (read-only filesystem except /tmp)
const DOCS_DIR = process.env.VERCEL_ENV 
  ? "/tmp/docs" 
  : (process.env.DOCS_DIR ?? "./docs");
const INDEX_PATH = path.join(DOCS_DIR, "index.json");

export async function ingestAllMarkdown() {
  const files: string[] = [];
  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.isFile() && e.name.endsWith(".md")) files.push(p);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        console.log(`Directory not found: ${dir}, skipping walk.`);
        return;
      }
      throw error;
    }
  }
  await walk(DOCS_DIR);

  if (files.length === 0) {
    return { ok: true, files: 0, chunks: 0, indexPath: "No files found to index." };
  }

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

  const indexJson = JSON.stringify({ items: all }, null, 2);

  // Use Vercel Blob in production, otherwise use local filesystem
  if (process.env.VERCEL_ENV) {
    await put("index.json", indexJson, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true, // Allow overwriting existing index.json when reindexing
    });
    return { ok: true, files: files.length, chunks: all.length, indexPath: "index.json (Vercel Blob)" };
  } else {
    await fs.mkdir(DOCS_DIR, { recursive: true });
    await fs.writeFile(INDEX_PATH, indexJson, "utf8");
    return { ok: true, files: files.length, chunks: all.length, indexPath: INDEX_PATH };
  }
}
