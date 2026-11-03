import { NextRequest } from "next/server";
import { guardApiRequest } from "@/lib/api-request-guard";
import { browserScene } from "@/lib/wallpaper-browser-scene";
import { sceneAssetResponse } from "@/lib/wallpaper-scene-assets";
import type { SceneFont, SceneTexture, SceneSound } from "@/lib/wallpaper-scene-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; asset: string }> }) {
  const denied = guardApiRequest(request);
  if (denied) return denied;
  try {
    const { id, asset } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(asset)) return new Response(null, { status: 404 });
    for (const validate of [false, true]) {
      const scene = await browserScene(id, validate), data = scene.assets.get(asset);
      if (!data) return new Response(null, { status: 404 });
      const audioType = scene.manifest.sounds?.flatMap((sound: SceneSound) => sound.files).find((file: SceneSound["files"][number]) => file.key === asset)?.mimeType;
      try { return await sceneAssetResponse(request, data, audioType || scene.manifest.fonts?.find((f: SceneFont) => f.key === asset)?.mimeType || scene.manifest.textures.find((t: SceneTexture) => t.key === asset)?.mimeType || "image/png"); }
      catch (error) { if (validate) throw error; }
    }
    return new Response(null, { status: 404 });
  } catch { return new Response(null, { status: 404 }); }
}
