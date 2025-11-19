// Types for JSON API response
export type HelpItem = {
  id: number;
  id_order: number;
  id_type: 1 | 2; // 1 = user, 2 = admin
  module: {
    id: number | null;
    id_text: string;
    url: string;
    name: string;
  };
  data: Array<{
    id_lang: string;
    header: {
      name: string;
      description: string;
    };
    items: Array<{
      id_order: number;
      header: string;
      description: string;
    }> | null;
  }>;
};

const API_BASE_URL = "https://new-test-clen.esports.cz/api/help/list-local";
// Token lze nastavit přes HELP_API_TOKEN v .env.local, výchozí hodnota je z příkladu
const API_TOKEN = process.env.HELP_API_TOKEN || "$1$o7qkoaCQ$g1n1yA7PGHdZj6zvjiPOr.";

/**
 * Načte data z JSON API endpointu
 * @param idType 1 = user, 2 = admin
 * @returns Pole HelpItem objektů
 */
export async function fetchHelpData(idType: 1 | 2 = 1): Promise<HelpItem[]> {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("id_type", String(idType));
  url.searchParams.set("id_language", "cs");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch help data: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Převede HelpItem na strukturovaný text pro embeddings
 * @param item HelpItem objekt
 * @returns Textový obsah pro embedding
 */
export function helpItemToText(item: HelpItem): string {
  const parts: string[] = [];

  // Modul informace
  if (item.module.name) {
    parts.push(`Modul: ${item.module.name}`);
    if (item.module.url) {
      parts.push(`URL: ${item.module.url}`);
    }
  }

  // Pro každý jazyk v data
  for (const langData of item.data) {
    if (langData.id_lang === "cs") {
      // Header
      if (langData.header.name) {
        parts.push(`\n## ${langData.header.name}`);
      }

      // Description z headeru
      if (langData.header.description) {
        const descText = stripHtml(langData.header.description);
        if (descText.trim()) {
          parts.push(descText);
        }
      }

      // Items (FAQ otázky a odpovědi)
      if (langData.items && langData.items.length > 0) {
        for (const itemEntry of langData.items) {
          if (itemEntry.header) {
            parts.push(`\n### ${itemEntry.header}`);
          }
          if (itemEntry.description) {
            const descText = stripHtml(itemEntry.description);
            if (descText.trim()) {
              parts.push(descText);
            }
          }
        }
      }
    }
  }

  return parts.join("\n\n").trim();
}

/**
 * Odstraní HTML tagy z textu a převede na čistý text
 */
function stripHtml(html: string): string {
  if (!html) return "";

  // Základní odstranění HTML tagů
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Odstranit script tagy
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Odstranit style tagy
    .replace(/<[^>]+>/g, " ") // Odstranit všechny HTML tagy
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, "") // Odstranit další HTML entity
    .replace(/\s+/g, " ") // Normalizovat mezery
    .trim();

  // Zachovat strukturu z listů a odstavců
  text = text
    .replace(/\n\s*\n/g, "\n\n") // Zachovat dvojité odřádkování
    .trim();

  return text;
}

/**
 * Vytvoří identifikátor pro chunk (pro citace)
 * @param item HelpItem objekt
 * @param chunkIndex Index chunku
 * @returns Identifikátor ve formátu "module_name#chunk_index"
 */
export function createChunkId(item: HelpItem, chunkIndex: number): string {
  const moduleName = item.module.name || item.module.url || `item_${item.id}`;
  const safeName = moduleName.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${safeName}#${chunkIndex}`;
}

/**
 * Vytvoří zobrazitelný název pro citaci
 * @param item HelpItem objekt
 * @returns Název pro zobrazení v citacích
 */
export function getDisplayName(item: HelpItem): string {
  if (item.module.name) {
    return item.module.name;
  }
  if (item.module.url) {
    return item.module.url;
  }
  const firstData = item.data.find((d) => d.id_lang === "cs");
  if (firstData?.header.name) {
    return firstData.header.name;
  }
  return `Položka ${item.id}`;
}

