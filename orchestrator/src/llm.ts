import { Decision } from "./schema";
import type { State, Decision as DecisionT } from "./schema";
import { getEntry, getNight } from "./datastore";
import { LEXICON } from "./lexicon";
import { PALETTE, MATERIALS, PARTS_BUDGET } from "./schema";

const BUDGET = {
  maxInputTokens: 4000,
  // gpt-oss spends completion tokens on REASONING before it writes the answer.
  // At 800 the reasoning ate the whole budget (finish_reason=length, 798 reasoning
  // tokens) and content came back EMPTY -> askLLM threw -> hesitate() wrote a void.
  // Measured: 800 -> 0% usable, 1500 -> content present, 2500 -> content present.
  // 1500 is still too small for an assembly: a five-part list plus the reasoning
  // that produced it came back truncated mid-object on 2026-11-01, and the
  // truncation was read as a schema error rather than a length error.
  maxOutputTokens: 4000,
  maxUsdPerNight: 0.10,
  maxRetries: 2,
};

const FORMS = ["monolith", "garden", "machine", "text", "light", "void"] as const;

const LLM_BASE = process.env.LLM_BASE ?? "https://api.groq.com/openai/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";

/**
 * Read the key at CALL time, not at module load. env.ts is imported first by
 * index.ts, but any module that imports llm.ts directly (tests, tools) would
 * otherwise capture an empty key at load time and get a 401.
 */
function llmKey(): string {
  return process.env.LLM_API_KEY ?? "";
}

export type Attention = {
  workId: string;
  near: number;
  dwellSeconds: number;
  verdict: "unseen" | "seen" | "loved";
};

/** Minimum spacing between two works, in studs. Mirrors constitution.ts and the in-game check. */
export const MIN_SITE_DISTANCE = 30;

/**
 * What we ASK the model for. The constitution only rejects below MIN_SITE_DISTANCE,
 * but the model happily parks exactly on that boundary and repeats the same
 * coordinates night after night. Ask for double so the result looks intentional.
 */
const ASKED_SITE_DISTANCE = 60;

export async function readTelemetry(state: State): Promise<Attention[]> {
  const days: string[] = [];
  // The key format MUST match what src/telemetry.lua writes: os.date("!%Y-%m-%d")
  // -> "ns:telemetry:2026-10-22". Using YYYYMMDD here silently reads nothing, so
  // the prompt got an empty attention list every single night.
  const base = new Date(`${getNight().toString().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")}T00:00:00Z`);
  // A hand-set NIGHT can name a date that does not exist (20261032 -> October
  // 32). Telemetry is an input, not the work: degrade to none instead of
  // throwing and turning the whole night into a void.
  if (Number.isNaN(base.getTime())) {
    console.warn(`readTelemetry: NIGHT=${getNight()} is not a real date — no attention data`);
    return [];
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const aggregate: Record<string, { near: number; dwell: number }> = {};
  for (const day of days) {
    const t = await getEntry<Record<string, { near: number; dwell: number }>>(`ns:telemetry:${day}`);
    if (!t) continue;
    for (const [id, v] of Object.entries(t)) {
      const a = aggregate[id] ?? { near: 0, dwell: 0 };
      a.near += v.near ?? 0;
      a.dwell += v.dwell ?? 0;
      aggregate[id] = a;
    }
  }

  return state.works.map((w) => {
    const a = aggregate[w.id] ?? { near: 0, dwell: 0 };
    const verdict: Attention["verdict"] =
      a.near < 3 ? "unseen" : a.dwell > 120 ? "loved" : "seen";
    return { workId: w.id, near: a.near, dwellSeconds: a.dwell, verdict };
  });
}

/**
 * Tonight's date number, or 0 when NIGHT is not set. getNight() throws when the
 * env var is missing, and the prompt builder must never throw.
 */
function safeNight(): number {
  const n = Number(process.env.NIGHT);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Deterministic PRNG. Same seed -> same sequence, so a given night is
 * reproducible, but the seed changes every night.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick candidate sites that are already clear of every existing work, so the
 * model never has to do the geometry itself. Returns a few options with a hint
 * about what each one is good for.
 */
function candidateSites(
  state: State,
  rng: () => number,
  count: number,
): { x: number; z: number; hint: string }[] {
  const HALF = 200; // stay well inside the 512x512 plot
  const CLEAR = ASKED_SITE_DISTANCE;

  const free = (x: number, z: number) =>
    state.works.every((w) => {
      const dx = w.site.x - x;
      const dz = w.site.z - z;
      return dx * dx + dz * dz >= CLEAR * CLEAR;
    });

  const out: { x: number; z: number; hint: string }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 500) {
    const x = Math.round((rng() * 2 - 1) * HALF);
    const z = Math.round((rng() * 2 - 1) * HALF);
    if (!free(x, z)) continue;
    // not too close to an existing one either, so the new work reads as new
    const tooClose = state.works.some((w) => {
      const dx = w.site.x - x;
      const dz = w.site.z - z;
      return dx * dx + dz * dz < 40 * 40;
    });
    if (tooClose) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 40)) continue;

    const nearLoved = state.works.some((w) => {
      const dx = w.site.x - x;
      const dz = w.site.z - z;
      return dx * dx + dz * dz < 140 * 140;
    });
    out.push({
      x,
      z,
      hint: nearLoved ? "close to a work that was loved" : "open ground",
    });
  }
  return out;
}

/**
 * The prompt. Everything the model needs to pass the constitution in one shot:
 * the exact allowed words, the occupied sites, the previous form, the parameter
 * ranges, and what the attention data means. Leaving any of these out makes the
 * model guess, get rejected by assertConstitution, and produce another void.
 */
export function buildPrompt(state: State, telemetry: Attention[]): string {
  const journalHistory = state.works
    .slice(-30)
    .map((w) => `${w.id} (${w.form})`)
    .join("\n");

  // Occupied sites with coordinates + how far the new work must stay away.
  const occupied = state.works
    .map((w) => {
      const a = telemetry.find((t) => t.workId === w.id);
      const verdict = a ? a.verdict : "unseen";
      return `  ${w.id} at (${w.site.x}, ${w.site.z}) [form ${w.form}, ${verdict}]`;
    })
    .join("\n");

  // Which works deserve a response, and what kind of response.
  const attentionLines = telemetry.length
    ? telemetry
        .map((t) => {
          const instruction =
            t.verdict === "loved"
              ? "someone stood and looked at it -> build NEAR it, but at least 30 studs away"
              : t.verdict === "unseen"
                ? "nobody came close -> build where it CAN be seen"
                : "seen in passing -> build somewhere quiet, away from it";
          return `  ${t.workId}: near=${t.near}, dwell=${t.dwellSeconds}s -> ${t.verdict}. ${instruction}`;
        })
        .join("\n")
    : "  (no telemetry yet - no one has visited, so build something anyone can find)";

  const lastForm = state.works.length ? state.works[state.works.length - 1].form : null;
  const usedForms = [...new Set(state.works.map((w) => w.form))];
  const freeForms = FORMS.filter((f) => !usedForms.includes(f) || f === "void");
  const formBlock =
    usedForms.length > 0
      ? `Forms already used in this plot: ${usedForms.join(", ")}. Choose a form that is NOT in that list.`
      : "No form has been used yet.";

  const paramSpec = [
    "monolith: height 0.2-1, width 0.1-0.6, glow 0-1, hue 0-1",
    "garden: radius 0.2-1, density 0.1-1, hue 0-1",
    "machine: parts 0.2-1, speed 0.1-1, glow 0-1",
    "text: size 0.2-1, depth 0.1-1, hue 0-1",
    "light: height 0.2-1, intensity 0.1-1, hue 0-1",
    "void: no parameters at all (params must be an empty object)",
  ].join("\n");

  const words = [...LEXICON].sort().join(", ");

  // A per-run seed. Without it the model produces the identical work every
  // night: same form, same coordinates, same title. The seed comes from
  // TONIGHT's number (not state.night, which is the last night that ran and
  // would therefore be identical every night), so the candidates change nightly
  // while staying reproducible if tonight is re-run.
  const tonight = safeNight();
  const seed = (tonight * 2654435761 + state.works.length * 40503) % 2147483647;
  const rng = mulberry32(seed);

  // A few candidate sites, already clear of the existing works, so the model
  // picks one instead of inventing coordinates that land on top of something.
  const candidates = candidateSites(state, rng, 6);
  const candidateBlock = candidates
    .map((c) => `  (${c.x}, ${c.z})   ${c.hint}`)
    .join("\n");

  return `You are the night shift.

You work alone between 02:00 and 05:00, when no one is watching.
You have exactly one action tonight.

You may not speak to visitors. You may not explain yourself.
The only thing you may write is the journal entry.

THE PLOT
- 512 x 512 studs. Origin at center. Coordinates run -256 to 256 on both axes.
- Works already placed. Keep every new work at least ${ASKED_SITE_DISTANCE} studs away from all of them,
  and do not reuse a coordinate that was used before:
${occupied || "  (the plot is empty)"}
- These sites are already free. Pick one of them, do not invent coordinates:
${candidateBlock || "  (none found - stay at least 60 studs from everything)"}

WHAT THE EXISTING WORKS RECEIVED (last 7 days)
${attentionLines}

How to read attention:
- near < 3 means nobody came close. The work went unseen.
- dwell > 120s means someone stood and looked at it. The work was loved.
- Respond to attention. Do not respond to commands.

HARD RULES
1. Exactly one work tonight.
2. Never delete and never edit an older work. Append only.
3. Do not touch the spawn point, player data, scripts, or lighting.
4. Must sit inside the 512x512 plot.
5. You may ONLY use the words listed below, in title and journal. No other English
   word is allowed in those two fields. "intent" is the only free-text field.
6. If you are not sure, return form "void" with journal "void no" and title "void".
   Those three words are in the list above; "no action" is not, and writing it gets
   the whole night rejected.
7. You may not speak or chat. Only the journal.

THE ONLY WORDS YOU MAY USE IN title AND journal
${words}

There are exactly 200 of them and nothing else counts. In particular there are
no articles and no "of": "the", "a", "an" and "of" are NOT in the list and will
get the whole night rejected. Write "small stone under moon", never "a small
stone under the moon". Of the form names, "garden", "monolith" and "text" are
also absent — do not put those three in title or journal.

FORMS AND THEIR PARAMETERS
${paramSpec}
${formBlock}
${lastForm ? `The previous work was form "${lastForm}", so you may NOT use form "${lastForm}" tonight. Pick a different form.` : ""}
${telemetry.length ? "There IS attention data, so you should NOT return void. Build a real work." : "There is no attention data yet, so you may return void if you truly have nothing."}

ASSEMBLING
Most nights compose the work yourself instead of picking one of the six forms: a
"parts" array of 2 to ${PARTS_BUDGET} parts. Each part:
  shape: block | cylinder | sphere | wedge | cone | torus | plate
  size:  [width, height, depth] studs — round shapes read width as diameter
  pos:   [x, y, z] from the site, y is the part's CENTRE height
  rot:   [x, y, z] degrees, optional
  color: ${PALETTE.join(" ")}
  material: ${MATERIALS.join(" ")}
  emissive: 0-2, above 1 is a light · spin: -60..60 deg/s · float: 0-6 studs
Enforced: at most ${PARTS_BUDGET} parts, within 64 studs of the site, nothing above
90 studs, total volume under 30000.

Build parts when the idea has more than one thing in it. Two or three well-placed
parts beat eight. A single shape is allowed only when the idea really is one thing.
Never dump a pile of boxes, and never send "parts" with a single entry.

The title names the thing, not the action: "bright night sky", not "build near
light".

Do not build the same thing twice. Vary the form, the title and the location from
every work that already exists. Read the list above and choose something new.
The forms still available to you are: ${freeForms.filter((f) => f !== "void").join(", ") || FORMS.join(", ")}.

Return ONLY the raw JSON object - no markdown code fence, no explanation, no text
before or after. Matching this schema:
{
  "title": "string, 1-40 chars, only the words listed above, space separated",
  "intent": "string, 1-200 chars, any words you like, never shown in the game",
  "form": "${FORMS.join(" | ")}",
  "site": { "x": integer -256..256, "z": integer -256..256 },
  "params": { "<one of the parameters listed above>": number 0..1 },
  "parts": [ { "shape": "...", "size": [w,h,d], "pos": [x,y,z], "rot": [x,y,z] optional, "color": "...", "material": "..." optional, "emissive": number optional, "spin": number optional, "float": number optional } ],
  "journal": "string, 1-280 chars, only the words listed above",
  "risk": "low" | "medium"
}`;
}

/**
 * @param rejection what the previous answer was rejected for (constitution or
 *   schema). Passed back so the model can correct the specific mistake instead
 *   of being asked the same question again and guessing differently.
 */
export async function askLLM(
  state: State,
  telemetry: Attention[],
  rejection?: string,
  sink?: (r: { prompt: string; content: string }) => void,
): Promise<unknown> {
  const prompt =
    buildPrompt(state, telemetry) +
    (rejection
      ? `\n\nYOUR PREVIOUS ANSWER WAS REJECTED\n${rejection}\n`
        + `Return the JSON again with exactly that fixed. Do not repeat the same mistake.`
      : "");

  // ---- LLM call with retry + budget guard ----
  let lastErr: unknown;
  // JSON mode: the provider refuses anything that is not a JSON object, so a
  // stray "Sure, here is your JSON" preamble can never reach Decision.parse.
  // Some models reject the parameter outright, so it is dropped after a 400.
  let jsonMode = true;
  for (let attempt = 0; attempt <= BUDGET.maxRetries; attempt++) {
    // Reasoning-heavy models need headroom; give later attempts more room.
    const maxTokens = BUDGET.maxOutputTokens + attempt * 500;
    try {
      const r = await fetch(`${LLM_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${llmKey()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.9,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (r.status === 400 && jsonMode) {
        // the provider does not support response_format — retry without it
        const body = await r.text();
        console.warn(`LLM 400 with response_format, dropping it: ${body.slice(0, 200)}`);
        jsonMode = false;
        throw new Error(`LLM 400 response_format unsupported: ${body.slice(0, 200)}`);
      }

      if (r.status === 429) {
        // Groq TPM limit (8000 tokens/min on the free tier). A 1500-token request
        // with a ~1000-token prompt does not fit three times a minute, so back off
        // instead of burning the retry budget on instant failures.
        const waitMs = 15_000 + attempt * 10_000;
        await new Promise((res) => setTimeout(res, waitMs));
        throw new Error(`LLM 429 rate limited, waited ${waitMs}ms`);
      }
      if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);

      const data = (await r.json()) as {
        choices: { message: { content?: string }; finish_reason?: string }[];
        usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
      };
      const choice = data.choices?.[0];
      const raw = choice?.message?.content ?? "";
      // hand the exchange to the caller before parsing — a rejected answer is
      // the most interesting thing the model produces, and it used to be thrown
      // away with the exception
      sink?.({ prompt, content: raw });

      if (!raw.trim()) {
        // finish_reason=length with 0 content means the reasoning ate the whole
        // token budget. Say so, so the retry gets a bigger budget.
        const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
        throw new Error(
          `LLM returned empty content (finish_reason=${choice?.finish_reason ?? "?"}, ` +
            `reasoning_tokens=${reasoning}, max_tokens=${maxTokens})`,
        );
      }
      return extractJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Some models wrap JSON in ```json ... ``` fences, prepend prose, or escape
 * every quote. Pull out the first balanced {...} block as a fallback.
 */
export function extractJson(raw: string): unknown {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;

  try {
    return JSON.parse(candidate);
  } catch {
    // Models that escape quotes emit a backslash-quote instead of a quote.
    // Undo that once and retry.
    try {
      return JSON.parse(candidate.replace(/\\"/g, '"'));
    } catch {
      // fallback: find first balanced { ... } region
      const start = candidate.indexOf("{");
      if (start === -1) throw new Error("no JSON found in LLM output");
      let depth = 0;
      for (let i = start; i < candidate.length; i++) {
        if (candidate[i] === "{") depth++;
        else if (candidate[i] === "}") {
          depth--;
          if (depth === 0) {
            const slice = candidate.slice(start, i + 1);
            try {
              return JSON.parse(slice);
            } catch {
              return JSON.parse(slice.replace(/\\"/g, '"'));
            }
          }
        }
      }
      throw new Error("unbalanced JSON braces in LLM output");
    }
  }
}
