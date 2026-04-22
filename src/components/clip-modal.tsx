"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import type ReactPlayerType from "react-player";
import { Modal } from "./ui/modal";
import { Button } from "@/components/ui/button";
import { ErrorCallout, parseApiError, type ApiError } from "./error-callout";
import type { VideoMeta, Word } from "@/types/transcript";

const FIELD_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontWeight: 700,
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-muted)",
};

const INPUT_STYLE: React.CSSProperties = {
  border: "1px solid var(--color-line)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-surface)",
  fontFamily: "var(--font-ui)",
  color: "var(--color-ink)",
  outline: "none",
};

export type ClipDraft = {
  /** Start of the first segment — used for seeking and the screenshot frame. */
  startSec: number;
  /** End of the last segment — display only. */
  endSec: number;
  sentence: string;
  words: Word[];
  /** Always populated. Length 1 → single-range card; length > 1 → concat card
   *  that the backend merges into a single MP3 via ffmpeg filter_complex. */
  segments: { startSec: number; endSec: number }[];
};

/**
 * Review + edit screen for a card pulled from the transcript selection.
 *
 * On open we capture a PNG frame from the underlying <video> element
 * (react-player's `getInternalPlayer()` returns the HTMLVideoElement when
 * the source is a local MP4, which we then draw to a canvas). The user
 * can re-capture, pick a target word, fill in translation / definition,
 * and hit Send — the rest is two server round-trips: clip audio, then
 * ship the Anki note.
 */
export function ClipModal({
  open,
  onClose,
  meta,
  clip,
  playerRef,
  language,
}: {
  open: boolean;
  onClose: () => void;
  meta: VideoMeta;
  clip: ClipDraft;
  playerRef: React.RefObject<ReactPlayerType | null>;
  language: string;
}) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [targetWord, setTargetWord] = useState<string>("");
  const [translation, setTranslation] = useState("");
  const [definition, setDefinition] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Default target word = longest content word in the selection. Usually
  // matches the word the user actually cares about.
  useEffect(() => {
    if (!open || targetWord) return;
    const longest = clip.words
      .map((w) => w.surface.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w.length > 0)
      .reduce((best, curr) => (curr.length > best.length ? curr : best), "");
    setTargetWord(longest);
  }, [open, clip.words, targetWord]);

  const captureScreenshot = useCallback(() => {
    const rp = playerRef.current;
    if (!rp) return;
    const internal = rp.getInternalPlayer?.();
    // For a local MP4 source, react-player wraps a plain <video>.
    const video = internal instanceof HTMLVideoElement ? internal : null;
    if (!video) {
      setError({
        message:
          "Screenshot unavailable — this usually means the video is streaming from YouTube instead of a local MP4. Check ingest logs.",
      });
      return;
    }
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    setScreenshot(dataUrl);
  }, [playerRef]);

  // Auto-capture on open, seeking to the clip's start first so the frame
  // actually matches the selection.
  useEffect(() => {
    if (!open) return;
    const rp = playerRef.current;
    if (!rp) return;
    try {
      rp.seekTo(clip.startSec, "seconds");
    } catch {
      // seekTo can throw if the player isn't ready yet — user can hit
      // the re-capture button once it's loaded.
    }
    // Wait a frame for the video element to repaint after the seek.
    const tid = setTimeout(captureScreenshot, 400);
    return () => clearTimeout(tid);
  }, [open, clip.startSec, playerRef, captureScreenshot]);

  // Reset state when the modal is re-opened on a new selection.
  useEffect(() => {
    if (open) return;
    setSuccess(false);
    setError(null);
  }, [open]);

  const uniqueWords = useMemo(() => {
    const seen = new Set<string>();
    return clip.words
      .map((w) => w.surface.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w && !seen.has(w) && (seen.add(w), true));
  }, [clip.words]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/anki", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoId: meta.videoId,
          title: meta.title,
          channel: meta.channel,
          language,
          // Multi-segment concat when length > 1; single range otherwise.
          // The backend accepts both shapes and picks clipAudio vs concat.
          segments: clip.segments,
          sentence: clip.sentence,
          words: clip.words,
          targetWord,
          translation,
          definition,
          // Prefer server-side frame extraction (cached on disk keyed by
          // timestamp). Canvas capture is sent as fallback for callers
          // where the video isn't locally cached.
          screenshotSec: clip.startSec,
          screenshotDataUrl: screenshot,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [meta, language, clip, targetWord, translation, definition, screenshot]);

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={success ? "Sent to Anki!" : "Review Anki card"}
      width={640}
    >
      {success ? (
        <div className="flex flex-col gap-3">
          <p className="text-base" style={{ fontFamily: "var(--font-ui)", color: "var(--color-ink)" }}>
            Added a new <strong>Timestamp Sentence</strong> note to the{" "}
            <strong>Timestamp</strong> deck. Happy reviewing.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" size="md" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span style={FIELD_LABEL}>Selection</span>
            <div
              className="px-3 py-2"
              style={{
                background: "var(--color-blue-soft)",
                color: "var(--color-blue-ink)",
                fontFamily: "var(--font-ui)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {clip.sentence}
            </div>
            <div
              className="mt-1 text-xs"
              style={{
                fontFamily: "var(--font-ui)",
                color: "var(--color-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {clip.segments.length > 1 ? (
                <>
                  {clip.segments.length} segments ·{" "}
                  {clip.segments
                    .reduce((acc, s) => acc + (s.endSec - s.startSec), 0)
                    .toFixed(2)}
                  s merged
                </>
              ) : (
                <>
                  {clip.startSec.toFixed(2)}s → {clip.endSec.toFixed(2)}s
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span style={FIELD_LABEL}>Screenshot</span>
              <Button variant="ghost" size="sm" onClick={captureScreenshot}>
                <Camera size={14} /> Re-capture
              </Button>
            </div>
            <div
              className="overflow-hidden"
              style={{
                border: "1px solid var(--color-line)",
                borderRadius: "var(--radius-sm)",
                background: "#000",
              }}
            >
              {screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={screenshot} alt="screenshot" style={{ width: "100%", display: "block" }} />
              ) : (
                <div
                  className="flex h-32 items-center justify-center text-sm text-white"
                  style={{ fontFamily: "var(--font-ui)" }}
                >
                  Capturing…
                </div>
              )}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span style={FIELD_LABEL}>Target word</span>
            <select
              value={targetWord}
              onChange={(e) => setTargetWord(e.target.value)}
              className="px-3 py-2 text-base"
              style={INPUT_STYLE}
            >
              {uniqueWords.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span style={FIELD_LABEL}>Translation</span>
            <textarea
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              rows={2}
              placeholder="English translation of the sentence"
              className="px-3 py-2 text-base"
              style={INPUT_STYLE}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span style={FIELD_LABEL}>Target word definition</span>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              rows={2}
              placeholder="e.g. (verb) to remember; to recall. HTML allowed."
              className="px-3 py-2 text-base"
              style={INPUT_STYLE}
            />
          </label>

          {error && <ErrorCallout error={error} />}

          <div className="mt-2 flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={busy || !targetWord}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Sending…
                </>
              ) : (
                "Send to Anki"
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
