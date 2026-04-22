/**
 * POST /api/clip
 *
 * Cut the same audio clip + screenshot that `/api/anki` would produce, but
 * skip the AnkiConnect call and return URLs so the client can trigger
 * browser downloads instead. For users who don't have Anki running (or who
 * want to drop the assets into another deck tool) — same pipeline, no
 * Anki dependency.
 *
 * The files land in `public/media/{videoId}/` just like the Anki flow, so
 * subsequent requests for the same cut hit disk cache.
 */
import { NextResponse } from "next/server";
import { clipAudio, clipAudioConcat, extractFrame } from "@/lib/ffmpeg";
import { mediaUrl } from "@/lib/paths";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

type Segment = { startSec: number; endSec: number };

type Body = {
  videoId?: string;
  segments?: Segment[];
  screenshotSec?: number;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const videoId = body.videoId?.trim();
  if (!videoId) {
    return NextResponse.json({ error: "missing videoId" }, { status: 400 });
  }
  const segments = body.segments?.filter((s) => s.endSec > s.startSec);
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "missing segments" }, { status: 400 });
  }

  try {
    const audio =
      segments.length === 1
        ? await clipAudio(videoId, segments[0]!.startSec, segments[0]!.endSec)
        : await clipAudioConcat(videoId, segments);
    let screenshotFilename: string | null = null;
    if (typeof body.screenshotSec === "number") {
      const { filename } = await extractFrame(videoId, body.screenshotSec);
      screenshotFilename = filename;
    }
    return NextResponse.json({
      audioFilename: audio.filename,
      audioUrl: mediaUrl(videoId, audio.filename),
      screenshotFilename,
      screenshotUrl: screenshotFilename
        ? mediaUrl(videoId, screenshotFilename)
        : null,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
