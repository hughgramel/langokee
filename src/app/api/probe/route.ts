/**
 * POST /api/probe
 *
 * Body: { url: string }
 *
 * Runs `yt-dlp -J` against the URL without downloading, surfaces the
 * track-picker-relevant fields (video heights, audio languages, subtitle
 * languages). Used by UploadModal to let the user choose audio dub /
 * resolution / subtitle scope before kicking off the real ingest.
 */
import { NextResponse } from "next/server";
import { extractVideoId } from "@/lib/youtube-id";
import { probeVideo } from "@/lib/ytdlp";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });
  if (!extractVideoId(url)) {
    return NextResponse.json({ error: "not a YouTube URL" }, { status: 400 });
  }
  try {
    const probe = await probeVideo(url);
    return NextResponse.json(probe);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
