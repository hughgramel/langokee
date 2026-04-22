"use client";

import { memo } from "react";
import { readingFor } from "@/lib/pinyin";

/**
 * Renders a token with optional character-aligned reading (pinyin for
 * Chinese, empty for other languages). When no reading is available the
 * fall-through is plain text, so callers can render everything through
 * this single component regardless of language.
 *
 * The pinyin row is absolutely-sized per character so the stacked layout
 * doesn't cause the clickable glyph to shift when the reading toggles
 * on/off — reserving ~0.7em of height whether or not the reading is
 * visible keeps line heights stable.
 */
export const RubyWord = memo(function RubyWord({
  token,
  language,
  showReading,
}: {
  token: string;
  language: string;
  showReading: boolean;
}) {
  const reading = showReading ? readingFor(token, language) : null;
  if (!reading) return <>{token}</>;
  const chars = [...token];
  return (
    <span className="ruby-word">
      {chars.map((ch, i) => (
        <span key={i} className="ruby-char">
          <span className="ruby-reading">{reading[i] ?? ""}</span>
          <span className="ruby-char-glyph">{ch}</span>
        </span>
      ))}
    </span>
  );
});
