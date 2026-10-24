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

## S2 — the state entry has a ceiling, and it has a date

`ns:state` grows one ref per work, forever. A Roblox DataStore entry is capped at
**256 KB**, and `putEntry` fails once it is exceeded. After that every night fails,
permanently, with an error that reads like a network problem rather than "the plot
is full" — and `hesitate()` keeps writing voids at `freeSpot()` until the plot fills
too.

Measured 2026-10-24: **94 bytes a work**, 1,593 B for 17 works.

| works per night | nights to the ceiling | wall clock |
|---|---|---|
| 26 (the cap he asked for) | ~108 | ~4 months |
| 1 (the original design) | ~2,700 | ~7 years |

So the freedom to build many works per night also multiplies the cliff by 26. The
multi-work feature did not create this bug — it made a seven-year problem into a
four-month one.

**Mitigated, not fixed.** `status` now measures the entry and warns past 50%, with
the number of nights left. A cliff with a date on it should announce itself.

**The real fix, designed and not built:** split the chain into epochs.
`ns:state` keeps `journalHead`, the current epoch and only the works of that epoch;
`ns:epoch:{n}` holds the head of the closed epoch and the ids it covered, so
`verifyChain` walks epoch by epoch and the whole history still verifies. It is a
schema change touching the state shape the game reads, resync, status and the
prompt — worth doing deliberately, with its own migration, not in the same hour as
anything else.

Until then the guard makes the date visible, and `MAX_WORKS_PER_NIGHT` is the dial:
a lower cap buys proportionally more time.

---

## S3 — telemetry lost a whole server's attention, silently

- `site/log.jsonl` is fetched whole by every page: ~1.2 KB per night, so ~440 KB
  a year. Fine now, will want splitting eventually.
- `site/raw/*.json` is ~9 KB a night, committed forever. ~3 MB a year.
- `ns:state.works` grows one small object a night. Now also carries `title`, so
  the prompt's "titles already used" list works — but the prompt itself grows with
  the plot's history. At 30 works the prompt is 7.4 KB; at 300 it will be large
  enough to matter for both cost and attention.

**Worth watching:** the prompt should eventually summarise old works rather than
list them all.

## S1 — rotating the signing key bricks the pipeline — **fixed**

`writePublicKey()` overwrites `site/pubkey.pem` with whatever key is in
`NS_SIGNING_KEY`. `resync` verifies every signed work against **that** key and
exits **3** on a mismatch. So the moment the secret is regenerated:

1. the next night signs with the new key,
2. `pubkey.pem` is overwritten,
3. every previously signed work now fails verification,
4. `resync` exits 3 → the workflow fails → **and every night after it fails too**,
   because the old signatures can never verify against the new public key.

The pipeline does not degrade; it stops, permanently, with an error that looks
exactly like tampering. And there is nothing in the code that says "this is a key
rotation" — it is indistinguishable from someone editing history.

**Fixed.** Keys are now append-only and a signature is valid if it verifies
against **any** published key:

| where | what |
|---|---|
| `site/pubkeys/{fingerprint}.pem` | one file per key ever used, never deleted |
| `site/pubkey.pem` | the CURRENT key, for anything that already reads it |
| `ns:pubkeys` | `[{fp, pem}]` in the DataStore — the authoritative history, because the store is the truth |

`resync` and `status` verify against the whole ring, so a rotation adds a key
instead of invalidating the old ones. Proven: with a fresh key written into the
ring, the existing work's signature still verifies (`true`), while the same
signature against the new key alone returns `null` — the brick, reproduced and
then removed. A tampered hash fails against the whole ring, so the ring does not
weaken the attestation.

The rule that remains: **losing** the private key is survivable (works become
unsigned, nothing breaks). Rotating it is now survivable too, but a work signed
by a key that was never published cannot be verified by anyone, ever — so publish
first, rotate second.

## S2 — the game and the site can disagree — **detector shipped, install still manual**

`src/builder.lua` is installed into the place by `tools/install-studio.py`, which
needs Studio open, the place loaded and the MCP bridge enabled. It is a manual
step, and it is **not** a runtime dependency: once installed and published, the
place runs on Roblox's servers whether or not this Mac is awake. Studio is only
needed again when one of the three Luau files changes.

That is the whole risk, and it is small but silent: change `builder.lua`, forget
the install, and the repo and the place drift apart. The site then shows a work
the game builds differently, and every check still passes because every check
reads the orchestrator and never the place.

**Detector shipped.** `BUILDER_VERSION` at the top of `builder.lua` is bumped by
hand in the same commit as any change to that file. Every server start writes it
to `ns:builder` (one write, inside a `pcall` — a failed heartbeat must never stop
the plot from being built). Then:

| where | what it says |
|---|---|
| `npm run status` | `PASS place is running v3` / `FAIL the place is running v2, the repo has v3 — run tools/install-studio.py` |
| the site footer | `place v3 · in sync` / `place v2 · STALE (repo v3)` / `place: never reported` |

A missing heartbeat is a WARN, not a failure: a brand new place, or one nobody
has played since the heartbeat was added, has nothing to report — and failing
there would punish exactly the state the check exists to fix. A place *behind*
the repo is a FAIL, because that is the game building with old code.

**What it cannot do:** repair the place. Only `install-studio.py` can. The
detector makes the drift a line instead of a mystery.

**Still manual:** the install itself, and the fact that the heartbeat only updates
when someone actually joins the place. If nobody ever plays, `status` says
"never reported" forever — which is also true, and is the more important fact.

## S3 — latent: the preview writes the title into SVG unescaped

`preview.ts` interpolates `w.title` straight into `<text>`. That is safe **only**
because the 200-word lexicon cannot produce `<` or `&`. It is one schema change
away from being an injection, and it would be a silent one. Same in `renderParts`.

## S3 — the site and the store disagree about what "empty" means

`resync` writes `"\n"` for an empty plot, `index.html` trims it to nothing, and the
3D page draws the ground with no works. All three agree today; none of them is
tested against zero works. The 2026-10-24 reset was the first time the site had
ever run with an empty plot — and it was broken (black rectangle).

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
| `resync`/`status` died on a half-written line in log.jsonl — the repair tool killed by the thing it repairs | a line that will not parse is skipped, reported, and rewritten from the store |
| `status` thought the schedule had one slot | it knows both, and which one is next |

## What I would watch first

1. The first scheduled run after he pastes v4 — does it fire at 02:00, and does
   the second slot correctly no-op?
2. Whether the piece gets a visitor. Everything about attention is theory until
   someone walks up to a work.
3. The prompt's size at 30 works. That is where the next quiet failure lives.

---

## S1 — the store can reorder an entry's keys asynchronously

The canonical-hash fix above was diagnosed as "the DataStore sorts keys". Two
experiments on 2026-10-24 say that is only half of it:

- write a value, read it straight back → **key order preserved**, for both orders
  tested
- `n20261025-c` verified at 05:55 and failed at 20:23 **with no write from us in
  between**

So the store does not normalise at write time; it normalises *later*, on its own
schedule, for some entries. A hash over the raw serialisation is therefore not
merely wrong for some values — it is **unstable over time**, and a chain can flip
from verified to broken between two runs that changed nothing.

That is worse than a deterministic bug, because it destroys the meaning of a green
run: `resync` said "chain verified ✓" for the same data `status` called BROKEN.
The canonical form is the only version that survives this, which is why the fix is
not "hash a sorted copy" but "hash a form that cannot be reordered".

**Corollary worth keeping:** any value that crosses a store and is later hashed,
compared or signed must be canonicalised *at the boundary*, not assumed stable
because it was stable when it was written.

---

## S2 — one transient store error cost a whole night

The LLM path has had three attempts and a backoff for a while. The DataStore path
had **one shot**. On 2026-10-24 a read returned `502` and took the run with it — a
night that cannot read the plot cannot build on it, and the idempotent guard then
refuses to run that night again, so one transient error became a permanent empty
night.

`withRetry` now wraps every store call: 429/500/502/503/504 and a thrown `fetch`
(DNS, socket, TLS) are retried with 1s/3s/7s backoff. **404 is never retried** — it
is the answer "no such entry", not a failure — and neither are 400/403, which fail
identically forever and only slow the error down.

`publish` is retried deliberately: a dropped message means the live game does not
build the work until it restarts, and a duplicate is harmless because `build()`
destroys the existing model before rebuilding, so the subscriber is idempotent.

38 tests, including one that drives a stubbed `fetch` through 502→503→success, a
thrown socket error, a 404 that must not retry, a 403 that must not retry, and an
exhausted retry budget that must still throw.

---

## S1 — Roblox does not coerce a table into a Vector3

One line took down every assembly:

  p.Size = { 1, 2, 3 }   →   "Unable to assign property Size. Vector3 expected, got table"

`addPart` passed a plain table for size, so all five works with `parts` failed
while all twelve templated works — which build their sizes with `Vector3.new` —
were fine. Found by the heartbeat's error text after four versions of counting,
naming, and re-testing.

Fixed with a `v3()` coercion in `part()` and `wedge()`, the two places that
assign a size.

**Proven, not assumed.** A Luau harness (`tools/` — Roblox API stubbed: Instance,
Enum, Vector3, CFrame, Color3, UDim2, DataStoreService, MessagingService) runs the
REAL `builder.lua` against the REAL works from `site/log.jsonl`:

  before (v10):  11 built, 6 failed   ← the five assemblies, on exactly that error
  after  (v11):  16 built, 1 failed   ← and the one is `label.Size`, a UDim2 the
                                         stub wrongly type-checks as a Vector3

The harness is now the regression guard for this class: any future table passed
where Roblox wants a Vector3 fails locally instead of in a published place.
