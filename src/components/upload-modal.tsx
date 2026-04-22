"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "@/components/ui/button";
import { LANGUAGES, type LangCode } from "@/lib/languages";
import type { VideoMeta } from "@/types/transcript";

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
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found" }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

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
  error: string | null;
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

  const canSubmit = url.trim().length > 0 && text.trim().length > 0 && !busy;
  const canFetch =
    url.trim().length > 0 && !busy && fetchState.kind !== "loading";

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ url: url.trim(), language, text });
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
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!ingestRes.ok) {
        const body = await ingestRes.text();
        throw new Error(body || ingestRes.statusText);
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
        const body = await capRes.text();
        throw new Error(body || capRes.statusText);
      }
      const { text: captionText } = (await capRes.json()) as { text: string };
      setText(captionText);
      setFetchState({ kind: "found" });
    } catch (err) {
      setFetchState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

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
        </label>

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

        {error && (
          <div
            className="px-3 py-2 text-sm"
            style={{
              background: "var(--color-coral-soft)",
              color: "var(--color-coral)",
              border: "1px solid var(--color-coral)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {error}
          </div>
        )}

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

function FetchFeedback({ state }: { state: FetchState }) {
  if (state.kind === "idle" || state.kind === "loading") return null;
  // Design-overhaul accents: mint for success, amber-soft for warn, coral for
  // error. Text color echoes the token family (mint/coral) or `--color-ink`
  // on the yellow warn background for readable contrast.
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
    error: {
      bg: "var(--color-coral-soft)",
      fg: "var(--color-coral)",
      border: "var(--color-coral)",
    },
  }[state.kind];
  const message =
    state.kind === "found"
      ? "Captions loaded. Review and edit before aligning."
      : state.kind === "not-found"
        ? "No manual captions for this language — paste the text instead."
        : `Couldn't fetch captions: ${state.message}`;
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
