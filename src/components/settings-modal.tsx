"use client";

import type { CSSProperties } from "react";
import { Modal } from "./ui/modal";
import {
  COLOR_PRESETS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_PRESETS,
  type ActiveWordStyle,
  type ReaderSettings,
} from "@/lib/reader-settings";

/**
 * Reader settings panel:
 *   1. Text size   — Small / Medium / Large / Custom (slider)
 *   2. Active word style — five presets with a colour picker
 *   3. Progress fill (optional sub-bar that fills 0→100% across the active
 *      word's start/end window)
 *   4. Show pinyin (Mandarin only)
 *   5. Caption overlay (translucent line over the video)
 */

type StyleOption = {
  value: ActiveWordStyle;
  label: string;
  /** Renders the word in its active state inside the preview tile. Returns
   *  an inline style and/or a trailing decoration node so we can visualise
   *  the "underline" option as the same 3px bar we actually render. */
  preview: (color: string) => { style: CSSProperties; bar?: boolean };
};

const STYLES: StyleOption[] = [
  {
    value: "underline",
    label: "Underline",
    preview: () => ({ style: { position: "relative", padding: "0 2px" }, bar: true }),
  },
  {
    value: "color",
    label: "Color",
    preview: (c) => ({ style: { color: c, fontWeight: 700 } }),
  },
  {
    value: "background",
    label: "Background",
    preview: (c) => ({
      style: {
        background: `color-mix(in srgb, ${c} 22%, transparent)`,
        padding: "0 4px",
        borderRadius: 4,
      },
    }),
  },
  {
    value: "box",
    label: "Box",
    preview: (c) => ({
      style: {
        boxShadow: `0 0 0 2px ${c}`,
        padding: "0 4px",
        borderRadius: 4,
      },
    }),
  },
  {
    value: "bold",
    label: "Bold",
    preview: (c) => ({ style: { fontWeight: 900, color: c } }),
  },
];

type SizePreset = { label: string; value: number };
const SIZE_BUTTONS: SizePreset[] = [
  { label: "Small", value: FONT_SIZE_PRESETS.S },
  { label: "Medium", value: FONT_SIZE_PRESETS.M },
  { label: "Large", value: FONT_SIZE_PRESETS.L },
];

function isPresetSize(n: number): boolean {
  return (
    n === FONT_SIZE_PRESETS.S ||
    n === FONT_SIZE_PRESETS.M ||
    n === FONT_SIZE_PRESETS.L
  );
}

const SECTION_LABEL: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--color-ink)",
};

const HELPER_TEXT: CSSProperties = {
  color: "var(--color-muted)",
  fontFamily: "var(--font-ui)",
};

function chipStyle(selected: boolean): CSSProperties {
  return {
    background: selected ? "var(--color-blue-soft)" : "#ffffff",
    border: selected
      ? "1.5px solid var(--color-blue-strong)"
      : "1px solid var(--color-line)",
    color: selected ? "var(--color-blue-ink)" : "var(--color-ink)",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-ui)",
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.1s",
  };
}

export function SettingsModal({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
}) {
  const customActive = !isPresetSize(settings.fontSize);

  return (
    <Modal open={open} onClose={onClose} title="Reader settings" width={560}>
      <div className="flex flex-col gap-5">
        <section>
          <div className="mb-2 text-sm" style={SECTION_LABEL}>
            Text size
          </div>
          <div className="flex flex-wrap gap-2">
            {SIZE_BUTTONS.map((p) => {
              const selected = settings.fontSize === p.value;
              return (
                <button
                  key={p.label}
                  onClick={() => onChange({ fontSize: p.value })}
                  className="px-3 py-2 text-sm"
                  style={chipStyle(selected)}
                >
                  {p.label}
                  <span
                    className="ml-2 text-xs"
                    style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {p.value}px
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => {
                // Enter Custom mode — snap to a non-preset value so the
                // button visibly "activates" immediately. Nearest round
                // number to current, biased slightly to open the slider.
                if (!customActive) onChange({ fontSize: settings.fontSize + 1 });
              }}
              className="px-3 py-2 text-sm"
              style={chipStyle(customActive)}
            >
              Custom
              {customActive && (
                <span
                  className="ml-2 text-xs"
                  style={{ color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}
                >
                  {settings.fontSize}px
                </span>
              )}
            </button>
          </div>
          {customActive && (
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={settings.fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                aria-label="Custom text size"
                style={{ flex: 1, accentColor: "var(--color-blue-strong)" }}
              />
              <span
                className="min-w-[48px] text-right text-sm"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--color-ink)",
                }}
              >
                {settings.fontSize}px
              </span>
            </div>
          )}
          <div
            className="mt-3 p-3"
            style={{
              border: "1px solid var(--color-line)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              fontFamily: "var(--font-ui)",
              color: "var(--color-ink)",
              fontSize: settings.fontSize,
              lineHeight: 1.5,
            }}
          >
            The quick brown fox jumps over the lazy dog.
          </div>
        </section>

        <section>
          <div className="mb-2 text-sm" style={SECTION_LABEL}>
            Active word style
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STYLES.map((s) => {
              const selected = settings.activeStyle === s.value;
              const { style, bar } = s.preview(settings.activeColor);
              return (
                <button
                  key={s.value}
                  onClick={() => onChange({ activeStyle: s.value })}
                  className="p-3 text-left"
                  style={chipStyle(selected)}
                >
                  <div
                    className="mb-1 text-xs"
                    style={{
                      color: "var(--color-muted)",
                      fontFamily: "var(--font-ui)",
                      fontWeight: 700,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 16,
                      color: "var(--color-ink)",
                    }}
                  >
                    Hola{" "}
                    <span
                      style={{ display: "inline-block", position: "relative", ...style }}
                    >
                      mundo
                      {bar && (
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: 2,
                            right: 2,
                            bottom: -3,
                            height: 3,
                            borderRadius: 2,
                            backgroundColor: settings.activeColor,
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-3">
            <span className="flex-1 text-sm" style={SECTION_LABEL}>
              Highlight color
            </span>
            <input
              type="color"
              value={settings.activeColor}
              onChange={(e) => onChange({ activeColor: e.target.value })}
              aria-label="Active word color"
              style={{ width: 56, height: 36, border: 0, background: "transparent", cursor: "pointer" }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((p) => {
              const selected = settings.activeColor.toLowerCase() === p.value.toLowerCase();
              return (
                <button
                  key={p.value}
                  onClick={() => onChange({ activeColor: p.value })}
                  aria-label={`Set highlight color to ${p.name}`}
                  title={p.name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: p.value,
                    border: selected
                      ? "2px solid var(--color-ink)"
                      : "1px solid var(--color-line)",
                    boxShadow: selected ? `0 0 0 2px #fff inset` : "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </section>

        <div
          className="flex flex-col gap-3 pt-4"
          style={{ borderTop: "1px solid var(--color-line)" }}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={settings.progressFill}
              onChange={(e) => onChange({ progressFill: e.target.checked })}
              style={{ width: 20, height: 20, marginTop: 3, cursor: "pointer", accentColor: "var(--color-blue-strong)" }}
            />
            <span className="flex-1">
              <div className="text-sm" style={SECTION_LABEL}>
                Progress fill
              </div>
              <div className="mt-0.5 text-xs" style={HELPER_TEXT}>
                Draws a bar under the active word that fills left-to-right as
                time elapses through its Whisper start/end window.
              </div>
            </span>
          </label>

          {settings.progressFill && (
            <label className="flex items-center gap-3 pl-8">
              <span className="flex-1 text-sm" style={SECTION_LABEL}>
                Fill color
              </span>
              <input
                type="color"
                value={settings.progressFillColor}
                onChange={(e) => onChange({ progressFillColor: e.target.value })}
                aria-label="Progress fill color"
                style={{
                  width: 56,
                  height: 36,
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                }}
              />
            </label>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={settings.showPinyin}
              onChange={(e) => onChange({ showPinyin: e.target.checked })}
              style={{ width: 20, height: 20, marginTop: 3, cursor: "pointer", accentColor: "var(--color-blue-strong)" }}
            />
            <span className="flex-1">
              <div className="text-sm" style={SECTION_LABEL}>
                Show pinyin
              </div>
              <div className="mt-0.5 text-xs" style={HELPER_TEXT}>
                Render tone-marked pinyin above each Chinese character in the
                transcript and caption overlay (Mandarin only).
              </div>
            </span>
          </label>

          {settings.showPinyin && (
            <label className="flex cursor-pointer items-start gap-3 pl-8">
              <input
                type="checkbox"
                checked={settings.highlightPinyin}
                onChange={(e) => onChange({ highlightPinyin: e.target.checked })}
                style={{ width: 20, height: 20, marginTop: 3, cursor: "pointer", accentColor: "var(--color-blue-strong)" }}
              />
              <span className="flex-1">
                <div className="text-sm" style={SECTION_LABEL}>
                  Highlight pinyin too
                </div>
                <div className="mt-0.5 text-xs" style={HELPER_TEXT}>
                  Extend the active-word color and bold to the pinyin row
                  above each character — not just the hanzi.
                </div>
              </span>
            </label>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={settings.captionOverlay}
              onChange={(e) => onChange({ captionOverlay: e.target.checked })}
              style={{ width: 20, height: 20, marginTop: 3, cursor: "pointer", accentColor: "var(--color-blue-strong)" }}
            />
            <span className="flex-1">
              <div className="text-sm" style={SECTION_LABEL}>
                Caption overlay
              </div>
              <div className="mt-0.5 text-xs" style={HELPER_TEXT}>
                Overlay the currently-playing line as a translucent caption
                on top of the video.
              </div>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
