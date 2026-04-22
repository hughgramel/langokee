/**
 * TypeScript wrapper around `scripts/align.py`.
 *
 * Writes the (already-normalized) text to a temp file, then shells out to
 * the Python alignment CLI. The separation between TS and Python exists for
 * one reason: WhisperX is Python-only. Everything else — ingest, caching,
 * normalization, HTTP — stays in the Next.js process.
 *
 * `ALIGN_PYTHON` points at the interpreter that has `whisperx` installed.
 * Recommended setup is a dedicated venv (e.g. `/tmp/whisperx-run/.venv`);
 * pin it in `.env.local` as `ALIGN_PYTHON=/path/to/venv/bin/python`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "./proc";
import { mediaDir } from "./paths";
import type { Transcript } from "@/types/transcript";

const ALIGN_PYTHON = process.env.ALIGN_PYTHON || "python3";
const ALIGN_DEVICE = process.env.ALIGN_DEVICE || "cpu";

// scripts/align.py is read from the repo root — process.cwd() when Next.js
// runs is the project root, same convention the other shell-outs use.
function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "align.py");
}

export async function align(
  videoId: string,
  language: string,
  text: string,
): Promise<Transcript> {
  const dir = mediaDir(videoId);
  const audioPath = path.join(dir, "audio.mp3");

  // Temp file lives in the OS temp dir, not under public/, so we don't
  // accidentally serve the raw paste. Cleaned up on success or failure.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "langokee-align-"));
  const textPath = path.join(tmp, "text.txt");
  await fs.writeFile(textPath, text, "utf8");

  try {
    const { stdout } = await run(
      ALIGN_PYTHON,
      [
        scriptPath(),
        "--audio",
        audioPath,
        "--text-file",
        textPath,
        "--language",
        language,
        "--device",
        ALIGN_DEVICE,
      ],
      { logPrefix: "align" },
    );
    // align.py writes a single JSON document to stdout.
    return JSON.parse(stdout) as Transcript;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
