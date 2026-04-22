/**
 * Canonical transcript shape produced by scripts/align.py (WhisperX wav2vec2
 * forced alignment). Per-word timings drive the karaoke highlight and
 * populate the `Words` field on Anki `Timestamp Sentence` notes.
 */

export type Word = {
  surface: string;
  start: number;
  end: number;
  lemma?: string;
};

export type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
};

export type Transcript = {
  language: string;
  segments: Segment[];
  duration: number;
};

export type VideoMeta = {
  videoId: string;
  title: string;
  channel?: string;
  duration: number;
  audioUrl: string;
  videoUrl: string;
  thumbnail?: string;
  /** Languages with manually-uploaded caption tracks (may be empty). */
  subtitleLanguages?: string[];
  /** Languages with YouTube auto-generated caption tracks (may be empty). */
  autoCaptionLanguages?: string[];
};
