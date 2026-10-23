import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-utils";
import { stat } from "fs/promises";
import {
  createDirectory,
  getBrowseStartDirectory,
  getParentDirectory,
  isValidNewDirectoryName,
  listDirectories,
  listWindowsDrives,
  resolveDirectory,
  shouldShowWindowsDrivePicker,
} from "@/lib/directory-browser";

// GET /api/cwd/browse?path=... — lists readable subdirectories in the filesystem.
export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get("path")?.trim();
    if (shouldShowWindowsDrivePicker(requested)) {
      return NextResponse.json({ path: "", parentPath: null, drives: await listWindowsDrives(), directories: [] });
    }
    const candidate = getBrowseStartDirectory(requested);

    let resolved: string;
    try {
      resolved = await resolveDirectory(candidate);
    } catch {
      return NextResponse.json({ error: "Directory does not exist", code: "directory_not_found" }, { status: 404 });
    }


    const directoryStat = await stat(resolved);
    if (!directoryStat.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory", code: "not_a_directory" }, { status: 400 });
    }

    const directories = await listDirectories(resolved);

    return NextResponse.json({
      path: resolved,
      parentPath: getParentDirectory(resolved),
      directories,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// POST /api/cwd/browse  body: { parent: string, name: string } — creates one
// subdirectory inside a browsed directory and returns its path.
export async function POST(request: Request) {
  try {
    const body = await request.json() as { parent?: unknown; name?: unknown };
    const parent = typeof body.parent === "string" ? body.parent.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!parent) {
      return NextResponse.json({ error: "Path is required", code: "path_required" }, { status: 400 });
    }
    if (!isValidNewDirectoryName(name)) {
      return NextResponse.json({ error: "Invalid folder name", code: "invalid_folder_name" }, { status: 400 });
    }

    let resolvedParent: string;
    try {
      resolvedParent = await resolveDirectory(parent);
    } catch {
      return NextResponse.json({ error: "Directory does not exist", code: "directory_not_found" }, { status: 404 });
    }
    if (!(await stat(resolvedParent)).isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory", code: "not_a_directory" }, { status: 400 });
    }

    try {
      return NextResponse.json({ path: await createDirectory(resolvedParent, name) });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        return NextResponse.json({ error: "A file or folder with this name already exists", code: "folder_exists" }, { status: 409 });
      }
      if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
        return NextResponse.json({ error: "Access denied", code: "access_denied" }, { status: 403 });
      }
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
