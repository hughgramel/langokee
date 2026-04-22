"use client";

import { useEffect } from "react";
import { CloseIconButton } from "@/components/ui/icon-button";

/**
 * Bare-bones modal with a dark scrim and a rounded card. Closes on Escape
 * or backdrop click. Flat design-overhaul chrome: 1px `--color-line` border,
 * 24px radius, no shadow.
 */
export function Modal({
  open,
  onClose,
  children,
  title,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full flex-col"
        style={{
          maxWidth: `${width}px`,
          // Scrim has p-4 (16px) on each side; leave that as the viewport
          // gutter so the card never touches the screen edge.
          maxHeight: "calc(100dvh - 32px)",
          background: "#ffffff",
          border: "1px solid var(--color-line)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <div className="absolute right-3 top-3 z-10">
          <CloseIconButton ariaLabel="Close" onClick={onClose} />
        </div>
        {title && (
          <h2
            className="text-xl"
            style={{
              fontFamily: "var(--font-ui)",
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: "var(--color-ink)",
              padding: "24px 48px 16px 24px",
            }}
          >
            {title}
          </h2>
        )}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ padding: title ? "0 24px 24px" : "24px" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
