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
