import { NextResponse } from "next/server";
import { isRecord } from "@/lib/type-guards";
import { loadWebServerSettings, MAX_FAVORITE_DIRECTORIES, parseFavoriteDirectories, saveWebServerSettings } from "@/lib/web-settings";

export const dynamic = "force-dynamic";

// GET /api/favorite-directories - the directory picker's saved shortcuts.
export async function GET() {
  return NextResponse.json({ directories: loadWebServerSettings().favoriteDirectories });
}

// PUT { directories: string[] } - replace the whole list (order kept).
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body", code: "invalid_json" }, { status: 400 });
  }
  const directories = parseFavoriteDirectories(isRecord(body) ? body.directories : undefined);
  if (!directories) {
    return NextResponse.json(
      { error: `directories must be a list of at most ${MAX_FAVORITE_DIRECTORIES} paths`, code: "invalid_directories" },
      { status: 400 },
    );
  }
  saveWebServerSettings({ favoriteDirectories: directories });
  return NextResponse.json({ directories });
}
