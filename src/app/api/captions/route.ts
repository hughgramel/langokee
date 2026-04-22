/**
 * GET /api/captions?videoId=...&language=...
 *
 * Returns the manually-uploaded caption track for this video in the
 * requested language, parsed from VTT to plain text. The upload modal
 * calls this so users don't have to re-type lyrics the uploader already
 * supplied — and the returned text flows straight into /api/align.
 *
 * Manual captions only. YouTube's auto-generated captions are ASR under
 * the hood and have the same accuracy problems that made us avoid ASR
 * in the first place; we don't silently fall back to them.
 *
 * 404 is the expected response for videos with no manual track — the UI
 * treats it as "no captions available" rather than an error.
 */
import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { findManualSubtitle } from "@/lib/ytdlp";
import { vttToText } from "@/lib/vtt";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim();
  const language = req.nextUrl.searchParams.get("language")?.trim();
  if (!videoId || !language) {
    return NextResponse.json({ error: "missing videoId or language" }, { status: 400 });
  }

  const vttPath = await findManualSubtitle(videoId, language);
  if (!vttPath) {
    return NextResponse.json({ error: "no manual captions" }, { status: 404 });
  }

  const vtt = await fs.readFile(vttPath, "utf8");
  const text = vttToText(vtt);
  if (!text.trim()) {
    return NextResponse.json({ error: "caption track is empty" }, { status: 404 });
  }

  return NextResponse.json({ text, kind: "manual" as const });
}
