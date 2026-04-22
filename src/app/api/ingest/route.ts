/**
 * POST /api/ingest
 *
 * Body: { url: string }
 *
 * 1. Validate + extract the 11-char YouTube ID from the URL.
 * 2. Shell out to yt-dlp → `public/media/{videoId}/video.mp4` + info.json.
 * 3. Shell out to ffmpeg → `public/media/{videoId}/audio.mp3`.
 * 4. Return a `VideoMeta` describing where those files live (URLs are
 *    relative to the Next static root).
 */
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { extractVideoId } from "@/lib/youtube-id";
import { downloadVideo, type DownloadOptions } from "@/lib/ytdlp";
import { extractAudio } from "@/lib/ffmpeg";
import { mediaDir, mediaUrl } from "@/lib/paths";
import { apiErrorResponse } from "@/lib/api-error";
import type { VideoMeta } from "@/types/transcript";

// Force Node runtime — we spawn external binaries.
export const runtime = "nodejs";

type IngestBody = {
  url?: string;
  /** yt-dlp picker choices from /api/probe. All optional. */
  maxHeight?: number;
  audioLanguage?: string;
  subtitleLanguages?: string[];
};

export async function POST(req: Request) {
  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });
  const dlOpts: DownloadOptions = {
    maxHeight: body.maxHeight,
    audioLanguage: body.audioLanguage,
    subtitleLanguages: body.subtitleLanguages,
  };

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "could not extract YouTube video id" }, { status: 400 });
  }

  // If we've already downloaded this video, skip straight to the metadata
  // read — no need to re-fetch or re-extract. Callers re-running the flow
  // will still get a fresh transcript because /api/align is separate.
  const dir = mediaDir(videoId);
  const videoPath = path.join(dir, "video.mp4");
  const audioPath = path.join(dir, "audio.mp3");
  const infoPath = path.join(dir, "video.info.json");
  const haveVideo = await fileExists(videoPath);
  const haveAudio = await fileExists(audioPath);
  const haveInfo = await fileExists(infoPath);

  try {
    if (!haveVideo || !haveInfo) {
      await downloadVideo(url, videoId, dlOpts);
    }
    if (!haveAudio) {
      await extractAudio(videoId);
    }
  } catch (err) {
    return apiErrorResponse(err);
  }

  const infoRaw = await fs.readFile(infoPath, "utf8");
  const info = JSON.parse(infoRaw) as {
    title: string;
    uploader?: string;
    duration: number;
    thumbnail?: string;
    subtitles?: Record<string, unknown>;
    automatic_captions?: Record<string, unknown>;
  };

  const meta: VideoMeta = {
    videoId,
    title: info.title,
    channel: info.uploader,
    duration: info.duration,
    audioUrl: mediaUrl(videoId, "audio.mp3"),
    videoUrl: mediaUrl(videoId, "video.mp4"),
    thumbnail: info.thumbnail,
    subtitleLanguages: info.subtitles ? Object.keys(info.subtitles) : [],
    autoCaptionLanguages: info.automatic_captions ? Object.keys(info.automatic_captions) : [],
  };
  return NextResponse.json(meta);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
