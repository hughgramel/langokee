/**
 * ffmpeg wrapper.
 *
 * Two operations end up hitting ffmpeg in this app:
 *   1. extractAudio — strip the audio track off a downloaded video and
 *      re-encode as MP3. Whisper accepts MP3/WAV/etc.; MP3 keeps the file
 *      tiny and is what the Anki `Timestamp Sentence` model expects in
 *      its `AudioFile` field.
 *   2. clipAudio    — cut a `[start, end]` range from the source MP3 into
 *      a short clip for an Anki card. Uses `-c copy` where possible to
 *      avoid re-encoding overhead.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { run } from "./proc";
import { mediaDir } from "./paths";

const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";

export async function extractAudio(videoId: string): Promise<string> {
  const dir = mediaDir(videoId);
  const videoPath = path.join(dir, "video.mp4");
  const audioPath = path.join(dir, "audio.mp3");
  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      audioPath,
    ],
    { logPrefix: "ffmpeg:audio" },
  );
  return audioPath;
}

/**
 * Cut `[startSec, endSec]` out of the source MP3 into a per-clip file named
 * after the video ID + millisecond-rounded offsets. Returns the filename
 * (no directory) plus its absolute path — the filename alone is what we
 * send to AnkiConnect's `storeMediaFile`.
 */
export async function clipAudio(
  videoId: string,
  startSec: number,
  endSec: number,
): Promise<{ filename: string; absPath: string }> {
  const dir = mediaDir(videoId);
  const source = path.join(dir, "audio.mp3");
  const startMs = Math.max(0, Math.round(startSec * 1000));
  const endMs = Math.max(startMs + 1, Math.round(endSec * 1000));
  const durationMs = endMs - startMs;
  const filename = `langokee_${videoId}_${startMs}_${endMs}.mp3`;
  const absPath = path.join(dir, filename);

  // Re-encoding (as opposed to -c copy) is more reliable for precise cuts,
  // and MP3 is small enough that the extra CPU spend is negligible for a
  // 1-10 second clip.
  await run(
    FFMPEG,
    [
      "-y",
      "-ss",
      (startMs / 1000).toFixed(3),
      "-i",
      source,
      "-t",
      (durationMs / 1000).toFixed(3),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      absPath,
    ],
    { logPrefix: "ffmpeg:clip" },
  );
  return { filename, absPath };
}

/** Convenience: read a file to a base64 string for AnkiConnect's data= field. */
export async function readFileB64(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return buf.toString("base64");
}
