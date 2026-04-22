/**
 * Header icon buttons (close "X" and settings cog) — ported from the LangoBee
 * design-overhaul branch (`packages/ui/src/components/ui/icon-button.tsx`).
 *
 * langokee has no internal Link targets for these so the Next.js `<Link>`
 * variant is dropped — every instance here is an `onClick` button. Glyphs
 * inherit color via `currentColor` from `--color-ink`. No fill, no border.
 *
 * @module
 */
"use client";

type IconButtonProps = {
  ariaLabel: string;
  onClick?: () => void;
  ariaExpanded?: boolean;
};

function baseStyle(size: number): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--color-ink)",
    width: `${size}px`,
    height: `${size}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 0,
    transition: "opacity 0.1s",
  };
}

function pressHandlers() {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.style.opacity = "0.7";
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.style.opacity = "1";
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.style.opacity = "1";
    },
  };
}

function CloseGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CogGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CloseIconButton({ ariaLabel, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={baseStyle(24)}
      {...pressHandlers()}
    >
      <CloseGlyph />
    </button>
  );
}

export function SettingsIconButton({ ariaLabel, onClick, ariaExpanded }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      style={baseStyle(28)}
      {...pressHandlers()}
    >
      <CogGlyph />
    </button>
  );
}
