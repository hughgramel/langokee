"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "@/components/ui/button";
import { ErrorCallout, parseApiError, type ApiError } from "./error-callout";
import { LANGUAGES, type LangCode } from "@/lib/languages";
import type { VideoMeta } from "@/types/transcript";

type ProbeResult = {
  id: string;
  title: string;
  duration: number;
  videoHeights: number[];
  audioLanguages: string[];
  manualSubtitles: string[];
  autoSubtitles: string[];
};

export type TrackPicks = {
  maxHeight?: number;
  audioLanguage?: string;
  subtitleLanguages?: string[];
};

const INPUT_STYLE: React.CSSProperties = {
  border: "1px solid var(--color-line)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-surface)",
  fontFamily: "var(--font-ui)",
  color: "var(--color-ink)",
  outline: "none",
};

/**
 * URL + language + pasted text.
 *
 * The text is required. Under the hood we run wav2vec2 forced alignment on
 * the audio against the paste — no open-vocabulary ASR. This keeps the
 * timings accurate regardless of whether the source is a song, a lecture,
 * or a dialogue, as long as the user can hand us the ground-truth text.
 *
 * "Fetch captions" is a convenience: when the uploader attached a manual
 * caption track in the chosen language, we download and parse it, then
 * drop it into the textarea so the user can review before aligning. We
 * don't pull auto-captions — those are YouTube's own ASR and would
 * reintroduce the hallucinations we built this around avoiding.
 */
export type UploadFormValues = {
  url: string;
  language: LangCode;
  text: string;
  picks: TrackPicks;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found" }
  | { kind: "not-found" }
  | { kind: "error"; apiError: ApiError };

export function UploadModal({
  open,
  onClose,
  onSubmit,
  busy,
  error,
  initialUrl,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: UploadFormValues) => void;
  busy: boolean;
  error: string | ApiError | null;
  /**
   * Prefill the URL field — used when opening from a history cache miss
   * so the user only needs to paste text.
   */
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [language, setLanguage] = useState<LangCode>("es");
  const [text, setText] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<ApiError | null>(null);
  const [picks, setPicks] = useState<TrackPicks>({});

  // Sync URL when modal reopens with a new prefill (history cache miss).
  useEffect(() => {
    if (open && initialUrl) setUrl(initialUrl);
  }, [open, initialUrl]);

  // Clear any stale fetch feedback when the user changes inputs — the
  // "captions available" / "not available" hint only makes sense for the
  // (url, language) combo that was last queried.
  useEffect(() => {
    setFetchState({ kind: "idle" });
  }, [url, language]);

  // Any URL edit invalidates the probe — picker choices only apply to the
  // video we actually probed.
  useEffect(() => {
    setProbe(null);
    setPicks({});
    setProbeError(null);
  }, [url]);

  const canSubmit = url.trim().length > 0 && text.trim().length > 0 && !busy;
  const canFetch =
    url.trim().length > 0 && !busy && fetchState.kind !== "loading";

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ url: url.trim(), language, text, picks });
  };

  const runProbe = async () => {
    if (!url.trim()) return;
    setProbing(true);
    setProbeError(null);
    try {
      const res = await fetch("/api/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        setProbeError(await parseApiError(res));
        return;
      }
      const result = (await res.json()) as ProbeResult;
      setProbe(result);
    } catch (err) {
      setProbeError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setProbing(false);
    }
  };

  const fetchCaptions = async () => {
    setFetchState({ kind: "loading" });
    try {
      // Ingest first: captions live on disk alongside the video, written by
      // yt-dlp during download. If we've never fetched this URL, we have
      // nothing to parse. ingest is idempotent for cached videos, so the
      // second call on history re-opens is effectively free.
      const ingestRes = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...picks }),
      });
      if (!ingestRes.ok) {
        setFetchState({ kind: "error", apiError: await parseApiError(ingestRes) });
        return;
      }
      const meta = (await ingestRes.json()) as VideoMeta;

      const capRes = await fetch(
        `/api/captions?videoId=${encodeURIComponent(meta.videoId)}&language=${encodeURIComponent(language)}`,
      );
      if (capRes.status === 404) {
        setFetchState({ kind: "not-found" });
        return;
      }
      if (!capRes.ok) {
        setFetchState({ kind: "error", apiError: await parseApiError(capRes) });
        return;
      }
      const { text: captionText } = (await capRes.json()) as { text: string };
      setText(captionText);
      setFetchState({ kind: "found" });
    } catch (err) {
      setFetchState({
        kind: "error",
        apiError: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  const canProbe = url.trim().length > 0 && !busy && !probing;

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title="Load a YouTube video" width={560}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm" style={{ fontWeight: 700, color: "var(--color-ink)" }}>
            YouTube URL
          </span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canSubmit) submit();
            }}
            disabled={busy}
            className="px-3 py-2 text-base"
            style={INPUT_STYLE}
            autoFocus
          />
          <div className="mt-1 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={runProbe} disabled={!canProbe}>
              {probing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Probing…
                </>
              ) : (
                <>
                  <Search size={14} /> Check available tracks
                </>
              )}
            </Button>
            {probe && (
              <span className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-ui)" }}>
                {Math.round(probe.duration)}s · {probe.videoHeights.length} video
                {probe.videoHeights.length === 1 ? " format" : " formats"} ·{" "}
                {probe.audioLanguages.length || 1} audio lang
              </span>
            )}
          </div>
          {probeError && (
            <div className="mt-1">
              <ErrorCallout error={probeError} />
            </div>
          )}
        </label>

        {probe && (
          <TrackPicker
            probe={probe}
            picks={picks}
            onChange={setPicks}
            disabled={busy}
            targetLanguage={language}
          />
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm" style={{ fontWeight: 700, color: "var(--color-ink)" }}>
            Target language
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LangCode)}
            disabled={busy}
            className="px-3 py-2 text-base"
            style={INPUT_STYLE}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag}  {l.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm" style={{ fontWeight: 700, color: "var(--color-ink)" }}>
              Lyrics or transcript
            </span>
            <span data-testid="fetch-captions">
              <Button variant="ghost" size="sm" onClick={fetchCaptions} disabled={!canFetch}>
                {fetchState.kind === "loading" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Fetching…
                  </>
                ) : (
                  <>
                    <Download size={14} /> Fetch captions
                  </>
                )}
              </Button>
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the known lyrics or transcript here, one line per line. We'll align it to the audio — no ASR, so no hallucinations."
            disabled={busy}
            rows={8}
            className="px-3 py-2 text-sm"
            style={{ ...INPUT_STYLE, resize: "vertical" }}
          />
          <FetchFeedback state={fetchState} />
          <span className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>
            LRC timestamps, [Chorus]-style tags, speaker labels, and HTML are stripped automatically.
          </span>
        </div>

        {error && <ErrorCallout error={error} />}

        <div className="mt-2 flex items-center justify-end gap-3">
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Aligning…
              </>
            ) : (
              "Align"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * yt-dlp reports non-language "subtitle tracks" that aren't useful to us
 * (live_chat replay, rechat, etc.). Filter them so the picker isn't noisy.
 */
function isRealSubtitleLang(lang: string): boolean {
  return !/^(live_chat|rechat)$/i.test(lang);
}

function TrackPicker({
  probe,
  picks,
  onChange,
  disabled,
  targetLanguage,
}: {
  probe: ProbeResult;
  picks: TrackPicks;
  onChange: (p: TrackPicks) => void;
  disabled: boolean;
  targetLanguage: string;
}) {
  const manual = probe.manualSubtitles.filter(isRealSubtitleLang);
  const auto = probe.autoSubtitles.filter(isRealSubtitleLang);
  // Order: manual first (higher quality), then auto. No de-dupe needed for
  // a single-select picker — same lang appearing in both lists is fine, we
  // just pick manual when available.
  const subOptions: { lang: string; isAuto: boolean }[] = [
    ...manual.map((lang) => ({ lang, isAuto: false })),
    ...auto.filter((l) => !manual.includes(l)).map((lang) => ({ lang, isAuto: true })),
  ];
  // Initial pick: the target language if available (manual preferred, else
  // auto), else the first manual sub, else none.
  const base = targetLanguage.slice(0, 2).toLowerCase();
  const defaultSub =
    manual.find((l) => l.toLowerCase().startsWith(base)) ??
    auto.find((l) => l.toLowerCase().startsWith(base)) ??
    manual[0] ??
    "";
  // `picks.subtitleLanguages` is an array on the wire (yt-dlp supports
  // multi-download) but the UI is single-select — we only ever set it to
  // either `[]` (none) or `[picked]`.
  const pickedSub = picks.subtitleLanguages?.[0] ?? defaultSub;
  const setSub = (lang: string) =>
    onChange({ ...picks, subtitleLanguages: lang ? [lang] : [] });

  return (
    <div
      className="flex flex-col gap-3 px-3 py-3"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div
        className="text-xs"
        style={{ fontWeight: 700, color: "var(--color-ink)", fontFamily: "var(--font-ui)" }}
      >
        Track selection
      </div>

      {probe.videoHeights.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-ui)" }}>
            Video quality
          </span>
          <select
            value={picks.maxHeight ?? 720}
            onChange={(e) => onChange({ ...picks, maxHeight: Number(e.target.value) })}
            disabled={disabled}
            className="px-2 py-1 text-sm"
            style={INPUT_STYLE}
          >
            {probe.videoHeights
              .filter((h) => h <= 1080)
              .map((h) => (
                <option key={h} value={h}>
                  ≤ {h}p
                </option>
              ))}
          </select>
        </label>
      )}

      {probe.audioLanguages.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-ui)" }}>
            Audio track
          </span>
          <select
            value={picks.audioLanguage ?? ""}
            onChange={(e) =>
              onChange({ ...picks, audioLanguage: e.target.value || undefined })
            }
            disabled={disabled}
            className="px-2 py-1 text-sm"
            style={INPUT_STYLE}
          >
            <option value="">Original</option>
            {probe.audioLanguages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}

      {subOptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--color-muted)", fontFamily: "var(--font-ui)" }}>
            Subtitles — {manual.length} manual, {auto.length} auto-gen
          </span>
          <select
            value={pickedSub}
            onChange={(e) => setSub(e.target.value)}
            disabled={disabled}
            className="px-2 py-1 text-sm"
            style={INPUT_STYLE}
          >
            <option value="">None (skip)</option>
            {manual.length > 0 && (
              <optgroup label="Manual (uploader-provided)">
                {manual.map((lang) => (
                  <option key={`m-${lang}`} value={lang}>
                    {lang}
                  </option>
                ))}
              </optgroup>
            )}
            {auto.length > 0 && (
              <optgroup label="Auto-generated (YouTube ASR)">
                {auto
                  .filter((l) => !manual.includes(l))
                  .map((lang) => (
                    <option key={`a-${lang}`} value={lang}>
                      {lang}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
    </div>
  );
}

function FetchFeedback({ state }: { state: FetchState }) {
  if (state.kind === "idle" || state.kind === "loading") return null;
  if (state.kind === "error") {
    // Dedicated callout so install instructions render properly for
    // MISSING_BINARY / ANKI_DOWN responses.
    return (
      <div className="mt-1">
        <ErrorCallout error={state.apiError} />
      </div>
    );
  }
  // Design-overhaul accents: mint for success, amber-soft for warn. Text
  // color echoes the token family (mint) or `--color-ink` on the yellow
  // warn background for readable contrast.
  const palette = {
    found: {
      bg: "var(--color-mint-soft)",
      fg: "var(--color-mint)",
      border: "var(--color-mint)",
    },
    "not-found": {
      bg: "var(--color-amber-soft)",
      fg: "var(--color-ink)",
      border: "var(--color-amber)",
    },
  }[state.kind];
  const message =
    state.kind === "found"
      ? "Captions loaded. Review and edit before aligning."
      : "No manual captions for this language — paste the text instead.";
  return (
    <div
      className="mt-1 px-2 py-1 text-xs"
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        borderRadius: "var(--radius-sm)",
      }}
    >
      {message}
    </div>
  );
}
