"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Reader settings — tiny localStorage-backed store for how the active word
 * and progress fill render. Kept app-local: the server doesn't care.
 */

export type ActiveWordStyle = "color" | "underline" | "background" | "box" | "bold";

/** Named presets for the text-size picker. S/M/L are quick-select buttons;
 *  any value outside these three is treated as "Custom" and shows the slider. */
export const FONT_SIZE_PRESETS = { S: 14, M: 17, L: 22 } as const;
/** Range for the Custom slider. Keep it readable on both ends. */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 32;

export type ReaderSettings = {
  activeStyle: ActiveWordStyle;
  activeColor: string;
  progressFill: boolean;
  progressFillColor: string;
  /** Show pinyin (Mandarin) readings above Chinese words in the transcript. */
  showPinyin: boolean;
  /** Extend the active-word highlight (color/bold) to the pinyin reading row,
   *  not just the hanzi glyph. No-op when the active style has no text color
   *  change (e.g. "underline", "background", "box"). */
  highlightPinyin: boolean;
  /** Show the caption line as a translucent overlay on the video. */
  captionOverlay: boolean;
  /** Transcript font size in px. Overlay scales from this (+5). */
  fontSize: number;
};

/** Quick-pick swatches for the highlight color picker. Hand-tuned for
 *  visibility on the off-white paper surface and distinctness from each
 *  other — not a full palette, just the useful options. */
export const COLOR_PRESETS: readonly { name: string; value: string }[] = [
  { name: "Yellow", value: "#EAB308" },
  { name: "Orange", value: "#EA580C" },
  { name: "Red", value: "#DC2626" },
  { name: "Pink", value: "#DB2777" },
  { name: "Purple", value: "#7C3AED" },
  { name: "Blue", value: "#1E40FF" },
  { name: "Teal", value: "#0D9488" },
  { name: "Green", value: "#059669" },
];

export const DEFAULT_SETTINGS: ReaderSettings = {
  activeStyle: "underline",
  activeColor: "#EAB308",
  progressFill: false,
  progressFillColor: "#EAB308",
  showPinyin: true,
  highlightPinyin: true,
  captionOverlay: true,
  fontSize: FONT_SIZE_PRESETS.M,
};

const KEY = "langokee.reader-settings";

export function loadSettings(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ReaderSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private-mode or quota errors — silently drop. Settings default on next load.
  }
}

/**
 * Inline styles merged onto the active word span. Returns `{}` for the
 * "underline" style because that one is rendered as a separate absolute-
 * positioned bar element (see `ActiveWordBar` in karaoke-reader.tsx) —
 * CSS `text-decoration: underline` is too thin under wide CJK glyphs.
 *
 * `box` uses box-shadow rather than border/outline so the ring respects
 * border-radius and doesn't shift the surrounding text on activation.
 */
export function activeWordInlineStyle(s: ReaderSettings): React.CSSProperties {
  const c = s.activeColor;
  switch (s.activeStyle) {
    case "underline":
      return {};
    case "color":
      return { color: c, fontWeight: 700 };
    case "background":
      return {
        background: `color-mix(in srgb, ${c} 22%, transparent)`,
        borderRadius: 4,
      };
    case "box":
      return {
        boxShadow: `0 0 0 2px ${c}`,
        borderRadius: 4,
      };
    case "bold":
      return { fontWeight: 900, color: c };
  }
}

/**
 * React hook — hydrates from localStorage on mount and persists any
 * partial update. Use this at the top of the component tree (app page)
 * so the same settings object flows to both the header button (which
 * opens the modal) and the reader that renders with them.
 */
export function useReaderSettings(): [
  ReaderSettings,
  (patch: Partial<ReaderSettings>) => void,
] {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    setSettings(loadSettings());
  }, []);
  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  return [settings, update];
}
