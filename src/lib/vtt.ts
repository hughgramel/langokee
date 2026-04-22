/**
 * Minimal WebVTT parser.
 *
 * yt-dlp already writes VTT files for every language YouTube advertises
 * (see `ytdlp.ts:69-74`). We don't need full spec compliance — we only
 * want the human-readable text, stripped of cue headers, karaoke timing
 * tags, and consecutive duplicates (auto-captions emit every line twice
 * as it crossfades to the next cue).
 */

const CUE_TIMING_RE = /^\d{2}:\d{2}[:.]\d{2}\.\d{3}\s+-->\s+/;
const TAG_RE = /<[^>]+>/g;
// Inline karaoke timestamps inside cues: `<00:00:01.500>`.
const INLINE_TS_RE = /<\d{2}:\d{2}:\d{2}\.\d{3}>/g;

/**
 * Parse a VTT file contents into plain text lines.
 *
 * Drops empty cues, WEBVTT/NOTE/STYLE/REGION headers, cue timing rows,
 * and consecutive duplicate lines. Returns a `\n`-joined string suitable
 * for passing straight into `/api/align`.
 */
export function vttToText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let prev = "";
  let skipBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      skipBlock = false;
      continue;
    }
    if (
      line === "WEBVTT" ||
      line.startsWith("WEBVTT ") ||
      line.startsWith("NOTE") ||
      line.startsWith("STYLE") ||
      line.startsWith("REGION") ||
      line.startsWith("X-TIMESTAMP-MAP")
    ) {
      skipBlock = true;
      continue;
    }
    if (skipBlock) continue;
    if (CUE_TIMING_RE.test(line)) continue;
    // A cue can optionally be preceded by an identifier line — a pure
    // number or arbitrary string on its own. Skip numeric-only lines
    // (common for yt-dlp output).
    if (/^\d+$/.test(line)) continue;

    const cleaned = line.replace(INLINE_TS_RE, "").replace(TAG_RE, "").trim();
    if (!cleaned) continue;
    if (cleaned === prev) continue;
    out.push(cleaned);
    prev = cleaned;
  }

  return out.join("\n");
}
