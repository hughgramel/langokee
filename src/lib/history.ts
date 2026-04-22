/**
 * Transcript history — localStorage-backed list of past videos so users can
 * jump straight back into something they've already transcribed. The heavy
 * lifting (yt-dlp download + Whisper transcribe) is already cached server-side
 * in public/media/{videoId}/, so clicking a history entry is effectively
 * instant.
 */

export type HistoryEntry = {
  videoId: string;
  title: string;
  channel?: string;
  thumbnail?: string;
  duration: number;
  language: string;
  lastOpenedAt: number;
};

const KEY = "langokee.history";
const MAX = 50;

/**
 * Seed entries for videos already transcribed + cached under public/media/.
 * They're appended to whatever the user has in localStorage so a fresh
 * browser (or a teammate opening a demo build) can click straight into
 * something testable — the server-side cache makes loading instant.
 *
 * Keep this list tight: only entries with a cache directory on disk, so
 * there's no yt-dlp / Whisper re-run surprise.
 */
const DEFAULT_HISTORY: readonly HistoryEntry[] = [
  {
    videoId: "1S4xFl4CD34",
    title: "The Red Sun in the Sky - HQ (天上太阳红彤彤)",
    channel: "Juche 1912",
    thumbnail: "https://i.ytimg.com/vi/1S4xFl4CD34/maxresdefault.jpg",
    duration: 89,
    language: "zh",
    lastOpenedAt: 0,
  },
  {
    videoId: "xGxj2iHAtzE",
    title: "Red Sun in the Sky (天上太阳红彤彤)",
    channel: "Mao Ze Dong - Topic",
    thumbnail: "https://i.ytimg.com/vi_webp/xGxj2iHAtzE/maxresdefault.webp",
    duration: 238,
    language: "zh",
    lastOpenedAt: 0,
  },
  {
    videoId: "3FFOxhBSYAs",
    title: "Por qué Ceuta y Melilla pertenecen a España si están en África",
    channel: "BBC News Mundo",
    thumbnail: "https://i.ytimg.com/vi/3FFOxhBSYAs/maxresdefault.jpg",
    duration: 435,
    language: "es",
    lastOpenedAt: 0,
  },
  {
    videoId: "daIaLUNwzKU",
    title: "Los Juegos del Hambre de Latinoamérica en Minecraft | Tráiler 2 | SkeletalMax",
    channel: "SkeletalMax",
    thumbnail: "https://i.ytimg.com/vi/daIaLUNwzKU/maxresdefault.jpg",
    duration: 124,
    language: "es",
    lastOpenedAt: 0,
  },
];

export function loadHistory(): HistoryEntry[] {
  const seeded = [...DEFAULT_HISTORY];
  if (typeof window === "undefined") return seeded;
  let user: HistoryEntry[] = [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) user = arr as HistoryEntry[];
    }
  } catch {
    user = [];
  }
  // User entries first, then seeds that the user hasn't already opened
  // (dedup by videoId + language, same key as addToHistory uses).
  const userKeys = new Set(user.map((e) => `${e.videoId}|${e.language}`));
  const unseenSeeds = seeded.filter((e) => !userKeys.has(`${e.videoId}|${e.language}`));
  return [...user, ...unseenSeeds];
}

function save(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    // Swallow quota / private-mode errors — history is a convenience, not data.
  }
}

export function addToHistory(entry: HistoryEntry): HistoryEntry[] {
  const existing = loadHistory();
  // Dedup by videoId + language — same video in a different language is a
  // legitimately distinct transcript.
  const without = existing.filter(
    (e) => !(e.videoId === entry.videoId && e.language === entry.language),
  );
  const next = [entry, ...without].slice(0, MAX);
  save(next);
  return next;
}

export function removeFromHistory(videoId: string, language: string): HistoryEntry[] {
  const next = loadHistory().filter(
    (e) => !(e.videoId === videoId && e.language === language),
  );
  save(next);
  return next;
}
