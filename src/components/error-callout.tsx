/**
 * Render a backend error with an install / remediation block when the server
 * tagged it with a known `kind`. Plain strings fall back to a simple coral
 * box — the caller decides what copy to pass in.
 *
 * Consumers parse API error responses via `parseApiError()` and hand the
 * returned shape here. That way UI components don't have to know about the
 * `MISSING_BINARY:` / `ANKI_DOWN:` message conventions.
 */
"use client";

export type ApiError = {
  message: string;
  kind?: "missing-binary" | "anki-down";
  fix?: string;
  bin?: string;
};

/**
 * Normalize a failing fetch response into a structured `ApiError`.
 * Handles both the new JSON-error envelope (`{ error, kind, fix }`) and the
 * older plain-text 500s.
 */
export async function parseApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as {
      error?: string;
      kind?: ApiError["kind"];
      fix?: string;
      bin?: string;
    };
    if (parsed && typeof parsed.error === "string") {
      return {
        message: parsed.error,
        kind: parsed.kind,
        fix: parsed.fix,
        bin: parsed.bin,
      };
    }
  } catch {
    // non-JSON body, fall through
  }
  // Legacy plain-text body: sniff the message prefixes as a fallback so old
  // callers still get structured rendering.
  if (text.startsWith("MISSING_BINARY:")) {
    const m = text.match(/MISSING_BINARY: (\S+) .* Install it with: (.*)$/s);
    return {
      message: text,
      kind: "missing-binary",
      bin: m?.[1],
      fix: m?.[2],
    };
  }
  if (text.startsWith("ANKI_DOWN:")) {
    return { message: text, kind: "anki-down" };
  }
  return { message: text || res.statusText };
}

export function ErrorCallout({ error }: { error: ApiError | string | null }) {
  if (!error) return null;
  const normalized: ApiError = typeof error === "string" ? { message: error } : error;

  const title = (() => {
    if (normalized.kind === "missing-binary")
      return `${normalized.bin ?? "A required tool"} isn't installed`;
    if (normalized.kind === "anki-down") return "Can't reach Anki";
    return "Something went wrong";
  })();

  return (
    <div
      className="px-3 py-2 text-sm"
      style={{
        background: "var(--color-coral-soft)",
        color: "var(--color-coral)",
        border: "1px solid var(--color-coral)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontWeight: 700 }}>{title}</div>
      {normalized.fix && (
        <div
          className="mt-1 px-2 py-1 text-xs"
          style={{
            background: "var(--color-paper)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {normalized.fix}
        </div>
      )}
      {!normalized.fix && (
        <div className="mt-1 text-xs" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {normalized.message}
        </div>
      )}
    </div>
  );
}
