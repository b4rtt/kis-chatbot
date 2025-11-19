#!/usr/bin/env tsx
/**
 * Reindexace dokumentů
 * 
 * Tento skript načte JSON data z API, zpracuje je,
 * vytvoří embeddingy a uloží indexy pro vyhledávání
 * (separátně pro user a admin režimy).
 * 
 * Spuštění: npx tsx scripts/reindex-docs.ts
 */

import { ingestAllHelpData } from "../lib/ingest";
import { resetIndexCache } from "../lib/search";

async function main() {
  console.log("🚀 Spouštím reindexaci dokumentů...\n");
  
  try {
    const startTime = Date.now();
    
    const result = await ingestAllHelpData();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log("\n✅ Reindexace dokončena!");
    
    if (result.user) {
      console.log("\n📋 User režim:");
      console.log(`   Soubory: ${result.user.files}`);
      console.log(`   Chunky: ${result.user.chunks}`);
      console.log(`   Index: ${result.user.indexPath}`);
    }
    
    if (result.admin) {
      console.log("\n👑 Admin režim:");
      console.log(`   Soubory: ${result.admin.files}`);
      console.log(`   Chunky: ${result.admin.chunks}`);
      console.log(`   Index: ${result.admin.indexPath}`);
    }
    
    console.log(`\n⏱️  Celkový čas: ${duration}s`);
    
    resetIndexCache();
    console.log("\n🔄 Cache resetována.");
    
  } catch (error) {
    console.error("\n❌ Chyba při reindexaci:", error);
    process.exit(1);
  }
}

main();

