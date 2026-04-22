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
const FFMPEG_INSTALL =
  "brew install ffmpeg (macOS) · apt install ffmpeg (Debian/Ubuntu) · https://ffmpeg.org/download.html";

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
    { logPrefix: "ffmpeg:audio", install: FFMPEG_INSTALL },
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
    { logPrefix: "ffmpeg:clip", install: FFMPEG_INSTALL },
  );
  return { filename, absPath };
}

/** Convenience: read a file to a base64 string for AnkiConnect's data= field. */
export async function readFileB64(absPath: string): Promise<string> {
  const buf = await fs.readFile(absPath);
  return buf.toString("base64");
}

/**
 * Extract a still frame at `timestampSec` from the cached MP4 into
 * `frame_<ms>.jpg`. Cached by (videoId, rounded-ms) so repeat calls for the
 * same moment skip ffmpeg entirely — screenshots for a given card never
 * change once the video is downloaded.
 */
export async function extractFrame(
  videoId: string,
  timestampSec: number,
): Promise<{ filename: string; absPath: string }> {
  const dir = mediaDir(videoId);
  const source = path.join(dir, "video.mp4");
  const ms = Math.max(0, Math.round(timestampSec * 1000));
  const filename = `frame_${ms}.jpg`;
  const absPath = path.join(dir, filename);
  try {
    await fs.stat(absPath);
    return { filename, absPath };
  } catch {
    // not cached yet — fall through to ffmpeg
  }
  await run(
    FFMPEG,
    [
      "-y",
      "-ss",
      (ms / 1000).toFixed(3),
      "-i",
      source,
      "-frames:v",
      "1",
      // q:v 3 is near-lossless JPEG at a fraction of the PNG size; these
      // land in Anki's media folder so smaller is friendlier.
      "-q:v",
      "3",
      absPath,
    ],
    { logPrefix: "ffmpeg:frame", install: FFMPEG_INSTALL },
  );
  return { filename, absPath };
}

/**
 * Concat N disjoint `[start, end]` ranges from the cached MP3 into a single
 * merged clip. Uses `filter_complex` with `atrim` + `concat` so each range is
 * cut precisely (keyframe-aligned copy would drift on non-contiguous cuts).
 *
 * Returns the filename + path of the merged MP3. Caller still uses a single
 * `AudioFile` field on the Anki card — multi-segment selections produce one
 * playable clip, not one-per-range.
 */
export async function clipAudioConcat(
  videoId: string,
  ranges: ReadonlyArray<{ startSec: number; endSec: number }>,
): Promise<{ filename: string; absPath: string }> {
  if (ranges.length === 0) throw new Error("clipAudioConcat: no ranges");
  if (ranges.length === 1) {
    return clipAudio(videoId, ranges[0]!.startSec, ranges[0]!.endSec);
  }
  const dir = mediaDir(videoId);
  const source = path.join(dir, "audio.mp3");
  const norm = ranges.map((r) => {
    const startMs = Math.max(0, Math.round(r.startSec * 1000));
    const endMs = Math.max(startMs + 1, Math.round(r.endSec * 1000));
    return { startMs, endMs };
  });
  // Filename bakes in every range so the cache key is stable across reorders
  // of selection state on the client.
  const stamp = norm.map((r) => `${r.startMs}-${r.endMs}`).join("_");
  const filename = `langokee_${videoId}_concat_${stamp}.mp3`;
  const absPath = path.join(dir, filename);

  const filter =
    norm
      .map(
        (r, i) =>
          `[0:a]atrim=start=${(r.startMs / 1000).toFixed(3)}:end=${(r.endMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
      )
      .join(";") +
    ";" +
    norm.map((_, i) => `[a${i}]`).join("") +
    `concat=n=${norm.length}:v=0:a=1[out]`;

  await run(
    FFMPEG,
    [
      "-y",
      "-i",
      source,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      absPath,
    ],
    { logPrefix: "ffmpeg:concat", install: FFMPEG_INSTALL },
  );
  return { filename, absPath };
}
