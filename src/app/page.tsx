"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { History as HistoryIcon } from "lucide-react";
import { PlayerCard } from "@/components/player-card";
import { UploadModal, type UploadFormValues } from "@/components/upload-modal";
import { HistoryModal } from "@/components/history-modal";
import { SettingsModal } from "@/components/settings-modal";
import { Button } from "@/components/ui/button";
import { SettingsIconButton } from "@/components/ui/icon-button";
import { addToHistory, type HistoryEntry } from "@/lib/history";
import { useReaderSettings } from "@/lib/reader-settings";
import type { Transcript, VideoMeta } from "@/types/transcript";

// Karaoke reader is the heavy component — pulls in react-player under
// next/dynamic (which has to be SSR-off anyway). Lazy-load so the initial
// landing view is just the empty-state card + nothing else.
const KaraokeReader = dynamic(
  () => import("@/components/karaoke-reader").then((m) => m.KaraokeReader),
  { ssr: false },
);

/**
 * Main page. Three states:
 *   1. Landing — empty PlayerCard + "Paste a YouTube URL" CTA + History button
 *   2. Aligning — modal open, button spinner
 *   3. Ready — KaraokeReader full view with video + transcript + clip flow
 *
 * New videos go through the modal (URL + language + pasted text, POST to
 * /api/align). History re-opens hit GET /api/align — cache-only — so the
 * user doesn't have to re-paste text they already aligned. A cache miss
 * reopens the modal with the URL / language prefilled.
 */
export default function HomePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ meta: VideoMeta; transcript: Transcript } | null>(null);
  const [prefilledUrl, setPrefilledUrl] = useState<string | null>(null);

  // Reader settings live at the page level so the settings button can sit
  // in the top header alongside History — available even on the landing
  // screen — while the reader consumes them as a read-only prop.
  const [settings, updateSettings] = useReaderSettings();

  // Shared: download + probe metadata for a given URL. Used by both the
  // fresh-upload path and the history-cache-miss re-paste path.
  const ingest = useCallback(async (url: string): Promise<VideoMeta> => {
    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ingest failed: ${body || res.statusText}`);
    }
    return (await res.json()) as VideoMeta;
  }, []);

  const submit = useCallback(
    async (values: UploadFormValues) => {
      setBusy(true);
      setError(null);
      try {
        const meta = await ingest(values.url);
        const res = await fetch("/api/align", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            videoId: meta.videoId,
            language: values.language,
            text: values.text,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`align failed: ${body || res.statusText}`);
        }
        const transcript: Transcript = await res.json();

        addToHistory({
          videoId: meta.videoId,
          title: meta.title,
          channel: meta.channel,
          thumbnail: meta.thumbnail,
          duration: meta.duration,
          language: values.language,
          lastOpenedAt: Date.now(),
        });

        setLoaded({ meta, transcript });
        setModalOpen(false);
        setHistoryOpen(false);
        setPrefilledUrl(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [ingest],
  );

  const onHistorySelect = useCallback(
    async (entry: HistoryEntry) => {
      setBusy(true);
      setError(null);
      const url = `https://www.youtube.com/watch?v=${entry.videoId}`;
      try {
        // Try cache first — no re-paste needed.
        const cached = await fetch(
          `/api/align?videoId=${encodeURIComponent(entry.videoId)}&language=${encodeURIComponent(entry.language)}`,
        );
        if (cached.ok) {
          const transcript: Transcript = await cached.json();
          const meta = await ingest(url);
          addToHistory({ ...entry, lastOpenedAt: Date.now() });
          setLoaded({ meta, transcript });
          setHistoryOpen(false);
          return;
        }
        // Cache miss — fall back to the modal with URL prefilled so the
        // user can paste the text.
        setPrefilledUrl(url);
        setHistoryOpen(false);
        setModalOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [ingest],
  );

  const reset = useCallback(() => {
    setLoaded(null);
    setError(null);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1
          className="text-3xl"
          style={{
            fontFamily: "var(--font-ui)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--color-blue-strong)",
          }}
        >
          langokee
        </h1>
        <div className="flex items-center gap-2">
          <span data-testid="history-button">
            <Button variant="ghost" size="md" onClick={() => setHistoryOpen(true)}>
              <HistoryIcon size={16} /> History
            </Button>
          </span>
          <span data-testid="reader-settings">
            <SettingsIconButton
              ariaLabel="Reader settings"
              onClick={() => setSettingsOpen(true)}
            />
          </span>
          {loaded && (
            <Button variant="ghost" size="md" onClick={reset}>
              New video
            </Button>
          )}
        </div>
      </header>

      {loaded ? (
        <KaraokeReader
          meta={loaded.meta}
          transcript={loaded.transcript}
          settings={settings}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <PlayerCard onClick={() => setModalOpen(true)} />
          <p
            className="max-w-lg text-center text-sm"
            style={{ color: "var(--color-muted)", fontFamily: "var(--font-ui)" }}
          >
            Paste any YouTube URL plus the lyrics or transcript, and we'll align them to the
            audio — word-perfect timing you can scrub, clip, and send straight to Anki.
          </p>
        </div>
      )}

      <UploadModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setPrefilledUrl(null);
        }}
        onSubmit={submit}
        busy={busy}
        error={error}
        initialUrl={prefilledUrl ?? undefined}
      />

      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={onHistorySelect}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
      />
    </main>
  );
}
