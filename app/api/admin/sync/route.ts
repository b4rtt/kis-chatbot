import { NextRequest, NextResponse } from "next/server";
import { syncDocs } from "@/lib/sync";

export async function POST(req: NextRequest) {
if (req.headers.get("x-admin-key") !== process.env.ADMIN_KEY)
return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const res = await syncDocs();
return NextResponse.json(res);
}
