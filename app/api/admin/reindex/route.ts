import { NextRequest, NextResponse } from "next/server";
import { ingestAllMarkdown } from "@/lib/ingest";
import { syncDocs } from "@/lib/sync";

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const doSync = new URL(req.url).searchParams.get("sync") === "1";
    
    if (doSync) {
      console.log("Starting sync...");
      const syncResult = await syncDocs();
      console.log("Sync completed:", syncResult);
    }

    console.log("Starting ingestion...");
    const res = await ingestAllMarkdown();
    console.log("Ingestion completed:", res);
    
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
