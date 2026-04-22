import path from "node:path";

/** Absolute path to `public/media`. Served statically by Next, one-to-one. */
export const PUBLIC_MEDIA = path.join(process.cwd(), "public", "media");

export function mediaDir(videoId: string): string {
  return path.join(PUBLIC_MEDIA, videoId);
}

export function mediaUrl(videoId: string, filename: string): string {
  return `/media/${videoId}/${filename}`;
}
