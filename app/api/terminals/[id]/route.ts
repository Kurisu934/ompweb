import { NextResponse } from "next/server";
import { parseJsonWithinLimit } from "@/lib/bounded-form-data";
import { terminalErrorResponse } from "@/lib/terminal-api";
import { closeTerminal, MAX_INPUT_CHARS, resizeTerminal, TerminalError, writeTerminal } from "@/lib/terminal-manager";
import { isRecord } from "@/lib/type-guards";

export const dynamic = "force-dynamic";

// POST /api/terminals/[id]  { input: string } | { cols: number, rows: number }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // UTF-8 can take up to 4 bytes per char, plus JSON escaping.
    const body = await parseJsonWithinLimit<unknown>(req, MAX_INPUT_CHARS * 6 + 1024);
    if (!isRecord(body)) throw new TerminalError("Invalid request body", "invalid_body");
    if (typeof body.input === "string") {
      if (body.input.length > MAX_INPUT_CHARS) throw new TerminalError("Input is too large", "input_too_large", 413);
      writeTerminal(id, body.input);
    } else if (typeof body.cols === "number" && typeof body.rows === "number") {
      resizeTerminal(id, body.cols, body.rows);
    } else {
      throw new TerminalError("Expected input or cols and rows", "invalid_body");
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return terminalErrorResponse(error);
  }
}

// DELETE /api/terminals/[id] — kill the shell and close the terminal.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    closeTerminal(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return terminalErrorResponse(error);
  }
}
