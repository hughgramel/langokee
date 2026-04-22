/**
 * POST /api/captions
 *
 * Body: { url?, videoId, language, kind?: "manual" | "auto" }
 *
 * Returns the caption track for `videoId` in `language`, parsed from VTT to
 * plain text. When the VTT isn't already on disk and a `url` is supplied,
 * yt-dlp is invoked with `--skip-download` to fetch just the subtitle track
 * — much faster than the full ingest and lets the textarea populate right
 * after probe finishes.
 *
 * `language` is the exact yt-dlp lang code from probe (e.g. "en",
 * "zh-Hans"). Pass `kind: "auto"` when the user picked a YouTube ASR track
 * (we don't silently fall back from manual → auto; auto is only fetched on
 * explicit request).
 *
 * 404 is the expected response when neither a cached VTT nor a download
 * exists — the UI treats it as "no captions available" rather than error.
 */
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { downloadSubtitleOnly } from "@/lib/ytdlp";
import { mediaDir } from "@/lib/paths";
import { vttToText } from "@/lib/vtt";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

type Body = {
  url?: string;
  videoId?: string;
  language?: string;
  kind?: "manual" | "auto";
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const videoId = body.videoId?.trim();
  const language = body.language?.trim();
  if (!videoId || !language) {
    return NextResponse.json(
      { error: "missing videoId or language" },
      { status: 400 },
    );
  }
  const kind = body.kind === "auto" ? "auto" : "manual";

  const dir = mediaDir(videoId);
  const vttPath = path.join(dir, `video.${language}.vtt`);

  try {
    let have = await fileExists(vttPath);
    if (!have && body.url) {
      // Subtitle-only yt-dlp run — fast, writes VTT + info.json in place.
      await downloadSubtitleOnly(body.url, videoId, language, {
        auto: kind === "auto",
      });
      have = await fileExists(vttPath);
    }
    if (!have) {
      return NextResponse.json(
        { error: "no caption track on disk" },
        { status: 404 },
      );
    }

    const vtt = await fs.readFile(vttPath, "utf8");
    const text = vttToText(vtt);
    if (!text.trim()) {
      return NextResponse.json(
        { error: "caption track is empty" },
        { status: 404 },
      );
    }
    return NextResponse.json({ text, kind, language });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
