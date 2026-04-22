/**
 * Thin promise wrapper around Node's child_process.spawn. Used to shell
 * out to yt-dlp, ffmpeg, and (for the local backend) whisper. Streams
 * stderr to the server console so long-running jobs show progress in dev,
 * and collects stdout so callers can parse JSON output.
 */
import { spawn, type SpawnOptions } from "node:child_process";

export type ProcResult = {
  stdout: string;
  stderr: string;
};

/**
 * Thrown when a required binary (yt-dlp, ffmpeg, …) isn't on PATH. Carries
 * the install command so the API route can surface something the user can
 * actually copy-paste. The UI checks `instanceof ToolMissingError` indirectly
 * via the error message prefix `"MISSING_BINARY:"`.
 */
export class ToolMissingError extends Error {
  readonly kind = "missing-binary" as const;
  constructor(
    public readonly bin: string,
    public readonly install: string,
  ) {
    super(
      `MISSING_BINARY: ${bin} is not installed or not on PATH. Install it with: ${install}`,
    );
    this.name = "ToolMissingError";
  }
}

export async function run(
  bin: string,
  args: string[],
  opts: SpawnOptions & { logPrefix?: string; install?: string } = {},
): Promise<ProcResult> {
  const { logPrefix, install, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { ...spawnOpts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (logPrefix) process.stderr.write(`[${logPrefix}] ${text}`);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT" && install) {
        reject(new ToolMissingError(bin, install));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited with code ${code}\n${stderr}`));
    });
  });
}
