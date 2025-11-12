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
