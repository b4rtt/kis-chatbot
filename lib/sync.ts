import fs from "fs/promises";
import path from "path";
import { fetchHelpData, HelpItem } from "./jsonApi";

// Use /tmp on Vercel (read-only filesystem except /tmp)
const DOCS_DIR = process.env.VERCEL_ENV 
  ? "/tmp/docs" 
  : (process.env.DOCS_DIR ?? "./docs");
const DATA_FILE = path.join(DOCS_DIR, "help-data.json");

type Cache = {
  user?: { lastSync?: string };
  admin?: { lastSync?: string };
};

async function readCache(): Promise<Cache> {
  const cacheFile = path.join(DOCS_DIR, ".cache.json");
  try { 
    return JSON.parse(await fs.readFile(cacheFile, "utf8")); 
  } catch { 
    return {}; 
  }
}

async function writeCache(c: Cache) {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  const cacheFile = path.join(DOCS_DIR, ".cache.json");
  await fs.writeFile(cacheFile, JSON.stringify(c, null, 2), "utf8");
}

/**
 * Synchronizuje data z JSON API pro daný typ (user/admin)
 */
export async function syncDocs(idType: 1 | 2 = 1) {
  const cache = await readCache();
  const cacheKey = idType === 1 ? "user" : "admin";
  
  try {
    const data = await fetchHelpData(idType);
    
    // Uložit data do souboru
    await fs.mkdir(DOCS_DIR, { recursive: true });
    const filename = idType === 1 ? "help-data-user.json" : "help-data-admin.json";
    const filePath = path.join(DOCS_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    
    // Aktualizovat cache
    cache[cacheKey] = { lastSync: new Date().toISOString() };
    await writeCache(cache);
    
    return { 
      ok: true, 
      downloaded: data.length, 
      changedPaths: [filePath],
      idType 
    };
  } catch (error) {
    console.error(`Sync failed for id_type=${idType}:`, error);
    throw error;
  }
}

/**
 * Synchronizuje data pro oba typy (user i admin)
 */
export async function syncAllDocs() {
  const userResult = await syncDocs(1);
  const adminResult = await syncDocs(2);
  
  return {
    ok: true,
    user: userResult,
    admin: adminResult,
  };
}
