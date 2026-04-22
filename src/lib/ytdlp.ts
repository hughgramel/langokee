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
import { spawn } from "node:child_process";
import { run, ToolMissingError } from "./proc";
import { mediaDir } from "./paths";

const YTDLP = process.env.YTDLP_BIN || "yt-dlp";
/** Shown to users when the yt-dlp binary is missing. Platform-agnostic one-
 *  liner — `pip install` works on every OS, `brew` is faster on macOS. */
const YTDLP_INSTALL =
  "brew install yt-dlp (macOS) · pip install -U yt-dlp · https://github.com/yt-dlp/yt-dlp#installation";

/**
 * Probe result from `yt-dlp -J` (dump-json, no download). Surfaces the
 * picker-relevant slices of the info dict so the import UI can offer a
 * track-selection step before committing to a download.
 */
export type ProbeResult = {
  id: string;
  title: string;
  duration: number;
  uploader?: string;
  thumbnail?: string;
  /** Distinct video heights available, sorted descending. */
  videoHeights: number[];
  /** Audio track languages yt-dlp detected (multi-language dubs). */
  audioLanguages: string[];
  /** Human-uploaded subtitle langs. */
  manualSubtitles: string[];
  /** YouTube-generated ASR subtitle langs. */
  autoSubtitles: string[];
};

type RawFormat = {
  vcodec?: string;
  acodec?: string;
  height?: number;
  language?: string | null;
};

type RawInfo = {
  id: string;
  title: string;
  duration: number;
  uploader?: string;
  thumbnail?: string;
  formats?: RawFormat[];
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
};

/**
 * Run `yt-dlp -J <url>` to dump the full info dict without downloading.
 * We can't use `run()` here because we need stdout — the shared helper
 * only streams to the logger.
 */
async function ytDlpJson(url: string): Promise<RawInfo> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, ["--no-playlist", "--no-warnings", "-J", url]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
    });
    child.stderr.on("data", (b: Buffer) => {
      stderr += b.toString("utf8");
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new ToolMissingError("yt-dlp", YTDLP_INSTALL));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp probe failed (${code}): ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as RawInfo);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function probeVideo(url: string): Promise<ProbeResult> {
  const info = await ytDlpJson(url);
  const heights = new Set<number>();
  const langs = new Set<string>();
  for (const f of info.formats ?? []) {
    if (f.vcodec && f.vcodec !== "none" && typeof f.height === "number") {
      heights.add(f.height);
    }
    if (f.acodec && f.acodec !== "none" && f.language) {
      langs.add(f.language);
    }
  }
  return {
    id: info.id,
    title: info.title,
    duration: info.duration,
    uploader: info.uploader,
    thumbnail: info.thumbnail,
    videoHeights: [...heights].sort((a, b) => b - a),
    audioLanguages: [...langs].sort(),
    manualSubtitles: info.subtitles ? Object.keys(info.subtitles) : [],
    autoSubtitles: info.automatic_captions ? Object.keys(info.automatic_captions) : [],
  };
}

/** User's picks at import time. All optional — absent fields mean "default". */
export type DownloadOptions = {
  /** Maximum video height (e.g. 720). Hardcap; yt-dlp picks best ≤ this. */
  maxHeight?: number;
  /** Audio track language (for videos with multiple dubs). */
  audioLanguage?: string;
  /** Only fetch these subtitle langs instead of "all". Empty → skip subs. */
  subtitleLanguages?: string[];
};

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

export async function downloadVideo(
  url: string,
  videoId: string,
  opts: DownloadOptions = {},
): Promise<YtDlpInfo> {
  const dir = mediaDir(videoId);
  await fs.mkdir(dir, { recursive: true });

  const outputTemplate = path.join(dir, "video.%(ext)s");
  const maxH = opts.maxHeight ?? 720;
  // Audio-language filter is appended to the `ba*` selector when the user
  // picked a dub — yt-dlp's [language=X] filter on audio formats restricts
  // to matching tracks, then falls through to the default if none.
  const audioFilter = opts.audioLanguage ? `[language=${opts.audioLanguage}]` : "";
  const format =
    `bv*[height<=${maxH}][vcodec^=avc1]+ba${audioFilter}[acodec^=mp4a]/` +
    `bv*[height<=${maxH}][ext=mp4]+ba${audioFilter}[ext=m4a]/` +
    `bv*[height<=${maxH}]+ba${audioFilter}/` +
    `b[height<=${maxH}][ext=mp4]/b[height<=${maxH}]/b`;
  // Subtitles: "all" by default (cheap on most videos). When caller passes
  // an explicit list, use that; empty list means skip subs entirely.
  const subLangs = opts.subtitleLanguages;
  const subtitleArgs: string[] =
    subLangs === undefined
      ? ["--write-subs", "--sub-format", "vtt", "--sub-langs", "all"]
      : subLangs.length === 0
        ? []
        : ["--write-subs", "--sub-format", "vtt", "--sub-langs", subLangs.join(",")];

  await run(
    YTDLP,
    [
      "--no-playlist",
      "--no-warnings",
      "-f",
      // H.264 + AAC preferred explicitly: Chrome's AV1 demuxer has known
      // muxing issues in MP4 containers that silently drop the audio track
      // (readyState=4, paused=false, but webkitAudioDecodedByteCount=0).
      // Falling back through progressively more lenient options keeps
      // videos that only ship a single combined stream working.
      format,
      "--merge-output-format",
      "mp4",
      "--write-info-json",
      ...subtitleArgs,
      "-o",
      outputTemplate,
      url,
    ],
    { logPrefix: "yt-dlp", install: YTDLP_INSTALL },
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
