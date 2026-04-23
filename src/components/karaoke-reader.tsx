"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type ReactPlayerType from "react-player";
import { PanelRight, PanelRightClose, Sparkles, X } from "lucide-react";
import {
  ReactPlayer,
  type ReactPlayerProgressState,
} from "./react-player-wrapper";
import { ClipModal, type ClipDraft } from "./clip-modal";
import { RubyWord } from "./ruby-word";
import { Button } from "@/components/ui/button";
import {
  activeWordInlineStyle,
  type ReaderSettings,
} from "@/lib/reader-settings";
import type { Segment, Transcript, VideoMeta, Word } from "@/types/transcript";

/**
 * Karaoke-style reader. Layout mirrors LangoBee's YouTube reader:
 * desktop puts the video on the left and a transcript sidebar on the
 * right; mobile stacks them.
 *
 * The active word is found with a binary search over the flattened
 * words array on each onProgress tick — O(log n) each, so even long
 * lectures stay smooth.
 *
 * Click any word to seek. Long-press (or mouse-drag) across multiple
 * words to build a clip range; the Clip button then opens the review
 * modal where the user fills in translation / target / definition and
 * ships the note to Anki.
 */

/** Flat-word view of the transcript — keeps the per-word karaoke sync
 *  O(log N) via binary search, and the drag selection dead simple. */
type FlatWord = Word & { segIdx: number; globalIdx: number };

function flattenWords(segments: Segment[]): FlatWord[] {
  const out: FlatWord[] = [];
  segments.forEach((s, segIdx) => {
    for (const w of s.words) {
      out.push({ ...w, segIdx, globalIdx: out.length });
    }
  });
  return out;
}

/** Binary search: index of the last word whose start <= t, or -1. */
function findActiveWord(words: FlatWord[], t: number): number {
  if (!words.length || t < words[0]!.start) return -1;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (words[mid]!.start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

/** CJK + Thai don't use inter-word spaces; inserting one visually breaks the line. */
function isUnspacedLanguage(lang: string): boolean {
  const base = lang.slice(0, 2).toLowerCase();
  return base === "zh" || base === "ja" || base === "th";
}

/**
 * Thick blue bar under the active word. Ported from LangoBee's word-span:
 * CSS `text-decoration: underline` is too thin to see under wide CJK
 * strokes, so we position the bar absolutely. The parent span must be
 * `position: relative`; the bar is `pointer-events: none` so it doesn't
 * eat clicks meant for the word.
 */
function ActiveWordBar({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: 4,
        right: 4,
        bottom: -3,
        height: 3,
        borderRadius: 2,
        backgroundColor: color,
        pointerEvents: "none",
      }}
    />
  );
}

export function KaraokeReader({
  meta,
  transcript,
  settings,
}: {
  meta: VideoMeta;
  transcript: Transcript;
  /** Reader settings are owned by the page so the settings button can live
   *  in the top header. The reader is a pure consumer. */
  settings: ReaderSettings;
}) {
  const flat = useMemo(() => flattenWords(transcript.segments), [transcript.segments]);
  const segOffsets = useMemo(() => {
    const offs: number[] = [];
    let running = 0;
    for (const s of transcript.segments) {
      offs.push(running);
      running += s.words.length;
    }
    return offs;
  }, [transcript.segments]);

  const playerRef = useRef<ReactPlayerType | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [duration, setDuration] = useState(meta.duration);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Selection by globalIdx. Start is the anchor, end walks with the drag.
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [clipOpen, setClipOpen] = useState(false);
  /** Segment-level multi-select for concat cards (independent of word drag). */
  const [selectedSegs, setSelectedSegs] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Drive the active-word lookup from requestAnimationFrame rather than
  // react-player's onProgress ticks. onProgress is a setTimeout loop
  // (default 1s, we were forcing 30ms) — setTimeout drifts and caps out
  // at ~250Hz in most browsers even at tiny intervals. rAF is aligned to
  // the display vsync (16.67ms at 60Hz, 8.33ms at 120Hz) and never fires
  // faster than the screen can actually paint. Combined with a direct
  // `getCurrentTime()` read each frame, the highlight tracks the audio
  // as tightly as the monitor allows. onProgress is kept only as a
  // safety net for seek / buffer-state updates while paused.
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      const t = playerRef.current?.getCurrentTime?.();
      if (typeof t === "number" && Number.isFinite(t)) {
        setCurrentSec(t);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  const activeIdx = useMemo(() => findActiveWord(flat, currentSec), [flat, currentSec]);

  const handleProgress = useCallback((state: ReactPlayerProgressState) => {
    setCurrentSec(state.playedSeconds);
  }, []);
  const handleDuration = useCallback((d: number) => {
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, []);

  const seek = useCallback((t: number) => {
    playerRef.current?.seekTo(t, "seconds");
    setCurrentSec(t);
    setPlaying(true);
  }, []);

  // Drag selection across word spans. Pointer events handle touch+mouse.
  const draggingRef = useRef(false);
  const onWordPointerDown = useCallback((globalIdx: number, e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelStart(globalIdx);
    setSelEnd(globalIdx);
  }, []);
  const onWordPointerEnter = useCallback((globalIdx: number) => {
    if (!draggingRef.current) return;
    setSelEnd(globalIdx);
  }, []);
  const onWordPointerUp = useCallback(
    (globalIdx: number) => {
      const wasDragging = draggingRef.current;
      draggingRef.current = false;
      if (!wasDragging) return;
      // If the pointer didn't move, treat it as a single-word click →
      // seek to that word and clear the 1-word selection after a tick.
      if (selStart === globalIdx && selEnd === globalIdx) {
        const w = flat[globalIdx];
        if (w) seek(w.start);
        setSelStart(null);
        setSelEnd(null);
      }
    },
    [flat, seek, selStart, selEnd],
  );

  const selRange = useMemo(() => {
    if (selStart == null || selEnd == null) return null;
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);
    return { lo, hi };
  }, [selStart, selEnd]);

  /**
   * Active clip for the modal. Priority order:
   *   1. Segment-level multi-select (from sidebar checkboxes) — becomes a
   *      concat card spanning N disjoint ranges.
   *   2. Word-range drag selection — classic single-range card.
   *
   * Both surface as the same ClipDraft shape (always a `segments` array);
   * the API picks clipAudio vs clipAudioConcat based on length.
   */
  const clipData = useMemo<ClipDraft | null>(() => {
    // Multi-segment path first: any checked segments wins over drag-select.
    if (selectedSegs.size > 0) {
      const sorted = [...selectedSegs].sort((a, b) => a - b);
      const pieces = sorted
        .map((sIdx) => transcript.segments[sIdx])
        .filter((s): s is Segment => Boolean(s) && s.words.length > 0);
      if (pieces.length === 0) return null;
      const segments = pieces.map((s) => ({
        startSec: s.words[0]!.start,
        endSec: s.words[s.words.length - 1]!.end,
      }));
      const allWords: Word[] = pieces.flatMap((s) =>
        s.words.map((w) => ({
          surface: w.surface,
          start: w.start,
          end: w.end,
          lemma: w.lemma,
        })),
      );
      const sentence = pieces.map((s) => s.words.map((w) => w.surface).join(" ")).join(" / ");
      return {
        startSec: segments[0]!.startSec,
        endSec: segments[segments.length - 1]!.endSec,
        sentence,
        words: allWords,
        segments,
      };
    }
    if (!selRange) return null;
    const { lo, hi } = selRange;
    if (hi <= lo) return null;
    const first = flat[lo]!;
    const last = flat[hi]!;
    const sliceWords = flat.slice(lo, hi + 1);
    const sentence = sliceWords.map((w) => w.surface).join(" ");
    return {
      startSec: first.start,
      endSec: last.end,
      sentence,
      words: sliceWords.map((w) => ({
        surface: w.surface,
        start: w.start,
        end: w.end,
        lemma: w.lemma,
      })),
      segments: [{ startSec: first.start, endSec: last.end }],
    };
  }, [flat, selRange, selectedSegs, transcript.segments]);

  const clearSelection = useCallback(() => {
    setSelStart(null);
    setSelEnd(null);
    setSelectedSegs(new Set());
  }, []);

  const toggleSegSelected = useCallback((sIdx: number) => {
    setSelectedSegs((prev) => {
      const next = new Set(prev);
      if (next.has(sIdx)) next.delete(sIdx);
      else next.add(sIdx);
      return next;
    });
  }, []);

  // Open ClipModal for a single segment — called from the sidebar per-row
  // "Mark card" button and the video hover button. Deliberately does NOT
  // touch selectedSegs: the multi-select gesture is separate from "quickly
  // card this one", and polluting the checkbox state would surprise users.
  const markSegmentCard = useCallback(
    (sIdx: number) => {
      const seg = transcript.segments[sIdx];
      if (!seg || seg.words.length === 0) return;
      const lo = segOffsets[sIdx]!;
      const hi = lo + seg.words.length - 1;
      setSelectedSegs(new Set()); // clear any prior multi-select
      setSelStart(lo);
      setSelEnd(hi);
      setPlaying(false);
      setClipOpen(true);
    },
    [transcript.segments, segOffsets],
  );

  // "Make merged card" from the sidebar multi-select toolbar.
  const markMultiCard = useCallback(() => {
    if (selectedSegs.size === 0) return;
    setPlaying(false);
    setClipOpen(true);
  }, [selectedSegs]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div
        className={
          isDesktop
            ? "flex flex-row gap-6"
            : "flex flex-col gap-4"
        }
        style={isDesktop ? { minHeight: "76vh" } : {}}
      >
        {/* Video column */}
        <div className="flex flex-col gap-3" style={{ flex: "1 1 0", minWidth: 0 }}>
          <VideoCard
            videoUrl={meta.videoUrl}
            playerRef={playerRef}
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onProgress={handleProgress}
            onDuration={handleDuration}
            overlaySegment={
              settings.captionOverlay && activeIdx >= 0
                ? transcript.segments[flat[activeIdx]!.segIdx]
                : null
            }
            overlayActiveWordIdx={
              settings.captionOverlay && activeIdx >= 0
                ? activeIdx - segOffsets[flat[activeIdx]!.segIdx]!
                : -1
            }
            settings={settings}
            language={transcript.language}
            onMarkCurrentSegment={
              activeIdx >= 0
                ? () => markSegmentCard(flat[activeIdx]!.segIdx)
                : null
            }
          />

          <Scrubber currentTime={currentSec} duration={duration} onSeek={seek} />

          <div
            className="flex items-center gap-3"
            style={{ fontFamily: "var(--font-ui)", letterSpacing: "-0.01em" }}
          >
            <div
              className="flex-1 truncate text-lg"
              style={{ fontWeight: 800, color: "var(--color-ink)" }}
            >
              {meta.title}
            </div>
            {meta.channel && (
              <div
                className="truncate text-sm"
                style={{ color: "var(--color-muted)", fontWeight: 600 }}
              >
                {meta.channel}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="play-pause">
              <Button variant="primary" size="md" onClick={() => setPlaying((p) => !p)}>
                {playing ? "Pause" : "Play"}
              </Button>
            </span>
            <span data-testid="make-anki-card">
              <Button
                variant="primary"
                size="md"
                disabled={!clipData}
                onClick={() => {
                  if (!clipData) return;
                  setPlaying(false);
                  setClipOpen(true);
                }}
              >
                Make Anki card
              </Button>
            </span>
            {(selRange || selectedSegs.size > 0) && (
              <Button variant="ghost" size="md" onClick={clearSelection}>
                Clear
              </Button>
            )}
            {isDesktop && (
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setSidebarOpen((v) => !v)}
                >
                  {sidebarOpen ? (
                    <>
                      <PanelRightClose size={16} /> Hide transcript
                    </>
                  ) : (
                    <>
                      <PanelRight size={16} /> Show transcript
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Transcript column */}
        {(sidebarOpen || !isDesktop) && (
          <div
            className="flex flex-col overflow-hidden"
            style={{
              flex: isDesktop ? "0 0 360px" : "1 1 auto",
              width: isDesktop ? "360px" : "100%",
              maxHeight: isDesktop ? "76vh" : "60vh",
              background: "#ffffff",
              border: "1px solid var(--color-line)",
              borderRadius: "var(--radius)",
            }}
          >
            <TranscriptPanel
              segments={transcript.segments}
              segOffsets={segOffsets}
              flat={flat}
              activeIdx={activeIdx}
              currentSec={currentSec}
              settings={settings}
              selRange={selRange}
              selectedSegs={selectedSegs}
              onToggleSegSelected={toggleSegSelected}
              onMarkSegmentCard={markSegmentCard}
              onMarkMultiCard={markMultiCard}
              onClearMultiSelect={() => setSelectedSegs(new Set())}
              onWordPointerDown={onWordPointerDown}
              onWordPointerEnter={onWordPointerEnter}
              onWordPointerUp={onWordPointerUp}
              onSeekSegment={seek}
              transcriptLanguage={transcript.language}
            />
          </div>
        )}
      </div>

      {clipData && (
        <ClipModal
          open={clipOpen}
          onClose={() => setClipOpen(false)}
          meta={meta}
          clip={clipData}
          playerRef={playerRef}
          language={transcript.language}
        />
      )}
    </div>
  );
}

// ───── Video card ────────────────────────────────────────────────────────

function VideoCard({
  videoUrl,
  playerRef,
  playing,
  onPlay,
  onPause,
  onEnded,
  onProgress,
  onDuration,
  overlaySegment,
  overlayActiveWordIdx,
  settings,
  language,
  onMarkCurrentSegment,
}: {
  videoUrl: string;
  playerRef: React.RefObject<ReactPlayerType | null>;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onProgress: (state: ReactPlayerProgressState) => void;
  onDuration: (d: number) => void;
  overlaySegment: Segment | null;
  overlayActiveWordIdx: number;
  settings: ReaderSettings;
  language: string;
  /** Card the currently-playing segment. Null until we know which segment
   *  the clock is inside — e.g. before first play on an unstarted video. */
  onMarkCurrentSegment: (() => void) | null;
}) {
  const unspaced = isUnspacedLanguage(language);
  const activeInline = activeWordInlineStyle(settings);
  const showBar = settings.activeStyle === "underline";
  // Overlay reads slightly larger than the transcript for legibility over
  // video — preserves the default (22px) when the transcript preset is M (17).
  const overlayFontSize = settings.fontSize + 5;
  return (
    <div
      className="video-wrapper relative w-full overflow-hidden"
      style={{
        aspectRatio: "16 / 9",
        background: "#000",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius)",
      }}
    >
      {onMarkCurrentSegment && (
        <button
          type="button"
          className="video-hover-btn"
          onClick={onMarkCurrentSegment}
          aria-label="Mark current segment as card"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 3,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(0,0,0,0.72)",
            color: "#fff",
            fontFamily: "var(--font-ui)",
            fontWeight: 700,
            fontSize: 12,
            border: "1px solid rgba(255,255,255,0.24)",
            cursor: "pointer",
          }}
        >
          <Sparkles size={14} /> Mark card
        </button>
      )}
      <ReactPlayer
        playerRef={playerRef}
        url={videoUrl}
        playing={playing}
        controls
        // Browsers block unmuted autoplay without a user gesture; the
        // `Play` button in the toolbar IS a gesture, so starting muted
        // isn't needed here. Explicitly leave `muted` unset so YouTube
        // honours the user's volume preference.
        //
        // onProgress is our fallback tick for seek / buffer-state
        // changes while paused. The primary highlight loop is a rAF
        // driver reading `getCurrentTime()` directly — see the effect
        // in KaraokeReader. 250ms is plenty for the fallback role and
        // keeps postMessage traffic with the YouTube iframe minimal.
        progressInterval={250}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onProgress={onProgress}
        onDuration={onDuration}
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      />
      {overlaySegment && (
        <div className="caption-overlay">
          <div className="caption-overlay-inner" style={{ fontSize: overlayFontSize }}>
            {overlaySegment.words.map((w, i) => {
              const isActive = i === overlayActiveWordIdx;
              return (
                <span
                  key={i}
                  data-active={isActive ? "true" : undefined}
                  data-highlight-pinyin={
                    isActive && settings.highlightPinyin ? "true" : undefined
                  }
                  style={{
                    position: "relative",
                    padding: "0 4px",
                    display: "inline-block",
                    ...(isActive && settings.highlightPinyin
                      ? ({ "--pinyin-highlight-color": settings.activeColor } as React.CSSProperties)
                      : undefined),
                    ...(isActive ? activeInline : undefined),
                  }}
                >
                  <RubyWord token={w.surface} language={language} showReading={settings.showPinyin} />
                  {isActive && showBar && <ActiveWordBar color={settings.activeColor} />}
                  {!unspaced && i < overlaySegment.words.length - 1 ? " " : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ───── Scrubber ──────────────────────────────────────────────────────────

function Scrubber({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const displayTime = dragTime ?? currentTime;
  const safeDuration = duration > 0 ? duration : 0;
  const ratio =
    safeDuration > 0 ? Math.min(1, Math.max(0, displayTime / safeDuration)) : 0;

  const computeTime = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || safeDuration <= 0) return 0;
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return pct * safeDuration;
    },
    [safeDuration],
  );

  return (
    <div
      className="flex items-center gap-3"
      style={{
        fontFamily: "var(--font-ui)",
        fontWeight: 700,
        fontSize: 13,
        fontVariantNumeric: "tabular-nums",
        color: "var(--color-ink)",
        userSelect: "none",
      }}
    >
      <span style={{ minWidth: 44, textAlign: "right" }}>{formatTime(displayTime)}</span>
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          if (safeDuration <= 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          setDragTime(computeTime(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          setDragTime(computeTime(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          const t = computeTime(e.clientX);
          setDragTime(null);
          onSeek(t);
        }}
        style={{
          flex: 1,
          height: 18,
          background: "var(--color-blue-soft)",
          borderRadius: 14,
          position: "relative",
          cursor: safeDuration > 0 ? "pointer" : "default",
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background: "var(--color-blue-strong)",
            borderRadius: 14,
            transition: dragTime !== null ? "none" : "width 0.2s ease-out",
          }}
        />
      </div>
      <span style={{ minWidth: 44 }}>{formatTime(safeDuration)}</span>
    </div>
  );
}

// ───── Transcript panel ──────────────────────────────────────────────────

function TranscriptPanel({
  segments,
  segOffsets,
  flat,
  activeIdx,
  currentSec,
  settings,
  selRange,
  selectedSegs,
  onToggleSegSelected,
  onMarkSegmentCard,
  onMarkMultiCard,
  onClearMultiSelect,
  onWordPointerDown,
  onWordPointerEnter,
  onWordPointerUp,
  onSeekSegment,
  transcriptLanguage,
}: {
  segments: Segment[];
  segOffsets: number[];
  flat: FlatWord[];
  activeIdx: number;
  currentSec: number;
  settings: ReaderSettings;
  selRange: { lo: number; hi: number } | null;
  selectedSegs: Set<number>;
  onToggleSegSelected: (sIdx: number) => void;
  onMarkSegmentCard: (sIdx: number) => void;
  onMarkMultiCard: () => void;
  onClearMultiSelect: () => void;
  onWordPointerDown: (globalIdx: number, e: React.PointerEvent) => void;
  onWordPointerEnter: (globalIdx: number) => void;
  onWordPointerUp: (globalIdx: number) => void;
  onSeekSegment: (t: number) => void;
  transcriptLanguage: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSegIdx = activeIdx >= 0 ? flat[activeIdx]?.segIdx ?? -1 : -1;
  const unspaced = isUnspacedLanguage(transcriptLanguage);

  // Auto-scroll the transcript to keep the active segment in view.
  useEffect(() => {
    if (activeSegIdx < 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-seg-idx="${activeSegIdx}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSegIdx]);

  const activeWord = activeIdx >= 0 ? flat[activeIdx] : null;
  const fillPct = activeWord
    ? clamp(
        (currentSec - activeWord.start) /
          Math.max(0.001, activeWord.end - activeWord.start),
        0,
        1,
      ) * 100
    : 0;

  const activeInline = activeWordInlineStyle(settings);
  const showBar = settings.activeStyle === "underline";

  const multiCount = selectedSegs.size;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {multiCount > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            borderBottom: "1px solid var(--color-line)",
            background: "var(--color-blue-soft)",
            fontFamily: "var(--font-ui)",
          }}
        >
          <span className="text-sm" style={{ fontWeight: 700, color: "var(--color-blue-ink)" }}>
            {multiCount} segment{multiCount === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={onMarkMultiCard}>
              <Sparkles size={14} /> Make merged card
            </Button>
            <Button variant="ghost" size="sm" onClick={onClearMultiSelect}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: settings.fontSize,
          color: "var(--color-ink)",
          lineHeight: 1.7,
        }}
      >
      {segments.map((seg, sIdx) => {
        const isActive = sIdx === activeSegIdx;
        const isChecked = selectedSegs.has(sIdx);
        return (
          <div
            key={sIdx}
            data-seg-idx={sIdx}
            className="segment-row mb-2 flex gap-2 p-2"
            style={{
              background: isActive ? "var(--color-blue-soft)" : "transparent",
              borderRadius: "var(--radius-sm)",
              transition: "background 0.15s",
            }}
          >
            <div
              style={{ width: 20, flexShrink: 0, paddingTop: 4 }}
              aria-hidden={!isChecked ? "true" : undefined}
            >
              <input
                type="checkbox"
                className="segment-check"
                data-checked={isChecked ? "true" : undefined}
                checked={isChecked}
                onChange={() => onToggleSegSelected(sIdx)}
                aria-label={`Select segment at ${formatTime(seg.start)}`}
                style={{
                  width: 16,
                  height: 16,
                  cursor: "pointer",
                  accentColor: "var(--color-blue-strong)",
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center">
                <button
                  onClick={() => onSeekSegment(seg.start)}
                  className="text-xs"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontWeight: 700,
                    color: "var(--color-muted)",
                    fontVariantNumeric: "tabular-nums",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {formatTime(seg.start)}
                </button>
                <button
                  type="button"
                  onClick={() => onMarkSegmentCard(sIdx)}
                  className="segment-mark ml-auto"
                  aria-label="Mark segment as card"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 6px",
                    fontSize: 11,
                    fontFamily: "var(--font-ui)",
                    fontWeight: 700,
                    color: "var(--color-blue-ink)",
                    background: "#ffffff",
                    border: "1px solid var(--color-blue-strong)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  <Sparkles size={12} /> Card
                </button>
              </div>
              <div style={{ userSelect: "none" }}>
              {seg.words.map((w, wi) => {
                const globalIdx = segOffsets[sIdx]! + wi;
                const isActiveWord = globalIdx === activeIdx;
                const isSelected =
                  selRange != null && globalIdx >= selRange.lo && globalIdx <= selRange.hi;
                const isLast = wi === seg.words.length - 1;
                return (
                  <span
                    key={wi}
                    data-word-idx={globalIdx}
                    data-active={isActiveWord ? "true" : undefined}
                    data-highlight-pinyin={
                      isActiveWord && settings.highlightPinyin ? "true" : undefined
                    }
                    className={`kw${isSelected ? " selected" : ""}`}
                    style={{
                      position: "relative",
                      display: "inline-block",
                      padding: "2px 4px",
                      ...(isActiveWord && settings.highlightPinyin
                        ? ({ "--pinyin-highlight-color": settings.activeColor } as React.CSSProperties)
                        : undefined),
                      ...(isActiveWord ? activeInline : undefined),
                    }}
                    onPointerDown={(e) => onWordPointerDown(globalIdx, e)}
                    onPointerEnter={() => onWordPointerEnter(globalIdx)}
                    onPointerUp={() => onWordPointerUp(globalIdx)}
                  >
                    <RubyWord
                      token={w.surface}
                      language={transcriptLanguage}
                      showReading={settings.showPinyin}
                    />
                    {isActiveWord && showBar && <ActiveWordBar color={settings.activeColor} />}
                    {isActiveWord && settings.progressFill && (
                      <span
                        className="kw-fill"
                        style={{
                          width: `${fillPct}%`,
                          background: settings.progressFillColor,
                        }}
                      />
                    )}
                    {!unspaced && !isLast ? " " : ""}
                  </span>
                );
              })}
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
