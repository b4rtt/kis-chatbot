#!/usr/bin/env tsx
/**
 * Reindexace dokumentů
 * 
 * Tento skript načte všechny .md soubory z adresáře docs/,
 * rozdělí je na menší části (chunks), vytvoří embeddingy
 * a uloží index pro vyhledávání.
 * 
 * Spuštění: npx tsx scripts/reindex-docs.ts
 */

import { ingestAllMarkdown } from "../lib/ingest";
import { resetIndexCache } from "../lib/search";

async function main() {
  console.log("🚀 Spouštím reindexaci dokumentů...\n");
  
  try {
    const startTime = Date.now();
    
    const result = await ingestAllMarkdown();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log("\n✅ Reindexace dokončena!");
    console.log(`   Soubory: ${result.files}`);
    console.log(`   Chunky: ${result.chunks}`);
    console.log(`   Index: ${result.indexPath}`);
    console.log(`   Čas: ${duration}s`);
    
    resetIndexCache();
    console.log("\n🔄 Cache resetována.");
    
  } catch (error) {
    console.error("\n❌ Chyba při reindexaci:", error);
    process.exit(1);
  }
}

main();

