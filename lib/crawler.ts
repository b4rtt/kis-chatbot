const RAW_BASES = process.env.DOCS_BASE_URLS ?? process.env.DOCS_BASE_URL ?? "";
const BASES = RAW_BASES.split(/[, \s]+/).map((b) => b.trim()).filter(Boolean);
const MAX_PAGES = 200;

if (!BASES.length) {
  throw new Error("Set DOCS_BASE_URL or DOCS_BASE_URLS with at least one HTTPS root.");
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
  const seen = new Set<string>();
  const out = new Set<string>();
  const q = [base];

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
    throw new Error("No .md URLs found. Provide index.json manifests or check DOCS_BASE_URLS.");
  }

  return Array.from(urls);
}
