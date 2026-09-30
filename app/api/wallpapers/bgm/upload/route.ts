import type { NextRequest } from "next/server";
import { guardApiRequest } from "@/lib/api-request-guard";
import { BgmError, importBgm } from "@/lib/wallpaper-bgm-store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const denied = guardApiRequest(request);
  if (denied) return denied;
  try { return Response.json(await importBgm(request, new URL(request.url).searchParams.get("name") || "")); }
  catch (error) {
    return Response.json({ error: error instanceof BgmError ? error.message : "BGM import failed", code: error instanceof BgmError ? error.code : "import_failed" }, { status: error instanceof BgmError ? error.status : 400 });
  }
}
