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
