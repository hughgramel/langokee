/**
 * Extract the 11-char YouTube video ID from any of the common URL shapes
 * (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`). Returns null if none
 * match — the caller should treat that as a user error, not a 500.
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  // Raw ID provided directly
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}
