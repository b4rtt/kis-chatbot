import { NextRequest, NextResponse } from "next/server";
import { ingestAllMarkdown } from "@/lib/ingest";
import { syncDocs } from "@/lib/sync";

export async function POST(req: NextRequest) {
if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY)
return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const doSync = new URL(req.url).searchParams.get("sync") === "1";
if (doSync) await syncDocs();

const res = await ingestAllMarkdown();
return NextResponse.json(res);
}
