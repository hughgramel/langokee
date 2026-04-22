/**
 * Translate thrown backend errors into structured JSON responses the UI can
 * render as install-instruction callouts.
 *
 * The UI identifies "actionable" errors by the `kind` field. Unknown errors
 * fall through as plain 500s with just the message.
 */
import { NextResponse } from "next/server";
import { ToolMissingError } from "./proc";
import { AnkiDownError } from "./anki";

export type ApiErrorKind = "missing-binary" | "anki-down";

export type ApiErrorBody = {
  error: string;
  kind?: ApiErrorKind;
  /** Human-readable install / remediation hint. */
  fix?: string;
  /** The binary or service that's missing, when relevant. */
  bin?: string;
};

export function apiErrorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ToolMissingError) {
    return NextResponse.json(
      {
        error: err.message,
        kind: "missing-binary",
        fix: err.install,
        bin: err.bin,
      },
      { status: 500 },
    );
  }
  if (err instanceof AnkiDownError) {
    return NextResponse.json(
      { error: err.message, kind: "anki-down", fix: err.install },
      { status: 500 },
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: msg }, { status: 500 });
}
