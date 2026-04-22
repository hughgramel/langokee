# langokee

Open-source karaoke-style YouTube player for language learners. Paste a YouTube URL, **auto-fetch the uploader's manual captions** (or paste your own text), and langokee aligns them to the audio with word-perfect timing and no ASR hallucinations. Clip any moment into an Anki card with audio, screenshot, sentence, target word, and translation in one click.

Built to be the open-source cousin of [LangoBee](https://langobee.com), sharing its design language (big blue buttons, rounded cards, M PLUS Rounded 1c) and its Anki `Timestamp Sentence` note template.

---

## What you get

- **Karaoke transcript.** Every word lights up in time with the audio via word-level timestamps. Click any word to seek.
- **Alignment, not ASR.** langokee never runs open-vocabulary speech recognition. You bring the text (or we pull the uploader's captions), and the model only answers *when* each word lands. This eliminates the hallucinations and misheard lyrics that plague ASR on songs, and works just as well for interviews, dialogues, or audiobooks.
- **Auto-fetch captions.** Click **Fetch captions** and langokee pulls the manual caption track the uploader attached. No typing, just review and align. Auto-generated (ASR) captions are skipped on purpose; if there's no manual track, paste the lyrics yourself.
- **One-click Anki export.** Drag-select a sentence, add a translation + definition, and hit Send. A fully populated Anki note lands in your **Timestamp** deck with the audio clip, a screenshot of the video at that moment, and per-word timings for the card's built-in karaoke player.
- **Local-first video.** `yt-dlp` downloads a 720p MP4 to `public/media/`, so playback and screenshots work without CORS gymnastics.

---

## System requirements

| Resource | Minimum | Notes |
| --- | --- | --- |
| OS | macOS 12+, Linux (x86_64), Windows 10/11 | Windows native works; WSL2 also works. |
| CPU | Any 64-bit | Apple Silicon (M1/M2/M3/M4) is fastest on CPU. |
| RAM | 8 GB | Alignment itself uses 2 to 4 GB. |
| Disk | 5 GB free | See breakdown below. |
| GPU (optional) | NVIDIA with CUDA 11.8 or 12.1+ | Gives roughly 5x to 20x speedup on alignment. Not required. |
| Node.js | 20 LTS or newer | 22 LTS recommended. |
| Python | 3.10, 3.11, or 3.12 | 3.11 is the sweet spot for WhisperX. 3.13 is not supported yet. |

**Disk usage breakdown**

- Repo + `node_modules`: ~400 MB
- Python venv with WhisperX + torch: ~2.5 GB
- First wav2vec2 model per language (downloaded on first alignment in that language): 300 MB to 1 GB
- Each downloaded video at 720p: 30 to 150 MB, stored under `public/media/{videoId}/`

**GPU notes**

- **NVIDIA / CUDA.** Install PyTorch with the matching CUDA wheel *before* installing WhisperX (`pip install torch --index-url https://download.pytorch.org/whl/cu121`), then `pip install -U whisperx`. Set `ALIGN_DEVICE=cuda` in `.env.local`.
- **Apple Silicon.** Stay on `ALIGN_DEVICE=cpu`. WhisperX alignment does not use Metal/MPS. Apple Silicon CPU is fast enough for typical 3 to 10 minute songs (see timings below).
- **AMD / ROCm.** Untested. Theoretically works with a ROCm torch build but we do not document it.
- **Intel Mac / x86_64 CPU only.** Works, just slower than Apple Silicon. Expect roughly 2x the timings below.

---

## Supported languages

Alignment models exist for these 18 languages:

English, Spanish, Chinese, Japanese, Korean, French, German, Italian, Portuguese, Russian, Greek, Dutch, Polish, Turkish, Arabic, Hindi, Vietnamese, Thai.

The target language determines which wav2vec2 model gets loaded and which manual caption track gets pulled from YouTube.

---

## Typical timings

Measured on an M2 Pro with `ALIGN_DEVICE=cpu`. First-run timings include one-time model downloads.

| Stage | First run | Subsequent runs |
| --- | --- | --- |
| `pnpm install` | 60 to 120 s | instant (lockfile hit) |
| First alignment in a new language (downloads the wav2vec2 model) | 30 to 90 s of model download, then alignment | just alignment |
| Alignment of a 3-minute song | 20 to 45 s | 20 to 45 s |
| Alignment of a 30-minute podcast | 4 to 8 min | 4 to 8 min |
| Re-opening a previously aligned video | instant (content-hashed cache) | instant |
| yt-dlp download + ffmpeg audio extract (720p, 3 min clip) | 5 to 15 s | cached |

With `ALIGN_DEVICE=cuda` on a modern NVIDIA GPU, alignment is typically 5x to 20x faster.

**The first time you align in a given language, WhisperX silently downloads a 300 MB to 1 GB model from HuggingFace.** The dev server will look like it is hanging. It is not. Watch the terminal for the download progress.

---

## Install

### macOS

```bash
# 1. System tools
brew install node pnpm yt-dlp ffmpeg python@3.11

# 2. Clone and install JS deps
git clone https://github.com/hughgramel/langokee.git
cd langokee
pnpm install

# 3. Python venv with WhisperX
python3.11 -m venv .venv
./.venv/bin/pip install -U whisperx

# 4. Configure
cp .env.example .env.local
# Edit .env.local and set:
#   ALIGN_PYTHON=/absolute/path/to/langokee/.venv/bin/python

# 5. Install Anki and the AnkiConnect add-on
# Download Anki: https://apps.ankiweb.net/
# In Anki: Tools > Add-ons > Get Add-ons... > paste code 2055492159

# 6. Run
pnpm dev
```

Open http://localhost:3000.

### Linux (Ubuntu / Debian)

```bash
# 1. System tools
sudo apt update
sudo apt install -y nodejs npm ffmpeg python3.11 python3.11-venv
sudo npm install -g pnpm
pip install -U yt-dlp   # or: sudo apt install yt-dlp (may be older)

# 2. Clone and install JS deps
git clone https://github.com/hughgramel/langokee.git
cd langokee
pnpm install

# 3. Python venv with WhisperX
# CPU-only:
python3.11 -m venv .venv
./.venv/bin/pip install -U whisperx

# CUDA (adjust cu121 to your CUDA version, e.g. cu118):
python3.11 -m venv .venv
./.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cu121
./.venv/bin/pip install -U whisperx

# 4. Configure
cp .env.example .env.local
# Edit .env.local:
#   ALIGN_PYTHON=/absolute/path/to/langokee/.venv/bin/python
#   ALIGN_DEVICE=cuda   # if you installed the CUDA torch wheel

# 5. Install Anki + AnkiConnect (same as macOS step 5)

# 6. Run
pnpm dev
```

### Windows 10 / 11 (PowerShell)

Native Windows is supported. If you prefer WSL2, follow the Linux instructions inside your distro.

```powershell
# 1. System tools (using winget; scoop or chocolatey work too)
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.11
winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp
npm install -g pnpm

# 2. Clone and install JS deps
git clone https://github.com/hughgramel/langokee.git
cd langokee
pnpm install

# 3. Python venv with WhisperX
py -3.11 -m venv .venv
.\.venv\Scripts\pip install -U whisperx
# For CUDA on Windows, install torch with the matching wheel first:
#   .\.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cu121
#   .\.venv\Scripts\pip install -U whisperx

# 4. Configure
copy .env.example .env.local
# Edit .env.local and set (use the full path):
#   ALIGN_PYTHON=C:\path\to\langokee\.venv\Scripts\python.exe

# 5. Install Anki + AnkiConnect (same as macOS step 5)

# 6. Run
pnpm dev
```

Open http://localhost:3000.

**Windows gotchas**

- Always set `ALIGN_PYTHON` to the **full path** to `python.exe` inside the venv. The bare name `python3` does not resolve on Windows.
- If `yt-dlp` or `ffmpeg` were installed somewhere not on `PATH`, set `YTDLP_BIN` and `FFMPEG_BIN` in `.env.local` to absolute `.exe` paths.
- CUDA on Windows: NVIDIA drivers ship CUDA runtime. Install the matching PyTorch wheel (`cu121` for CUDA 12.1, `cu118` for CUDA 11.8). Check with `nvidia-smi`.

### npm / yarn instead of pnpm

Any of these work: `pnpm install && pnpm dev`, `npm install && npm run dev`, `yarn && yarn dev`. Substitute freely in the commands above.

### Port 3000 already in use

`PORT=3001 pnpm dev` (macOS/Linux) or `$env:PORT=3001; pnpm dev` (PowerShell).

---

## `.env.example`

Every setting has a sensible default. You only need to set `ALIGN_PYTHON`.

```bash
# Point at the interpreter that has whisperx installed.
ALIGN_PYTHON=python3

# "cpu" or "cuda". Apple Silicon stays on cpu.
ALIGN_DEVICE=cpu

# Override if not on PATH.
YTDLP_BIN=yt-dlp
FFMPEG_BIN=ffmpeg

# AnkiConnect.
ANKI_CONNECT_URL=http://127.0.0.1:8765
ANKI_DECK_NAME=Timestamp
ANKI_MODEL_NAME=Timestamp Sentence
```

---

## How it works

```
YouTube URL ──yt-dlp──▶ audio.mp3
              │                │
              └──▶ video.<lang>.vtt (manual captions, optional)
                   │    │
                   ▼    │
              vtt → text ─┐
                          ├──▶ normalize ──▶ wav2vec2 CTC align ──▶ per-word timings
              pasted text ┘                              │
                                                         ▼
                                          canonical Transcript JSON
                                          cached in public/media/{id}/
```

1. **Ingest.** `yt-dlp` downloads a 720p MP4 plus any manual VTT caption tracks, and `ffmpeg` extracts a mono 16 kHz MP3 into `public/media/{videoId}/`. Auto-generated captions are *not* requested (YouTube rate-limits them, and they are ASR under the hood).
2. **Get the text.** Either click **Fetch captions** (which parses the manual VTT track into clean, deduped lines via `src/lib/vtt.ts`), or paste your own lyrics/transcript.
3. **Normalize the text.** LRC-style `[00:01.23]` timestamps, `[Chorus]` tags, speaker labels (`John:`, `Q:`), stage directions (`(inaudible)`), HTML, and mixed-width whitespace get stripped. Line structure is preserved: one line in, one segment out.
4. **Align.** `scripts/align.py` loads the audio and the WhisperX wav2vec2 align model for the target language, then runs forced alignment over the full clip. The aligner can only place tokens it is given. It never invents words.
5. **Cache.** Output is stored at `public/media/{videoId}/transcript.{lang}.{hash}.json` where the hash is the first 10 chars of `sha1(normalizedText)`. Same text means instant reopen. Different text means a new alignment.

---

## Using the app

1. **Click the blank player.** A modal opens.
2. **Paste a YouTube URL.** Any format works (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`).
3. **Pick the target language.** This selects the wav2vec2 align model *and* tells the caption fetcher which language track to pull.
4. **Get the text, one of two ways:**
   - **Fetch captions (preferred when available).** Click the *Fetch captions* button next to the textarea. langokee runs `yt-dlp`, pulls the manual caption track in your chosen language, parses the VTT, and drops the clean text into the textarea. If the uploader did not attach a manual track you will see *"No manual captions for this language, paste the text instead."* Auto-generated YouTube captions are deliberately ignored: they are ASR and would reintroduce the exact mistakes langokee is built to avoid.
   - **Paste it yourself.** One line per sung/spoken line. LRC timestamps, `[Chorus]`-style tags, speaker labels, and HTML are stripped automatically, so do not worry about cleaning it up first.

   You can always edit the fetched text before aligning (trim intros, fix obvious typos, remove outro banter, etc.).
5. **Align.** First run of a given video runs `yt-dlp` + ffmpeg + the aligner. Reopens with the same text are instant thanks to the content-hashed cache. Reopens from the History list skip the paste/fetch entirely.
6. **Watch the karaoke.** Every word highlights in time (a 3px blue bar slides under the active word). Click a word to seek. Click a timestamp to jump to that line.
7. **Drag across words to select a clip range.** The selection is highlighted; the "Make Anki card" button lights up.
8. **Review the card.** langokee auto-captures a screenshot of the video at the clip's start, auto-picks the longest word in the selection as the target, and opens the review modal. Edit the target, translation, and definition as you like, then hit **Send to Anki**.

### What lands in Anki

One new note in your **Timestamp** deck using the **Timestamp Sentence** model. Fields populated:

| Field | Source |
| --- | --- |
| `Sentence` | The selected transcript text |
| `Words` | JSON array of `{surface, start, end, lemma?}` that drives the card's per-word highlight |
| `AudioFile` | The ffmpeg-cut MP3 clip (filename, as Anki stores it in its media folder) |
| `VideoId` | YouTube video ID |
| `StartSec` / `EndSec` | Clip boundaries (seconds, 3 decimals) |
| `Translation` | What you typed |
| `TargetWord` | The word you picked |
| `WordDefinition` | What you typed (HTML allowed) |
| `Screenshot` | `<img>` tag referencing the captured PNG, rendered **above** the answer block on the back of the card |

Tags: `langokee`, plus the 2-letter language code (`es`, `zh`, etc.).

### First-run note: the Screenshot field

langokee automatically extends your existing `Timestamp Sentence` model with a `Screenshot` field on the first card creation, and prepends a conditional image block to the back template. Existing cards keep working (their `Screenshot` field is simply empty, so nothing renders). New cards get the photo above the translation + definition.

If you would rather manage this by hand, add a field called `Screenshot` to the note type and insert this snippet at the top of the back template:

```html
{{#Screenshot}}
<div class="ts-screenshot" style="max-width:640px;margin:0 auto 20px;">
  {{Screenshot}}
</div>
{{/Screenshot}}
```

---

## Configuration reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALIGN_PYTHON` | `python3` | Python interpreter with `whisperx` installed. On Windows, set to the full path of `python.exe` inside your venv. |
| `ALIGN_DEVICE` | `cpu` | `cpu` or `cuda`. Apple Silicon stays on `cpu` (MPS is not used). |
| `YTDLP_BIN` | `yt-dlp` | Path override if not on `PATH`. |
| `FFMPEG_BIN` | `ffmpeg` | Path override if not on `PATH`. |
| `ANKI_CONNECT_URL` | `http://127.0.0.1:8765` | AnkiConnect endpoint. |
| `ANKI_DECK_NAME` | `Timestamp` | Deck that new notes land in. |
| `ANKI_MODEL_NAME` | `Timestamp Sentence` | Note type langokee writes to. |

---

## Troubleshooting

**`yt-dlp: command not found`** or **`'yt-dlp' is not recognized`**. Install yt-dlp (see install section). If it is installed but at an unusual path, set `YTDLP_BIN` in `.env.local` to the absolute path.

**`ModuleNotFoundError: No module named 'whisperx'` when aligning.** `ALIGN_PYTHON` is pointing at an interpreter that does not have WhisperX. Either `pip install -U whisperx` into that interpreter, or point `ALIGN_PYTHON` at a venv that does.

**Alignment seems to hang the first time in a new language.** WhisperX is downloading the wav2vec2 model from HuggingFace (300 MB to 1 GB). Watch the terminal output for progress. Subsequent alignments in the same language use the cached model.

**Alignment is slow on CPU.** Expected. wav2vec2 is still doing real work. A 5-minute clip takes 30 to 60 s on Apple Silicon CPU, longer on Intel/older ARM. Linux + NVIDIA users can set `ALIGN_DEVICE=cuda` for a 5x to 20x speedup.

**`AssertionError: Torch not compiled with CUDA enabled` after setting `ALIGN_DEVICE=cuda`.** Your torch install is CPU-only. Reinstall torch with the CUDA wheel: `pip install torch --index-url https://download.pytorch.org/whl/cu121` (adjust `cu121` to match your CUDA version), then `pip install -U whisperx` again.

**"No manual captions for this language" when clicking *Fetch captions*.** The uploader did not attach a human-written caption track for that language. langokee deliberately will not fall back to YouTube's auto-captions (they are ASR and defeat the whole point). Paste the text yourself, or try a different upload of the same song/talk.

**The aligner is off by a line or two.** Forced alignment is only as good as the text you feed it. Extra or missing lines cause drift. Trim to exactly the lines that are actually sung, in order, then re-align. Instrumental breaks and silence are fine; empty lines are dropped automatically.

**`AnkiConnect: collection is not available`.** Anki needs to be running with the AnkiConnect add-on installed. Open Anki, stay on the deck view, then retry.

**`AnkiConnect HTTP 403` when calling from another machine.** Edit the AnkiConnect add-on config in Anki (Tools > Add-ons > AnkiConnect > Config) to add your origin to `webCorsOriginList`. Default install only accepts `http://localhost`.

**Screenshot is blank / tiny / black.** The capture runs ~400ms after the modal opens, giving the video element time to repaint after the seek. If the video had not finished loading when the modal opened, use the **Re-capture** button in the review modal after the frame is visible.

**Re-running alignment with different text.** Just paste the new text. The cache key includes a hash of the normalized text, so a changed paste produces a fresh alignment automatically. The audio + video stay cached; only the alignment re-runs.

**Windows: `ALIGN_PYTHON=python3` fails to start.** On Windows, `python3` is usually not in `PATH`. Use the full path to `python.exe` inside your venv, e.g. `C:\Users\you\langokee\.venv\Scripts\python.exe`.

---

## Project layout

```
scripts/
└── align.py                     # WhisperX wav2vec2 forced alignment CLI
src/
├── app/
│   ├── api/
│   │   ├── ingest/route.ts       # yt-dlp + ffmpeg: download video, audio, and manual caption tracks
│   │   ├── captions/route.ts     # read cached VTT into clean text (manual tracks only)
│   │   ├── align/route.ts        # forced alignment dispatcher + cache
│   │   └── anki/route.ts         # clip audio + screenshot + addNote
│   ├── globals.css               # Design tokens, 3D button styles
│   ├── layout.tsx
│   └── page.tsx                  # Landing -> reader state machine
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
│   ├── youtube-id.ts             # URL -> videoId
│   ├── paths.ts                  # public/media/{id}/... path helpers
│   ├── proc.ts                   # spawn() promise wrapper
│   ├── ytdlp.ts                  # yt-dlp wrapper (video + manual VTT captions) + findManualSubtitle
│   ├── vtt.ts                    # WebVTT -> plain text (strips cues, `<c>` tags, inline timestamps, dedupes)
│   ├── ffmpeg.ts                 # audio extract + clip
│   └── anki.ts                   # AnkiConnect client + model bootstrap
└── types/transcript.ts           # Canonical Segment / Word / Transcript
```

---

## Contributing

PRs welcome. Things that would be nice to add:

- **Non-YouTube sources**: local MP3 / MP4 upload, Apple Music / Spotify helpers, podcast RSS enclosures.
- **Auto-translation** of the selected sentence (DeepL / OpenAI / whatever) so the translation field prefills.
- **Auto-definition** of the target word from Wiktionary or a dictionary API, populating the definition field.
- **Text-smart paste**: an LLM pass that cleans obvious paste artefacts (missing lines, unicode lookalikes) before alignment, gated behind a toggle.
- **Local dev without Anki running**: dry-run mode that previews the addNote payload.

---

## License

MIT.
