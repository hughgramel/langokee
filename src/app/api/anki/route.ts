/**
 * POST /api/anki
 *
 * The single server-side endpoint for shipping a card. Takes the
 * review-modal's payload, does the ffmpeg audio cut(s), uploads the audio +
 * screenshot to Anki's media folder, and calls `addNote`.
 *
 * Accepts either a single `[startSec, endSec]` range or a `segments` array
 * of disjoint ranges. Multi-segment cards are concat'd into one playable
 * MP3 (`clipAudioConcat`) — the card has one audio field, not N.
 *
 * Screenshots: prefer `screenshotSec` (server extracts + caches the frame
 * via ffmpeg). Falls back to the legacy `screenshotDataUrl` client canvas
 * capture for callers that haven't migrated.
 */
import { NextResponse } from "next/server";
import { clipAudio, clipAudioConcat, extractFrame, readFileB64 } from "@/lib/ffmpeg";
import {
  addNote,
  ensureScreenshotField,
  storeMediaFileB64,
  type AnkiNoteFields,
} from "@/lib/anki";
import { apiErrorResponse } from "@/lib/api-error";
import type { Word } from "@/types/transcript";

export const runtime = "nodejs";

type Segment = { startSec: number; endSec: number };

type Body = {
  videoId: string;
  title: string;
  channel?: string;
  language: string;
  /** Legacy single-range form. Ignored when `segments` is present. */
  startSec?: number;
  endSec?: number;
  /** Multi-segment form — concat'd into one clip. */
  segments?: Segment[];
  sentence: string;
  words: Word[];
  targetWord: string;
  translation: string;
  definition: string;
  /** Server-side frame extraction — timestamp to grab. Preferred. */
  screenshotSec?: number;
  /** Legacy client-side canvas capture. data:image/png;base64,... */
  screenshotDataUrl?: string | null;
};

function stripDataUrlPrefix(dataUrl: string): { mime: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1]!, base64: m[2]! };
}

function resolveSegments(body: Body): Segment[] | null {
  if (body.segments && body.segments.length > 0) {
    return body.segments.filter((s) => s.endSec > s.startSec);
  }
  if (typeof body.startSec === "number" && typeof body.endSec === "number") {
    if (body.endSec > body.startSec) {
      return [{ startSec: body.startSec, endSec: body.endSec }];
    }
  }
  return null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.videoId || !body.sentence || !body.targetWord) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const segments = resolveSegments(body);
  if (!segments) {
    return NextResponse.json({ error: "missing time range" }, { status: 400 });
  }

  try {
    await ensureScreenshotField();

    // 1. Audio: single-range uses clipAudio; multi-range concats into one MP3.
    const { filename: audioFilename, absPath: audioPath } =
      segments.length === 1
        ? await clipAudio(body.videoId, segments[0]!.startSec, segments[0]!.endSec)
        : await clipAudioConcat(body.videoId, segments);
    const audioB64 = await readFileB64(audioPath);
    await storeMediaFileB64(audioFilename, audioB64);

    // 2. Screenshot — prefer server-side extractFrame (cached on disk). Falls
    //    back to client canvas PNG when explicitly provided.
    let screenshotTag = "";
    if (typeof body.screenshotSec === "number") {
      const { filename, absPath } = await extractFrame(body.videoId, body.screenshotSec);
      const b64 = await readFileB64(absPath);
      await storeMediaFileB64(filename, b64);
      screenshotTag = `<img src="${filename}">`;
    } else if (body.screenshotDataUrl) {
      const parsed = stripDataUrlPrefix(body.screenshotDataUrl);
      if (parsed) {
        const ext = parsed.mime === "image/jpeg" ? "jpg" : "png";
        const screenshotName = `langokee_${body.videoId}_${Math.round(segments[0]!.startSec * 1000)}.${ext}`;
        await storeMediaFileB64(screenshotName, parsed.base64);
        screenshotTag = `<img src="${screenshotName}">`;
      }
    }

    // 3. Build the fields. Anki's "Timestamp Sentence" card template wraps
    //    `AudioFile` in <audio src="{{AudioFile}}">, so the field just needs
    //    the bare filename — not a [sound:...] tag.
    const first = segments[0]!;
    const last = segments[segments.length - 1]!;
    const fields: AnkiNoteFields = {
      Sentence: body.sentence,
      Words: JSON.stringify(body.words),
      AudioFile: audioFilename,
      VideoId: body.videoId,
      StartSec: first.startSec.toFixed(3),
      EndSec: last.endSec.toFixed(3),
      Translation: body.translation,
      TargetWord: body.targetWord,
      WordDefinition: body.definition,
      Screenshot: screenshotTag,
    };

    const tags = ["langokee", body.language];
    if (segments.length > 1) tags.push("concat");
    const noteId = await addNote(fields, tags);
    return NextResponse.json({ noteId });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
