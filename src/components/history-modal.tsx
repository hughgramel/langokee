"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "./ui/modal";
import { loadHistory, removeFromHistory, type HistoryEntry } from "@/lib/history";
import { LANGUAGES, type LangCode } from "@/lib/languages";

/**
 * History list modal. Entries are per-(videoId, language) — the same video
 * in a different language is a separate transcript.
 */
export function HistoryModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (entry: HistoryEntry) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (open) setEntries(loadHistory());
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="History" width={640}>
      {entries.length === 0 ? (
        <p
          className="py-4 text-center text-sm"
          style={{ fontFamily: "var(--font-ui)", color: "var(--color-muted)" }}
        >
          No transcripts yet. Paste a YouTube URL to get started.
        </p>
      ) : (
        <ul
          className="flex flex-col gap-2"
          style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}
        >
          {entries.map((e) => (
            <li
              key={`${e.videoId}-${e.language}`}
              className="flex items-center gap-3 p-3"
              style={{
                background: "#ffffff",
                border: "1px solid var(--color-line)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {e.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.thumbnail}
                  alt=""
                  width={96}
                  height={54}
                  className="shrink-0"
                  style={{ objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                />
              ) : (
                <div
                  className="shrink-0"
                  style={{
                    width: 96,
                    height: 54,
                    background: "var(--color-surface)",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              )}
              <button
                onClick={() => onSelect(e)}
                className="min-w-0 flex-1 text-left"
                style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}
              >
                <div
                  className="truncate text-sm"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    color: "var(--color-ink)",
                  }}
                >
                  {e.title}
                </div>
                <div
                  className="mt-0.5 truncate text-xs"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontWeight: 500,
                    color: "var(--color-muted)",
                  }}
                >
                  <span>{flagFor(e.language)}</span>
                  {e.channel ? <span> · {e.channel}</span> : null}
                  <span> · {formatRelative(e.lastOpenedAt)}</span>
                </div>
              </button>
              <button
                onClick={() => setEntries(removeFromHistory(e.videoId, e.language))}
                className="shrink-0 rounded-full p-2"
                style={{
                  color: "var(--color-muted-2)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "opacity 0.1s",
                }}
                aria-label="Remove from history"
                onPointerDown={(evt) => {
                  evt.currentTarget.style.opacity = "0.6";
                }}
                onPointerUp={(evt) => {
                  evt.currentTarget.style.opacity = "1";
                }}
                onPointerLeave={(evt) => {
                  evt.currentTarget.style.opacity = "1";
                }}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function flagFor(lang: string): string {
  return LANGUAGES.find((l) => l.code === (lang as LangCode))?.flag ?? "🌐";
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const hr = 3_600_000;
  const day = 24 * hr;
  if (diff < hr) return "just now";
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString();
}
