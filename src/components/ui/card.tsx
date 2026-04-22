/**
 * Design system Card + subcomponents — ported from the LangoBee design-overhaul
 * branch. See design.md §Card in the LangoBee repo for the canonical spec.
 *
 * 1px `--color-line` border on white, 20px radius, no shadow. Clickable cards
 * shift opacity on press; no transform, no shadow animation.
 *
 * @module
 */
"use client";

type CardProps = {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
};

export function Card({ onClick, className = "", children }: CardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: "#ffffff",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        cursor: onClick ? "pointer" : undefined,
        transition: "opacity 0.1s",
      }}
      onPointerDown={(e) => {
        if (!onClick) return;
        e.currentTarget.style.opacity = "0.92";
      }}
      onPointerUp={(e) => {
        if (!onClick) return;
        e.currentTarget.style.opacity = "1";
      }}
      onPointerLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.opacity = "1";
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div style={{ padding: "14px 16px" }} className={className}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      style={{
        fontFamily: "var(--font-ui)",
        fontWeight: 800,
        fontSize: "16px",
        letterSpacing: "-0.01em",
        color: "var(--color-ink)",
        margin: 0,
      }}
      className={className}
    >
      {children}
    </h3>
  );
}

export function CardSubtitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: "13px",
        fontWeight: 600,
        color: "var(--color-muted)",
        margin: "4px 0 0",
      }}
      className={className}
    >
      {children}
    </p>
  );
}

export function CardFooter({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      style={{
        padding: "10px 16px",
        borderTop: "1px solid var(--color-line)",
      }}
      className={className}
    >
      {children}
    </div>
  );
}
