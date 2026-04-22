# langokee

Open-source karaoke-style YouTube player for language learners. Paste a YouTube URL, **auto-fetch the uploader's manual captions** (or paste your own text), and langokee aligns them to the audio — word-perfect timing, no ASR hallucinations. Clip any moment into an Anki card with audio, screenshot, sentence, target word, and translation in one click.

Built to be the open-source cousin of [LangoBee](https://langobee.com), sharing its design language (big blue buttons, rounded cards, M PLUS Rounded 1c) and its Anki `Timestamp Sentence` note template.

---

## What you get

- **Karaoke transcript.** Every word lights up in time with the audio via word-level timestamps. Click any word to seek.
- **Alignment, not ASR.** langokee never runs open-vocabulary speech recognition. You bring the text (or we pull the uploader's captions), and the model only answers *when* each word lands. This eliminates the hallucinations and misheard lyrics that plague ASR on songs, and works just as well for interviews, dialogues, or audiobooks.
- **Auto-fetch captions.** Click **Fetch captions** and langokee pulls the manual caption track the uploader attached — no typing, just review and align. Auto-generated (ASR) captions are skipped on purpose; if there's no manual track, paste the lyrics yourself.
- **One-click Anki export.** Drag-select a sentence, add a translation + definition, and hit Send. A fully populated Anki note lands in your **Timestamp** deck — with the audio clip, a screenshot of the video at that moment, and per-word timings for the card's built-in karaoke player.
- **Local-first video.** `yt-dlp` downloads a 720p MP4 to `public/media/`, so playback and screenshots work without CORS gymnastics.

---

## Prerequisites

All platforms:

- **Node.js 20+** and **pnpm** (or npm / yarn — pnpm is used in examples)
- **Python 3.10+** with [WhisperX](https://github.com/m-bain/whisperX) installed in a venv
  ```bash
  # Recommended: dedicated venv
  python3.11 -m venv /path/to/whisperx-venv
  /path/to/whisperx-venv/bin/pip install -U whisperx
  # Then set ALIGN_PYTHON in .env.local to /path/to/whisperx-venv/bin/python
  ```
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** on your `PATH`
  ```bash
  # macOS
  brew install yt-dlp
  # or via pip
  pip install -U yt-dlp
  ```
- **[ffmpeg](https://ffmpeg.org/download.html)** on your `PATH`
  ```bash
  # macOS
  brew install ffmpeg
  # Ubuntu/Debian
  sudo apt install ffmpeg
  ```
- **[Anki](https://apps.ankiweb.net/)** + **[AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159)** (add-on code: `2055492159`). Anki must be **running** when you send a card.

---

## How it works

```
YouTube URL ──yt-dlp──▶ audio.mp3
              │                │
              └──▶ video.<lang>.vtt (manual captions — optional)
                   │    │
                   ▼    │
              vtt → text ─┐
                          ├──▶ normalize ──▶ wav2vec2 CTC align ──▶ per-word timings
              pasted text ┘                              │
                                                         ▼
                                          canonical Transcript JSON
                                          cached in public/media/{id}/
```

1. **Ingest.** `yt-dlp` downloads a 720p MP4 + any manual VTT caption tracks and `ffmpeg` extracts a mono 16 kHz MP3 into `public/media/{videoId}/`. Auto-generated captions are *not* requested (YouTube rate-limits them and they're ASR under the hood).
2. **Get the text.** Either click **Fetch captions** — `src/lib/vtt.ts` parses the manual VTT track into clean, deduped lines — or paste your own lyrics/transcript.
3. **Normalize the text.** LRC-style `[00:01.23]` timestamps, `[Chorus]` tags, speaker labels (`John:`, `Q:`), stage directions (`(inaudible)`), HTML, and mixed-width whitespace get stripped. Line structure is preserved — one line in, one segment out.
4. **Align.** `scripts/align.py` loads the audio and the WhisperX wav2vec2 align model for the target language, then runs forced alignment over the full clip. The aligner can only place tokens it's given — it never invents words.
5. **Cache.** Output is stored at `public/media/{videoId}/transcript.{lang}.{hash}.json` where the hash is the first 10 chars of `sha1(normalizedText)`. Same text → instant reopen. Different text → new alignment.

---

## Quickstart

```bash
git clone https://github.com/<you>/langokee.git
cd langokee
pnpm install
cp .env.example .env.local
# Edit .env.local — point ALIGN_PYTHON at your whisperx venv
pnpm dev
```

Open <http://localhost:3000>.

---

## Using the app

1. **Click the blank player.** A modal opens.
2. **Paste a YouTube URL.** Any format works (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`).
3. **Pick the target language.** This selects the wav2vec2 align model used in the final step *and* tells the caption fetcher which language track to pull.
4. **Get the text — one of two ways:**
   - **Fetch captions (preferred when available).** Click the *Fetch captions* button next to the textarea. langokee runs `yt-dlp` on the URL (downloading the video if you haven't already), pulls the manual caption track in your chosen language, parses the VTT, and drops the clean text into the textarea. If the uploader didn't attach a manual track you'll see *"No manual captions for this language — paste the text instead."* Auto-generated YouTube captions are deliberately ignored: they're ASR and would reintroduce the exact mistakes langokee is built to avoid.
   - **Paste it yourself.** One line per sung/spoken line. LRC timestamps, `[Chorus]`-style tags, speaker labels, and HTML are stripped automatically — don't worry about cleaning it up first.

   You can always edit the fetched text before aligning (trim intros, fix obvious typos, remove outro banter, etc.).
5. **Align.** First run of a given video runs `yt-dlp` + ffmpeg + the aligner (~15–60 s on CPU, much faster with `ALIGN_DEVICE=cuda`). Reopens with the same text are instant thanks to the content-hashed cache. Reopens from the History list skip the paste/fetch entirely.
6. **Watch the karaoke.** Every word highlights in time (a 3px blue bar slides under the active word). Click a word to seek. Click a timestamp to jump to that line.
7. **Drag across words to select a clip range.** The selection is highlighted; the "Make Anki card" button lights up.
8. **Review the card.** langokee auto-captures a screenshot of the video at the clip's start, auto-picks the longest word in the selection as the target, and opens the review modal. Edit the target, translation, and definition as you like, then hit **Send to Anki**.

### What lands in Anki

One new note in your **Timestamp** deck using the **Timestamp Sentence** model. Fields populated:

| Field | Source |
| --- | --- |
| `Sentence` | The selected transcript text |
| `Words` | JSON array of `{surface, start, end, lemma?}` — drives the card's per-word highlight |
| `AudioFile` | The ffmpeg-cut MP3 clip (filename, as Anki stores it in its media folder) |
| `VideoId` | YouTube video ID |
| `StartSec` / `EndSec` | Clip boundaries (seconds, 3 decimals) |
| `Translation` | What you typed |
| `TargetWord` | The word you picked |
| `WordDefinition` | What you typed (HTML allowed) |
| `Screenshot` | `<img>` tag referencing the captured PNG, rendered **above** the answer block on the back of the card |

Tags: `langokee`, plus the 2-letter language code (`es`, `zh`, …).

### First-run note: the Screenshot field

langokee automatically extends your existing `Timestamp Sentence` model with a `Screenshot` field on the first card creation, and prepends a conditional image block to the back template. Existing cards keep working — their `Screenshot` field is simply empty, so nothing renders. New cards get the photo above the translation + definition.

If you'd rather manage this by hand, add a field called `Screenshot` to the note type and insert this snippet at the top of the back template:

```html
{{#Screenshot}}
<div class="ts-screenshot" style="max-width:640px;margin:0 auto 20px;">
  {{Screenshot}}
</div>
{{/Screenshot}}
```

---

## Configuration reference

See `.env.example`. Every setting has a sensible default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALIGN_PYTHON` | `python3` | Python interpreter with `whisperx` installed — point at a dedicated venv |
| `ALIGN_DEVICE` | `cpu` | `cpu` or `cuda`. `cpu` is fine for ~5 min clips on Apple Silicon |
| `YTDLP_BIN` | `yt-dlp` | Path override if not on `PATH` |
| `FFMPEG_BIN` | `ffmpeg` | Path override if not on `PATH` |
| `ANKI_CONNECT_URL` | `http://127.0.0.1:8765` | AnkiConnect endpoint |
| `ANKI_DECK_NAME` | `Timestamp` | Deck that new notes land in |
| `ANKI_MODEL_NAME` | `Timestamp Sentence` | Note type langokee writes to |

---

## Troubleshooting

**`yt-dlp: command not found`.** Install yt-dlp (see prereqs). If it's installed but at an unusual path, set `YTDLP_BIN` in `.env.local` to the absolute path.

**`ModuleNotFoundError: No module named 'whisperx'` when aligning.** `ALIGN_PYTHON` is pointing at an interpreter that doesn't have WhisperX. Either `pip install -U whisperx` into that interpreter or point `ALIGN_PYTHON` at a venv that does.

**Alignment is slow on CPU.** Expected — wav2vec2 is still doing real work. A 5-minute clip takes ~30–60 s on Apple Silicon. Linux + NVIDIA users can set `ALIGN_DEVICE=cuda` for a large speedup.

**"No manual captions for this language" when clicking *Fetch captions*.** The uploader didn't attach a human-written caption track for that language. langokee deliberately won't fall back to YouTube's auto-captions — they're ASR and defeat the whole point. Paste the text yourself, or try a different upload of the same song/talk (music videos often have multiple uploads, and one of them usually has lyrics).

**The aligner is off by a line or two.** Forced alignment is only as good as the text you feed it. Extra or missing lines cause drift — trim to exactly the lines that are actually sung, in order, then re-align. Instrumental breaks and silence are fine; empty lines are dropped automatically. This applies whether you pasted the text or fetched it — caption tracks sometimes include non-lyric intro text that's worth trimming before aligning.

**`AnkiConnect: collection is not available`.** Anki needs to be running with the AnkiConnect add-on installed. Open Anki, stay on the deck view, then retry.

**`AnkiConnect HTTP 403` when calling from another machine.** Edit the AnkiConnect add-on config in Anki (Tools → Add-ons → AnkiConnect → Config) to add your origin to `webCorsOriginList`. Default install only accepts `http://localhost`.

**Screenshot is blank / tiny / black.** The capture runs ~400ms after the modal opens, giving the video element time to repaint after the seek. If the video hadn't finished loading when the modal opened, use the **Re-capture** button in the review modal after the frame is visible.

**Re-running alignment with different text.** Just paste the new text — the cache key includes a hash of the normalized text, so a changed paste produces a fresh alignment automatically. The audio + video stay cached; only the alignment re-runs.

---

## Project layout

```
scripts/
└── align.py                     # WhisperX wav2vec2 forced alignment CLI
src/
├── app/
│   ├── api/
│   │   ├── ingest/route.ts       # yt-dlp + ffmpeg — download video, audio, and manual caption tracks
│   │   ├── captions/route.ts     # read cached VTT → clean text (manual tracks only)
│   │   ├── align/route.ts        # forced alignment dispatcher + cache
│   │   └── anki/route.ts         # clip audio + screenshot + addNote
│   ├── globals.css               # Design tokens, 3D button styles
│   ├── layout.tsx
│   └── page.tsx                  # Landing → reader state machine
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── icon-button.tsx
│   │   └── modal.tsx
│   ├── player-card.tsx           # Empty-state blank player card
│   ├── upload-modal.tsx          # URL + language + pasted-text form
│   ├── react-player-wrapper.tsx  # next/dynamic wrapper with ref forwarding
│   ├── karaoke-reader.tsx        # Player + transcript + drag-select
│   ├── ruby-word.tsx             # Per-word ruby (pinyin / furigana) renderer
│   ├── history-modal.tsx         # Recently-aligned videos list
│   ├── settings-modal.tsx        # Deck / model / AnkiConnect URL overrides
│   └── clip-modal.tsx            # Review + edit + send-to-Anki
├── lib/
│   ├── align.ts                  # TS wrapper that spawns scripts/align.py
│   ├── normalize-text.ts         # LRC / section-tag / speaker-label stripper
│   ├── languages.ts              # Supported language list
│   ├── youtube-id.ts             # URL → videoId
│   ├── paths.ts                  # public/media/{id}/... path helpers
│   ├── proc.ts                   # spawn() promise wrapper
│   ├── ytdlp.ts                  # yt-dlp wrapper (video + manual VTT captions) + findManualSubtitle
│   ├── vtt.ts                    # WebVTT → plain text (strips cues, `<c>` tags, inline timestamps, dedupes)
│   ├── ffmpeg.ts                 # audio extract + clip
│   └── anki.ts                   # AnkiConnect client + model bootstrap
└── types/transcript.ts           # Canonical Segment / Word / Transcript
```

---

## Contributing

PRs welcome. Things that would be nice to add:

- **Non-YouTube sources** — local MP3 / MP4 upload, Apple Music / Spotify helpers, podcast RSS enclosures.
- **Auto-translation** of the selected sentence (DeepL / OpenAI / whatever) so the translation field prefills.
- **Auto-definition** of the target word from Wiktionary / a dictionary API, populating the definition field.
- **Text-smart paste** — an LLM pass that cleans obvious paste artefacts (missing lines, unicode lookalikes) before alignment, gated behind a toggle.
- **Local dev without Anki running** — dry-run mode that previews the addNote payload.

---

## License

MIT. `react-player` config + `next/dynamic` wrapper pattern borrowed from [LangoBee](https://langobee.com) (Apache 2.0 — used with permission). AnkiConnect and Anki itself are their own projects with their own licenses.
