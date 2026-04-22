/**
 * VTT caption parser.
 *
 * yt-dlp writes captions to `public/media/{videoId}/video.{lang}.vtt` when
 * the video has a manually-uploaded caption track or YouTube has auto-
 * generated one. The captions backend reads whichever VTT matches the
 * user's target language and returns a canonical `Transcript`.
 *
 * VTT cues are line-timed, not word-timed. For the reader's karaoke
 * highlight to still work we synthesize per-word timings by distributing
 * the cue's duration evenly across its tokens — good enough that the
 * underline advances roughly in sync with the audio without pretending we
 * have per-word alignment (we don't; a forced aligner is the next step).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { mediaDir } from "./paths";
import type { Segment, Transcript, Word } from "@/types/transcript";

/**
 * Return the path of the VTT file that best matches `language`, or null
 * when none is available. We prefer an exact match (`zh.vtt`), then a
 * prefix match (`zh-Hans.vtt`, `zh-CN.vtt`), then fall through.
 */
export async function findCaptionFile(
  videoId: string,
  language: string,
): Promise<string | null> {
  const dir = mediaDir(videoId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const vtts = entries.filter((f) => /^video\..+\.vtt$/.test(f));
  if (!vtts.length) return null;
  const lang = language.toLowerCase();
  const candidates = [
    (n: string) => n === `video.${lang}.vtt`,
    (n: string) => n.toLowerCase().startsWith(`video.${lang}-`),
    (n: string) => n.toLowerCase().startsWith(`video.${lang}.`),
    // Accept YouTube's "orig" track or any other trailing qualifier.
    (n: string) => {
      const m = n.match(/^video\.([^.]+)\./);
      return !!m && m[1]!.toLowerCase().startsWith(lang);
    },
  ];
  for (const pred of candidates) {
    const hit = vtts.find(pred);
    if (hit) return path.join(dir, hit);
  }
  return null;
}

/** Read + parse a VTT file into a canonical `Transcript`. */
export async function loadCaptionTranscript(
  videoId: string,
  language: string,
): Promise<Transcript | null> {
  const file = await findCaptionFile(videoId, language);
  if (!file) return null;
  const raw = await fs.readFile(file, "utf8");
  const segments = parseVtt(raw, language);
  const duration = segments.length ? segments[segments.length - 1]!.end : 0;
  return { language, segments, duration };
}

/**
 * Minimal WebVTT parser — cue-block based.
 *
 * YouTube's auto-captions sometimes ship inline `<00:00:03.120>` word
 * timestamps inside cue text. When present we use them directly; when
 * absent we fall back to even distribution across the cue's duration.
 */
export function parseVtt(raw: string, language: string): Segment[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const segments: Segment[] = [];
  let i = 0;
  // Skip the WEBVTT header and any STYLE / NOTE / REGION blocks.
  while (i < lines.length && !isTimecodeLine(lines[i]!)) i++;

  let segId = 0;
  while (i < lines.length) {
    const tcLine = lines[i];
    if (!tcLine) {
      i++;
      continue;
    }
    const tc = parseTimecodeLine(tcLine);
    if (!tc) {
      i++;
      continue;
    }
    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i] !== "" && !isTimecodeLine(lines[i]!)) {
      textLines.push(lines[i]!);
      i++;
    }
    while (i < lines.length && lines[i] === "") i++;

    const rawText = textLines.join(" ");
    // YouTube auto-captions often duplicate every line twice with different
    // cue timings (rolling preview). Dedup when the new cue text equals the
    // most-recently-pushed one and the start overlaps.
    const last = segments[segments.length - 1];
    if (last && stripInlineTags(last.text) === stripInlineTags(rawText) && tc.start <= last.end) {
      continue;
    }

    const words = extractWords(rawText, tc.start, tc.end, language);
    if (!words.length) continue;
    segments.push({
      id: segId++,
      start: tc.start,
      end: tc.end,
      text: words.map((w) => w.surface).join(language === "zh" || language === "ja" ? "" : " "),
      words,
    });
  }
  return segments;
}

function isTimecodeLine(line: string): boolean {
  return /-->/.test(line);
}

function parseTimecodeLine(line: string): { start: number; end: number } | null {
  const m = line.match(
    /(\d+:)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(\d+:)?(\d{1,2}):(\d{2})[.,](\d{3})/,
  );
  if (!m) return null;
  const toSec = (h?: string, mm?: string, ss?: string, ms?: string) =>
    (h ? parseInt(h, 10) * 3600 : 0) +
    parseInt(mm!, 10) * 60 +
    parseInt(ss!, 10) +
    parseInt(ms!, 10) / 1000;
  const start = toSec(m[1]?.replace(":", ""), m[2], m[3], m[4]);
  const end = toSec(m[5]?.replace(":", ""), m[6], m[7], m[8]);
  return { start, end };
}

function stripInlineTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

/**
 * Turn a cue's raw text into `Word[]` with per-word start/end. Honors
 * inline `<00:00:03.120>word` tags when present, otherwise splits on
 * whitespace (or per-character for unspaced scripts) and interpolates
 * timings evenly across the cue duration.
 */
function extractWords(rawText: string, start: number, end: number, language: string): Word[] {
  const inline = parseInlineTimedTokens(rawText);
  if (inline.length) {
    // Inline tags give the start of each token; end of token i is the
    // start of token i+1, clamped to the cue's end.
    return inline.map((t, idx) => {
      const next = inline[idx + 1];
      return {
        surface: t.surface,
        start: t.start,
        end: next ? next.start : end,
      };
    });
  }

  const plain = stripInlineTags(rawText);
  if (!plain) return [];
  const tokens = tokenizeForLang(plain, language);
  if (!tokens.length) return [];
  const dur = Math.max(0.01, end - start);
  const per = dur / tokens.length;
  return tokens.map((surface, idx) => ({
    surface,
    start: start + idx * per,
    end: start + (idx + 1) * per,
  }));
}

/** Extract `<HH:MM:SS.mmm>token` pairs from a cue's raw inner text. */
function parseInlineTimedTokens(raw: string): { surface: string; start: number }[] {
  const results: { surface: string; start: number }[] = [];
  const re = /<(\d+):(\d{2}):(\d{2})\.(\d{3})>([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const t =
      parseInt(m[1]!, 10) * 3600 +
      parseInt(m[2]!, 10) * 60 +
      parseInt(m[3]!, 10) +
      parseInt(m[4]!, 10) / 1000;
    const surface = m[5]!.trim();
    if (!surface) continue;
    results.push({ start: t, surface });
  }
  return results;
}

function tokenizeForLang(text: string, language: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // For unspaced scripts (Chinese, Japanese, Thai), split per character
  // so the karaoke highlight advances at a reasonable granularity.
  if (language === "zh" || language === "ja" || language === "th") {
    return [...cleaned].filter((c) => c.trim() !== "");
  }
  return cleaned.split(/\s+/).filter(Boolean);
}
