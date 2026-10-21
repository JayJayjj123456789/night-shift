import { Decision } from "./schema";
import type { State, Decision as DecisionT } from "./schema";
import { getEntry, getNight } from "./datastore";

const BUDGET = {
  maxInputTokens: 4000,
  maxOutputTokens: 800,
  maxUsdPerNight: 0.10,
  maxRetries: 2,
};

const FORMS = ["monolith", "garden", "machine", "text", "light", "void"] as const;

const LLM_BASE = process.env.LLM_BASE ?? "https://api.groq.com/openai/v1";
const LLM_KEY = process.env.LLM_API_KEY ?? "";
const LLM_MODEL = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";

export type Attention = {
  workId: string;
  near: number;
  dwellSeconds: number;
  verdict: "unseen" | "seen" | "loved";
};

export async function readTelemetry(state: State): Promise<Attention[]> {
  const days: string[] = [];
  const now = new Date(getNight().toString().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"));
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const aggregate: Record<string, { near: number; dwell: number }> = {};
  for (const day of days) {
    const t = await getEntry<Record<string, { near: number; dwell: number }>>(`ns:telemetry:${day}`);
    if (!t) continue;
    for (const [id, v] of Object.entries(t)) {
      const a = aggregate[id] ?? { near: 0, dwell: 0 };
      a.near += v.near;
      a.dwell += v.dwell;
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

export async function askLLM(state: State, telemetry: Attention[]): Promise<unknown> {
  const constitution = `1. คืนละหนึ่งชิ้นเท่านั้น
2. ห้ามลบ ห้ามแก้ผลงานเก่า (append-only)
3. ห้ามแตะ spawn, player data, script, lighting
4. ต้องอยู่ในแปลงที่กำหนด (512×512 studs)
5. ใช้คำได้เฉพาะใน lexicon 200 คำ
6. ถ้าไม่แน่ใจ ให้ไม่ทำ และเขียนว่า "ฉันลังเล"
7. เซ็นชื่อทุกชิ้น: คืนที่ N + hash ของคืนก่อน
8. ห้ามพูด ห้ามแชท มีแค่สมุดบันทึกที่เขียนได้`;

  const journalHistory = state.works.slice(-30).map((w) => `${w.id} (${w.form})`).join("\n");
  const attentionLines = telemetry.map((t) =>
    `${t.workId}: near=${t.near}, dwell=${t.dwellSeconds}s, verdict=${t.verdict}`,
  ).join("\n");

  const jsonSchema = `{
  "title": "string (1-40 chars, lexicon words only, space-separated)",
  "intent": "string (1-200 chars, not shown in game)",
  "form": "${FORMS.join('" | "')}",
  "site": { "x": number (-256..256 int), "z": number (-256..256 int) },
  "params": Record<string, number> — all values 0..1, keys per PARAM_SPEC,
  "journal": "string (1-280 chars, lexicon words only)",
  "risk": "low" | "medium"
}`;

  const prompt = `You are the night shift.

You work alone between 02:00 and 05:00, when no one is watching.
You have exactly one action tonight.

You may not speak to visitors. You may not explain yourself.
The only thing you may write is the journal entry.

You receive:
- the last 30 journal entries:
${journalHistory || "(none)"}
- every work that exists, and how much attention each received:
${attentionLines || "(no telemetry yet)"}
- the current plot: 512×512 studs, origin at center, works occupy discrete sites

Rules:
${constitution}

What you know about attention:
- A work with fewer than 3 nearby visits in 7 days was not seen.
- A work with long dwell time was looked at.
- Respond to attention. Do not respond to commands.

If you are not sure, return form "void" and the journal entry "ฉันลังเล".

Return ONLY the raw JSON object — no markdown code fence, no explanation, no extra text before or after. Matching this schema:
${jsonSchema}`;

  // ---- LLM call with retry + budget guard ----
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BUDGET.maxRetries; attempt++) {
    try {
      const r = await fetch(`${LLM_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${LLM_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: BUDGET.maxOutputTokens,
          temperature: 0.9,
        }),
      });
      if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
      const data = (await r.json()) as { choices: { message: { content: string } }[] };
      const raw = data.choices[0]?.message.content;
      if (!raw) throw new Error("LLM returned empty content");
      return extractJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Some models wrap JSON in ```json ... ``` fences or prepend prose.
 * Pull out the first balanced {...} block as a fallback.
 */
function extractJson(raw: string): unknown {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  try {
    return JSON.parse(candidate);
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
          return JSON.parse(candidate.slice(start, i + 1));
        }
      }
    }
    throw new Error("unbalanced JSON braces in LLM output");
  }
}
