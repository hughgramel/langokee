#!/usr/bin/env python3
"""
Forced alignment of known text to audio — no ASR.

This is the backend for `/api/align`. It takes the user's pasted text as
ground truth and uses WhisperX's wav2vec2 alignment stage to answer the
only remaining question: *when* does each word land in the audio?

The WhisperX transcribe pipeline is:
    audio -> (faster-whisper ASR) -> text -> (wav2vec2 CTC align) -> word times

We skip the ASR step entirely because the text is a known input. That
eliminates hallucinations, prompt tuning, and the "人民 vs 真会" failure
mode entirely. The alignment step is the reliable one — it never invents
words, only places them.

Usage:
    python scripts/align.py \\
        --audio public/media/<id>/audio.mp3 \\
        --text-file /tmp/text.txt \\
        --language zh \\
        --device cpu

Writes canonical Transcript JSON to stdout.

Requires `whisperx` in the Python env — the Next.js side points at it via
the ALIGN_PYTHON environment variable.
"""
import argparse
import json
import sys

import whisperx


def unit_count(line: str, language: str) -> int:
    """Count alignment units in a line.

    WhisperX's align() returns one entry per "word" — for spaced scripts
    that's space-separated tokens, for unspaced scripts (zh, ja, th) it's
    one entry per character. We count the same way here so we can slice
    the flat word list back into the user's original line structure.
    """
    unspaced = language[:2] in ("zh", "ja", "th")
    if unspaced:
        return sum(1 for c in line if not c.isspace())
    return len(line.split())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--text-file", required=True)
    ap.add_argument("--language", required=True)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    with open(args.text_file, "r", encoding="utf-8") as f:
        raw = f.read()

    # Preserve line structure — one line in = one segment out. Empty lines
    # are dropped; we do not split long paragraphs.
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if not lines:
        print("error: text is empty after normalization", file=sys.stderr)
        return 1

    full_text = " ".join(lines)

    # load_audio returns a 16kHz mono float32 waveform.
    audio = whisperx.load_audio(args.audio)
    sample_rate = 16000
    duration = float(len(audio)) / sample_rate

    # Pass ONE segment covering the whole audio. wav2vec2 CTC will spread
    # the words freely across it — this is the right framing when we don't
    # have per-line timing hints. The alternative (pre-chunking into N
    # equal slices) fails on any song where lyrics aren't evenly distributed.
    segments = [{"text": full_text, "start": 0.0, "end": duration}]

    align_model, metadata = whisperx.load_align_model(
        language_code=args.language,
        device=args.device,
    )
    result = whisperx.align(
        segments,
        align_model,
        metadata,
        audio,
        args.device,
        return_char_alignments=False,
    )

    words = result.get("word_segments", [])

    # Re-chunk the flat word list back into user-visible lines by order.
    out_segments = []
    idx = 0
    for i, line in enumerate(lines):
        n = unit_count(line, args.language)
        slice_ = words[idx : idx + n]
        idx += n
        if not slice_:
            continue
        # Some aligned words drop their timing (low-confidence or CTC blank
        # neighborhood) — tolerate that by falling back to the previous/next
        # valid bound.
        starts = [w.get("start") for w in slice_ if w.get("start") is not None]
        ends = [w.get("end") for w in slice_ if w.get("end") is not None]
        if not starts or not ends:
            continue
        out_segments.append(
            {
                "id": i,
                "start": starts[0],
                "end": ends[-1],
                "text": line,
                "words": [
                    {
                        "surface": (w.get("word") or "").strip(),
                        "start": w.get("start", starts[0]),
                        "end": w.get("end", ends[-1]),
                    }
                    for w in slice_
                ],
            }
        )

    out = {
        "language": args.language,
        "segments": out_segments,
        "duration": duration,
    }
    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
