# Night Shift — what can destroy this system

Written 2026-10-24, after wiping the plot back to genesis. Everything below was
checked against the repo, the DataStore or the GitHub API — nothing here is
guessed. Each item says how it kills the piece, what evidence exists, and whether
it is closed, mitigated, or waiting on him.

Severity: **S1** = the piece stops being the piece. **S2** = a night is lost.
**S3** = it degrades quietly.

---

## S1 — two nights at once fork the chain

`runNight()` is a read-then-write: read `ns:state`, build, PATCH `ns:state`. Two
runs that overlap both read the same head, both build, and the second PATCH
overwrites the first work's place in the index. The chain then holds a work
nothing points at, and the night is gone — with a green checkmark on both runs.

`night.yml` had no `concurrency:` block. `deploy.yml` always did.

**Fixed** in the v4 workflow (`~/Downloads/night.yml`): `group: night-shift`,
`cancel-in-progress: false`, so a manual dispatch queues behind the cron instead
of racing it. **Not live until he pastes it** — the PAT has `repo` scope only and
GitHub refuses workflow writes without `workflow`.

## S1 — the schedule is best-effort and nobody is told when it misses

GitHub's cron is a hint. The only scheduled run this repo ever had arrived
**2h59m late**, and the two nights after it never fired at all. A dropped slot
looks exactly like a night that worked: no error, no commit, no alert.

**Mitigated** in v4: a second slot at 23:00 UTC (06:00 Bangkok) as a retry — the
idempotent guard makes it a no-op when the first one succeeded — plus
`timeout-minutes: 20` so a hung fetch cannot hold the concurrency group for six
hours. `status` now says how many nights the schedule has missed.

**Open, and his to decide:** there is no alerting. If a night fails, the only
signal is GitHub's failure email to the repo owner. For a piece whose whole point
is that it runs unattended, silence is the failure mode.

## S1 — the calendar and the plot drifted apart

Every night from 20261025 was dispatched by hand, so the plot reached 20261104
while the calendar said 20261024. The guard is `state.night >= getNight()`, so
every scheduled run printed `already ran tonight`, exited 0 and built nothing —
for eleven days — while looking identical to a healthy night.

**Fixed** three ways: the plot was wiped (so it starts on the calendar's night,
20261024); the guard now prints the drift in days and the number to dispatch; and
`status` warns instead of PASSing when the plot is ahead, naming the catch-up
date.

**Recurs** if he hand-dispatches a future night again. The guard will say so, but
the rule is: dispatch only the night the calendar is on.

## S1 — the Roblox API key is the whole system, and it has already leaked once

Every night needs `ROBLOX_API_KEY` to read the plot and write the work. It sits
in plaintext in `orchestrator/.env` (gitignored — verified) and in repo secrets.
The key is 964 characters of base64 and it was **recoverable from a chat
transcript** earlier in this project; it is in a log somewhere.

**His to do:** rotate it in the Creator Dashboard, scope it to the five scopes
only, and put the new value in both places. Then never paste it into a chat.

Also confirmed today: the key has **no delete scope** (`DELETE` → 403 "Scope not
authorized"), which is why the wipe had to reset the index and tombstone the
blobs instead of removing them.

## S2 — a bad night is permanent

If tonight builds a void because of a transient failure (429, a 500 from the
provider, a truncated answer), the guard refuses to run the night again. The void
is signed into the chain, and the chain does not allow edits. The only repair is
`resync`, which restores what was written — not what should have been.

**Open.** The design for a fix, when he wants it: `REDO=1` re-runs tonight only
when the last work is *this* night's *void* — drop it from `ns:state`, set
`journalHead` back to its `prevHash`, rebuild, and let the night be made again.
Guarded so it can never touch a real work. Not built yet because it can un-write
the chain and that deserves its own test pass.

## S2 — the plot has a finite number of places

`freeSpot()` scans a 512×512 plot at 30-stud spacing: roughly **230 works** before
it throws. `hesitate()` catches that and falls back to (0,0), which then collides
with everything. At one work a night that is about seven months away, and the
piece has no ending written.

**Open.** Either the spacing shrinks, the plot grows, or the piece ends on
purpose. Worth deciding before it decides for us.

## S2 — the attention loop depends on a game nobody is watching

`ns:telemetry:*` is written by the Roblox game when a player comes near a work.
If the place is private, unpublished, or simply unvisited, the prompt honestly
says "nothing here has ever been seen" every night and the piece never learns
anything about its own work. It still builds — it just builds blind.

**Cannot be verified from here.** It needs a real visit to the published place.
If the answer is "nobody plays it", that is an artistic fact, not a bug — but it
should be a fact he knows.

## S3 — the LLM is a hard dependency on a free tier

Groq's free tier is 8000 tokens/minute. One night is a ~2.2k-token prompt with up
to three attempts; two attempts inside a minute can 429. `Retry-After` is now
honoured (capped at 60s) instead of a blind 15s wait, and the retry budget is
three, so a rate limit costs a night only when it persists past all three.

**Mitigated.** The residual risk is that the whole piece depends on one provider's
free quota. A fallback model would need the same JSON contract; the prompt already
carries it.

## S3 — a copied function breaks the copy nobody remembers

Three times now: `status.ts` (fixed `cd3327c`), then `timeline.html` — which
announced `chain broken at n20261103-a` on a healthy chain because it never
learned the `parts` rule. Both were the same hash walk, copied.

**Fixed** for the browser: `site/chain.js` is the only copy, both pages load it,
and a test fails if either page defines its own `sha256Hex` again. The TS side has
one verifier (`src/chain.ts`) used by resync, status and the tests.

## S3 — the site is derived, and derived things drift

`site/log.jsonl`, `previews/`, `raw/`, `telemetry.jsonl` are all rebuilt from the
DataStore by `resync`, which runs before every commit. That is the right shape and
it has already saved three nights. The residual risk is the opposite one: because
`resync` trusts the store, a compromised store rewrites the site silently.
Signatures cover it for signed works — after the wipe, everything is signed.

## S3 — things that grow forever

- `site/log.jsonl` is fetched whole by every page: ~1.2 KB per night, so ~440 KB
  a year. Fine now, will want splitting eventually.
- `site/raw/*.json` is ~9 KB a night, committed forever. ~3 MB a year.
- `ns:state.works` grows one small object a night. Now also carries `title`, so
  the prompt's "titles already used" list works — but the prompt itself grows with
  the plot's history. At 30 works the prompt is 7.4 KB; at 300 it will be large
  enough to matter for both cost and attention.

**Worth watching:** the prompt should eventually summarise old works rather than
list them all.

---

## Closed today

| what | how |
|---|---|
| empty plot rendered a black rectangle (the 3D page `return`ed before creating a renderer) | draws the ground, grid and axis; says "plot ว่าง" |
| `void` was a documented escape hatch that the constitution rejected | void is system-only; rejection carries a free site and a legal form |
| `params` missing killed a night | defaults to `{}` |
| hesitation stacked on (0,0) | `freeSpot()` ring scan |
| `hasAttention` was true from night two onward | `near > 0` |
| titles repeated three times | titles are in the prompt; `resync` backfills them |
| a malformed `NIGHT` became `night: NaN` in the hash | refused at `getNight()` |
| a multi-KB stack trace became a public `intent` | truncated to 200 |
| a green CI step with nothing committed looked like success | `status` exits 2 on site drift |

## What I would watch first

1. The first scheduled run after he pastes v4 — does it fire at 02:00, and does
   the second slot correctly no-op?
2. Whether the piece gets a visitor. Everything about attention is theory until
   someone walks up to a work.
3. The prompt's size at 30 works. That is where the next quiet failure lives.
