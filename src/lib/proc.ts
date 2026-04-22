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

export async function run(
  bin: string,
  args: string[],
  opts: SpawnOptions & { logPrefix?: string } = {},
): Promise<ProcResult> {
  const { logPrefix, ...spawnOpts } = opts;
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited with code ${code}\n${stderr}`));
    });
  });
}
