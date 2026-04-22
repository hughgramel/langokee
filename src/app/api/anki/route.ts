/**
 * POST /api/anki
 *
 * The single server-side endpoint for shipping a card. Takes the
 * review-modal's payload, does the ffmpeg audio cut, uploads the audio +
 * screenshot to Anki's media folder, and calls `addNote`.
 *
 * The Screenshot field is added to the model automatically on first use
 * so the back face shows the photo above the existing translation /
 * definition block — see `ensureScreenshotField`.
 */
import { NextResponse } from "next/server";
import { clipAudio, readFileB64 } from "@/lib/ffmpeg";
import {
  addNote,
  ensureScreenshotField,
  storeMediaFileB64,
  type AnkiNoteFields,
} from "@/lib/anki";
import type { Word } from "@/types/transcript";

export const runtime = "nodejs";

type Body = {
  videoId: string;
  title: string;
  channel?: string;
  language: string;
  startSec: number;
  endSec: number;
  sentence: string;
  words: Word[];
  targetWord: string;
  translation: string;
  definition: string;
  /** data:image/png;base64,... from the client canvas. */
  screenshotDataUrl: string | null;
};

function stripDataUrlPrefix(dataUrl: string): { mime: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1]!, base64: m[2]! };
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

  try {
    await ensureScreenshotField();

    // 1. Cut the audio clip locally with ffmpeg, then upload as base64.
    const { filename: audioFilename, absPath } = await clipAudio(
      body.videoId,
      body.startSec,
      body.endSec,
    );
    const audioB64 = await readFileB64(absPath);
    await storeMediaFileB64(audioFilename, audioB64);

    // 2. Screenshot — optional but generally present.
    let screenshotTag = "";
    if (body.screenshotDataUrl) {
      const parsed = stripDataUrlPrefix(body.screenshotDataUrl);
      if (parsed) {
        const ext = parsed.mime === "image/jpeg" ? "jpg" : "png";
        const screenshotName = `langokee_${body.videoId}_${Math.round(body.startSec * 1000)}.${ext}`;
        await storeMediaFileB64(screenshotName, parsed.base64);
        screenshotTag = `<img src="${screenshotName}">`;
      }
    }

    // 3. Build the fields. Anki's "Timestamp Sentence" card template
    //    wraps `AudioFile` in <audio src="{{AudioFile}}">, so the field
    //    just needs the bare filename — not a [sound:...] tag.
    const fields: AnkiNoteFields = {
      Sentence: body.sentence,
      Words: JSON.stringify(body.words),
      AudioFile: audioFilename,
      VideoId: body.videoId,
      StartSec: body.startSec.toFixed(3),
      EndSec: body.endSec.toFixed(3),
      Translation: body.translation,
      TargetWord: body.targetWord,
      WordDefinition: body.definition,
      Screenshot: screenshotTag,
    };

    const tags = ["langokee", body.language];
    const noteId = await addNote(fields, tags);
    return NextResponse.json({ noteId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
