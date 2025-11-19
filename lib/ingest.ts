import fs from "fs/promises";
import path from "path";
import { splitTextToChunks } from "./md";
import { embedTexts } from "./localEmbeddings";
import { put } from "@vercel/blob";
import { helpItemToText, createChunkId, getDisplayName, HelpItem } from "./jsonApi";

// Use /tmp on Vercel (read-only filesystem except /tmp)
const DOCS_DIR = process.env.VERCEL_ENV 
  ? "/tmp/docs" 
  : (process.env.DOCS_DIR ?? "./docs");

/**
 * Zpracuje JSON data a vytvoří index pro daný typ (user/admin)
 */
export async function ingestHelpData(idType: 1 | 2 = 1) {
  const filename = idType === 1 ? "help-data-user.json" : "help-data-admin.json";
  const filePath = path.join(DOCS_DIR, filename);
  
  let data: HelpItem[];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      throw new Error("Invalid data format: expected array");
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { 
        ok: true, 
        files: 0, 
        chunks: 0, 
        indexPath: `No data file found: ${filename}. Please run sync first.`,
        idType 
      };
    }
    throw error;
  }

  if (data.length === 0) {
    return { 
      ok: true, 
      files: 0, 
      chunks: 0, 
      indexPath: `No data found in ${filename}.`,
      idType 
    };
  }

  const all: any[] = [];
  
  for (const item of data) {
    // Převést HelpItem na text
    const text = helpItemToText(item);
    if (!text.trim()) continue;
    
    // Rozdělit na chunky
    const chunks = splitTextToChunks(text);
    if (chunks.length === 0) continue;
    
    // Vytvořit embeddingy
    const vectors = await embedTexts(chunks);
    
    // Vytvořit display name pro citace
    const displayName = getDisplayName(item);
    
    // Přidat do indexu
    vectors.forEach((v, i) => {
      const chunkId = createChunkId(item, i);
      all.push({ 
        id: chunkId, 
        file: displayName, // Pro citace použijeme display name
        idx: i, 
        content: chunks[i], 
        vector: v,
        idType, // Uložit typ pro filtrování
        itemId: item.id, // Uložit ID položky pro referenci
      });
    });
  }

  const indexJson = JSON.stringify({ items: all }, null, 2);
  const indexFilename = idType === 1 ? "index-user.json" : "index-admin.json";

  // Use Vercel Blob in production, otherwise use local filesystem
  if (process.env.VERCEL_ENV) {
    await put(indexFilename, indexJson, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });
    return { 
      ok: true, 
      files: data.length, 
      chunks: all.length, 
      indexPath: `${indexFilename} (Vercel Blob)`,
      idType 
    };
  } else {
    const indexPath = path.join(DOCS_DIR, indexFilename);
    await fs.mkdir(DOCS_DIR, { recursive: true });
    await fs.writeFile(indexPath, indexJson, "utf8");
    return { 
      ok: true, 
      files: data.length, 
      chunks: all.length, 
      indexPath,
      idType 
    };
  }
}

/**
 * Zpracuje data pro oba typy (user i admin)
 */
export async function ingestAllHelpData() {
  const userResult = await ingestHelpData(1);
  const adminResult = await ingestHelpData(2);
  
  return {
    ok: true,
    user: userResult,
    admin: adminResult,
  };
}

// Pro zpětnou kompatibilitu - alias pro starý název
export const ingestAllMarkdown = ingestAllHelpData;
