import { NextRequest, NextResponse } from "next/server";
import { ingestAllHelpData } from "@/lib/ingest";
import { syncAllDocs } from "@/lib/sync";
import { resetIndexCache } from "@/lib/search";

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const doSync = new URL(req.url).searchParams.get("sync") === "1";
    
    if (doSync) {
      console.log("Starting sync...");
      const syncResult = await syncAllDocs();
      console.log("Sync completed:", syncResult);
    }

    console.log("Starting ingestion...");
    const res = await ingestAllHelpData();
    console.log("Ingestion completed:", res);
    resetIndexCache();
    
    return NextResponse.json(res);
  } catch (error) {
    console.error("Reindex error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Reindex failed", message: errorMessage },
      { status: 500 }
    );
  }
}
