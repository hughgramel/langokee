/**
 * yt-dlp wrapper.
 *
 * Pulls a 720p MP4 with baked-in audio (so we can play it locally without
 * CORS headaches and grab `<canvas>` screenshots from the underlying
 * <video> element). Writes `video.info.json` alongside so we can fill in
 * title / channel / thumbnail without a second network round-trip.
 *
 * Audio is extracted from the MP4 via ffmpeg in a subsequent step — keeping
 * the two tools separate is simpler than chaining yt-dlp postprocessors,
 * and it makes the MP3 accessible for Whisper / the Anki AudioFile field.
 *
 * Captions: we also ask for manual + auto-generated subtitles in VTT
 * format. When they exist, they're line-timed by the uploader — more
 * accurate than open-vocabulary ASR guess-work, so the reader prefers them
 * when available.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { run } from "./proc";
import { mediaDir } from "./paths";

const YTDLP = process.env.YTDLP_BIN || "yt-dlp";

export type YtDlpInfo = {
  id: string;
  title: string;
  uploader?: string;
  duration: number;
  thumbnail?: string;
  /** Manually-uploaded caption languages (keys of `subtitles` in info.json). */
  subtitleLanguages?: string[];
  /** Auto-generated caption languages (keys of `automatic_captions`). */
  autoCaptionLanguages?: string[];
};

/**
 * Download the video to `public/media/{videoId}/video.mp4` and return the
 * metadata dict written by yt-dlp's `--write-info-json`.
 *
 * The format selector prefers the merge of best-720p-video + best-audio,
 * and falls back through progressively more lenient options. The chained
 * slashes are standard yt-dlp format-fallback syntax.
 */
/**
 * Locate a manually-uploaded VTT caption for `videoId` in the requested
 * language. Returns the absolute file path or null.
 *
 * yt-dlp names VTT files `video.<lang>.vtt`, but YouTube also returns
 * locale variants — `zh-Hans`, `zh-CN`, `en-US`. We prefix-match on the
 * 2-letter base so `"zh"` finds `video.zh-Hans.vtt`.
 *
 * The info.json tells us which languages are *manual* vs *auto* (yt-dlp
 * writes both as `video.<lang>.vtt` on disk with no indication). We
 * cross-reference info.json's `subtitles` key so callers get only the
 * high-quality human-uploaded track and never silently fall back to ASR
 * captions.
 */
export async function findManualSubtitle(
  videoId: string,
  lang: string,
): Promise<string | null> {
  const dir = mediaDir(videoId);
  const infoPath = path.join(dir, "video.info.json");
  let info: { subtitles?: Record<string, unknown> };
  try {
    info = JSON.parse(await fs.readFile(infoPath, "utf8")) as typeof info;
  } catch {
    return null;
  }
  const manualLangs = info.subtitles ? Object.keys(info.subtitles) : [];
  const base = lang.slice(0, 2).toLowerCase();
  const match = manualLangs.find((k) => k.toLowerCase().startsWith(base));
  if (!match) return null;

  const vttPath = path.join(dir, `video.${match}.vtt`);
  try {
    await fs.stat(vttPath);
    return vttPath;
  } catch {
    return null;
  }
}

export async function downloadVideo(url: string, videoId: string): Promise<YtDlpInfo> {
  const dir = mediaDir(videoId);
  await fs.mkdir(dir, { recursive: true });

  const outputTemplate = path.join(dir, "video.%(ext)s");

  await run(
    YTDLP,
    [
      "--no-playlist",
      "--no-warnings",
      "-f",
      // Prefer H.264 + AAC explicitly: Chrome's AV1 demuxer has known
      // muxing issues in MP4 containers that silently drop the audio track
      // (readyState=4, paused=false, but webkitAudioDecodedByteCount=0).
      // Falling back through progressively more lenient options keeps
      // videos that only ship a single combined stream working.
      "bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b",
      "--merge-output-format",
      "mp4",
      "--write-info-json",
      // Captions: grab only manually-uploaded tracks. Auto-captions are
      // YouTube's own ASR, which reintroduces the hallucinations we
      // built around avoiding — and requesting them triggers aggressive
      // rate limiting on popular uploads (YouTube advertises auto-
      // translated tracks for every language it supports, 50+ files per
      // video). Manual subs alone are small and rarely throttled.
      "--write-subs",
      "--sub-format",
      "vtt",
      "--sub-langs",
      "all",
      "-o",
      outputTemplate,
      url,
    ],
    { logPrefix: "yt-dlp" },
  );

  const infoPath = path.join(dir, "video.info.json");
  const infoRaw = await fs.readFile(infoPath, "utf8");
  const raw = JSON.parse(infoRaw) as YtDlpInfo & {
    subtitles?: Record<string, unknown>;
    automatic_captions?: Record<string, unknown>;
  };
  return {
    id: raw.id,
    title: raw.title,
    uploader: raw.uploader,
    duration: raw.duration,
    thumbnail: raw.thumbnail,
    subtitleLanguages: raw.subtitles ? Object.keys(raw.subtitles) : [],
    autoCaptionLanguages: raw.automatic_captions ? Object.keys(raw.automatic_captions) : [],
  };
}
