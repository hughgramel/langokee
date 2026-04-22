/**
 * AnkiConnect client + model setup.
 *
 * Two things worth calling out:
 *
 * 1. The `Timestamp Sentence` model (queried at startup — see
 *    `ensureScreenshotField`) ships without a Screenshot field. We extend
 *    it once per install by adding the field and prepending
 *    `{{#Screenshot}}<div class="ts-screenshot">{{Screenshot}}</div>{{/Screenshot}}`
 *    to the back template. Existing cards keep working; new ones get the
 *    photo above the answer.
 *
 * 2. AnkiConnect accepts base64 media via `storeMediaFile` — we send the
 *    audio clip (already on disk) and the canvas screenshot (data URL
 *    from the client) that way. No filesystem access required.
 */
const ANKI_URL = process.env.ANKI_CONNECT_URL || "http://127.0.0.1:8765";
const MODEL_NAME = process.env.ANKI_MODEL_NAME || "Timestamp Sentence";
const DECK_NAME = process.env.ANKI_DECK_NAME || "Timestamp";
const SCREENSHOT_FIELD = "Screenshot";

type AnkiResp<T> = { result: T; error: string | null };

/** Invoke AnkiConnect and throw on error. */
export async function ankiInvoke<T>(action: string, params: unknown = {}): Promise<T> {
  const res = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
  if (!res.ok) {
    throw new Error(`AnkiConnect HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as AnkiResp<T>;
  if (body.error) throw new Error(`AnkiConnect: ${body.error}`);
  return body.result;
}

/**
 * Add a `Screenshot` field to the model and prepend an img block to the
 * back template — if not already present. Idempotent, safe to call on
 * every note creation.
 */
export async function ensureScreenshotField(): Promise<void> {
  const fields = await ankiInvoke<string[]>("modelFieldNames", { modelName: MODEL_NAME });
  if (!fields.includes(SCREENSHOT_FIELD)) {
    // Field goes at the end so existing card order stays stable. Index
    // is optional per AnkiConnect docs — omitting defaults to the tail.
    await ankiInvoke("modelFieldAdd", { modelName: MODEL_NAME, fieldName: SCREENSHOT_FIELD });
  }

  // Patch the back template to show the screenshot above the existing
  // back block. Only patch if we haven't already — detect by marker.
  const templates = await ankiInvoke<
    Record<string, { Front: string; Back: string }>
  >("modelTemplates", { modelName: MODEL_NAME });
  const card1Name = Object.keys(templates)[0];
  if (!card1Name) return;
  const tmpl = templates[card1Name]!;
  const MARKER = "<!-- langokee-screenshot -->";
  if (tmpl.Back.includes(MARKER)) return;

  const screenshotBlock = `${MARKER}
{{#Screenshot}}
<div class="ts-screenshot" style="max-width:640px;margin:0 auto 20px;">
  {{Screenshot}}
</div>
{{/Screenshot}}
`;
  // Insert at the top of the back-only segment (right before `<div class="ts-back">`
  // if present, else at the very end of the back template).
  const marker = `<div class="ts-back">`;
  const patchedBack = tmpl.Back.includes(marker)
    ? tmpl.Back.replace(marker, `${screenshotBlock}${marker}`)
    : `${screenshotBlock}${tmpl.Back}`;

  await ankiInvoke("updateModelTemplates", {
    model: {
      name: MODEL_NAME,
      templates: {
        [card1Name]: {
          Front: tmpl.Front,
          Back: patchedBack,
        },
      },
    },
  });
}

/** Upload a base64 file (or remote data URL) to Anki's media folder. */
export async function storeMediaFileB64(filename: string, base64: string): Promise<void> {
  await ankiInvoke("storeMediaFile", { filename, data: base64 });
}

export type AnkiNoteFields = {
  Sentence: string;
  Words: string;
  AudioFile: string;
  VideoId: string;
  StartSec: string;
  EndSec: string;
  Translation: string;
  TargetWord: string;
  WordDefinition: string;
  Screenshot: string;
};

export async function addNote(fields: AnkiNoteFields, tags: string[]): Promise<number> {
  return ankiInvoke<number>("addNote", {
    note: {
      deckName: DECK_NAME,
      modelName: MODEL_NAME,
      fields,
      tags,
      options: { allowDuplicate: true },
    },
  });
}
