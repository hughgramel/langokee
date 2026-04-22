/**
 * POST /api/align
 *
 * Body: { videoId: string, language: string, text: string }
 *
 * Runs wav2vec2 forced alignment (via scripts/align.py) on the audio at
 * `public/media/{videoId}/audio.mp3` using the user's pasted text as the
 * ground truth. Replaces the old /api/transcribe five-backend fork — we
 * never try to ASR the audio because the text is already known, and
 * alignment alone is the reliable part of the pipeline.
 *
 * Caches the resulting Transcript JSON keyed by (videoId, language,
 * normalized-text-hash) so the same paste is instant on re-open, but a
 * changed paste re-runs rather than silently returning a stale result.
 */
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { align } from "@/lib/align";
import { normalizeText } from "@/lib/normalize-text";
import { mediaDir } from "@/lib/paths";
import { apiErrorResponse } from "@/lib/api-error";
import type { Transcript } from "@/types/transcript";

export const runtime = "nodejs";
// Alignment is much faster than ASR (no Whisper pass) but wav2vec2 still
// needs to chew through the audio. Keep the same generous ceiling.
export const maxDuration = 900;

export async function POST(req: Request) {
  let body: { videoId?: string; language?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const videoId = body.videoId?.trim();
  const language = body.language?.trim() || "en";
  const rawText = body.text ?? "";
  if (!videoId) {
    return NextResponse.json({ error: "missing videoId" }, { status: 400 });
  }

  const normalized = normalizeText(rawText);
  if (!normalized) {
    return NextResponse.json(
      { error: "text is empty after normalization — paste the lyrics or transcript" },
      { status: 400 },
    );
  }

  // Short content-addressed suffix keeps the cache keyed to the exact
  // paste. Different lyrics → different file → fresh alignment.
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  const dir = mediaDir(videoId);
  const cachePath = path.join(dir, `transcript.${language}.${hash}.json`);

  if (await fileExists(cachePath)) {
    const raw = await fs.readFile(cachePath, "utf8");
    return NextResponse.json(JSON.parse(raw) as Transcript);
  }

  let transcript: Transcript;
  try {
    transcript = await align(videoId, language, normalized);
  } catch (err) {
    return apiErrorResponse(err);
  }

  await fs.writeFile(cachePath, JSON.stringify(transcript, null, 2));
  return NextResponse.json(transcript);
}

/**
 * GET /api/align?videoId=...&language=...
 *
 * Returns the most-recently-written cached transcript for this
 * (videoId, language) — the file we wrote on the last POST. History
 * re-opens hit this so the user doesn't have to re-paste the text they
 * already aligned. 404 if nothing is cached yet.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")?.trim();
  const language = req.nextUrl.searchParams.get("language")?.trim() || "en";
  if (!videoId) {
    return NextResponse.json({ error: "missing videoId" }, { status: 400 });
  }
  const dir = mediaDir(videoId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return NextResponse.json({ error: "no cached transcript" }, { status: 404 });
  }

  const prefix = `transcript.${language}.`;
  const candidates = entries.filter((n) => n.startsWith(prefix) && n.endsWith(".json"));
  if (!candidates.length) {
    return NextResponse.json({ error: "no cached transcript" }, { status: 404 });
  }

  // Sort by mtime so the newest alignment wins — users who re-align with
  // different text get the latest version back.
  const withMtime = await Promise.all(
    candidates.map(async (name) => {
      const stat = await fs.stat(path.join(dir, name));
      return { name, mtime: stat.mtimeMs };
    }),
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);
  const newest = withMtime[0]!;
  const raw = await fs.readFile(path.join(dir, newest.name), "utf8");
  return NextResponse.json(JSON.parse(raw) as Transcript);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
