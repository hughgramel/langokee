/**
 * Pinyin attachment for Chinese tokens.
 *
 * AssemblyAI's `universal-2` returns Mandarin tokens as Hanzi only (no
 * romanization), so we compute pinyin client-side via `pinyin-pro`. The
 * output is one pinyin syllable per character so the transcript / caption
 * overlay can render ruby-style (tone-marked reading above each glyph).
 *
 * For non-Chinese languages this module is a no-op — `readingFor()`
 * returns `null`, which is the signal for callers to skip the ruby layout.
 */
import { pinyin } from "pinyin-pro";

const HAN_CHAR = /\p{Script=Han}/u;

function hasHan(token: string): boolean {
  return HAN_CHAR.test(token);
}

/**
 * Per-character pinyin for a Chinese token. Returns `null` if the token
 * has no Han characters (punctuation, numbers, latin loanwords) — the
 * caller renders plain text in that case. Non-Han characters inside an
 * otherwise-Chinese token come back as empty strings so the ruby layout
 * can still align character-for-character.
 */
export function pinyinChars(token: string): string[] | null {
  if (!hasHan(token)) return null;
  const readings = pinyin(token, {
    type: "array",
    toneType: "symbol",
    nonZh: "consecutive",
  }) as string[];
  // pinyin-pro preserves non-Han characters in place as their literal
  // glyphs. Normalise those to empty strings so consumers can treat the
  // array as parallel to [...token] (character-for-character).
  const chars = [...token];
  if (readings.length !== chars.length) return readings;
  return readings.map((r, i) => (hasHan(chars[i]!) ? r : ""));
}

/**
 * Cached per-token pinyin lookup — memoises one pinyin computation per
 * unique surface form for the lifetime of the page. Typical lyric/caption
 * transcripts reuse the same word many times (chorus repeats, filler
 * particles like 的 / 是), so this keeps React re-renders cheap.
 */
const cache = new Map<string, string[] | null>();
export function readingFor(token: string, language: string): string[] | null {
  if (language !== "zh") return null;
  if (cache.has(token)) return cache.get(token)!;
  const r = pinyinChars(token);
  cache.set(token, r);
  return r;
}
