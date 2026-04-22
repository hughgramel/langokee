/**
 * Flat pill button — ported from the LangoBee design-overhaul branch. See
 * design.md §Button in the LangoBee repo for the canonical spec.
 *
 * Variants: primary | ink | ghost | outline | soft | muted. Press state is
 * a 0.88 opacity shift — no transform, no shadow.
 *
 * @module
 */
"use client";

type Variant = "primary" | "ink" | "ghost" | "outline" | "soft" | "muted";
type Size = "sm" | "md" | "lg" | "xl";

type ButtonProps = {
  variant?: Variant | "secondary";
  size?: Size;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
  ariaLabel?: string;
  type?: "button" | "submit" | "reset";
};

const FILLS: Record<Variant, { bg: string; color: string; border: string }> = {
  primary: { bg: "var(--color-blue-strong)", color: "#ffffff", border: "none" },
  ink: { bg: "var(--color-ink)", color: "#ffffff", border: "none" },
  ghost: { bg: "var(--color-surface)", color: "var(--color-ink)", border: "none" },
  outline: { bg: "#ffffff", color: "var(--color-ink)", border: "1.5px solid var(--color-ink)" },
  soft: { bg: "var(--color-blue-soft)", color: "var(--color-blue-ink)", border: "none" },
  muted: { bg: "var(--color-surface)", color: "var(--color-muted)", border: "none" },
};

const SIZES: Record<Size, { padding: string; fontSize: string }> = {
  sm: { padding: "6px 14px", fontSize: "12px" },
  md: { padding: "10px 18px", fontSize: "14px" },
  lg: { padding: "14px 22px", fontSize: "15px" },
  xl: { padding: "16px 28px", fontSize: "16px" },
};

function resolveVariant(v: Variant | "secondary"): Variant {
  return v === "secondary" ? "outline" : v;
}

export function Button({
  variant = "primary",
  size = "md",
  children,
  onClick,
  disabled = false,
  className = "",
  fullWidth = false,
  ariaLabel,
  type = "button",
}: ButtonProps) {
  const v = resolveVariant(variant);
  const fill = FILLS[v];
  const dim = SIZES[size];

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={className}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--font-ui)",
        fontWeight: 700,
        fontSize: dim.fontSize,
        padding: dim.padding,
        borderRadius: "9999px",
        letterSpacing: "-0.01em",
        backgroundColor: fill.bg,
        color: fill.color,
        border: fill.border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? "100%" : undefined,
        outline: "none",
        transition: "opacity 0.1s",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.style.opacity = "0.88";
      }}
      onPointerUp={(e) => {
        if (disabled) return;
        e.currentTarget.style.opacity = "1";
      }}
      onPointerLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.opacity = "1";
      }}
    >
      {children}
    </button>
  );
}
