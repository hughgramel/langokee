"use client";

import { Play } from "lucide-react";

/**
 * Empty-state "blank player" shown before a video is loaded. Big click
 * target that opens the UploadModal. Flat design-overhaul chrome: 1px
 * `--color-line` border, 20px radius, no shadow. Press = opacity shift.
 */
export function PlayerCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative mx-auto flex w-full items-center justify-center overflow-hidden"
      style={{
        aspectRatio: "16 / 9",
        maxWidth: "1200px",
        background: "#000",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        transition: "opacity 0.1s",
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.opacity = "0.92";
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
        <div
          className="flex items-center justify-center rounded-full transition-transform group-hover:scale-110"
          style={{
            width: "96px",
            height: "96px",
            background: "var(--color-blue-strong)",
          }}
        >
          <Play size={48} fill="white" strokeWidth={0} style={{ marginLeft: 6 }} />
        </div>
        <div
          className="text-center"
          style={{ fontFamily: "var(--font-ui)", fontWeight: 800, letterSpacing: "-0.01em" }}
        >
          <div style={{ fontSize: "22px" }}>Paste a YouTube URL</div>
          <div style={{ fontSize: "14px", opacity: 0.8, fontWeight: 600, marginTop: 6 }}>
            Transcribes • highlights every word • clips to Anki
          </div>
        </div>
      </div>
    </button>
  );
}
