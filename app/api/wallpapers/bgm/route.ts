import { listBgm } from "@/lib/wallpaper-bgm-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ tracks: await listBgm() }); }
