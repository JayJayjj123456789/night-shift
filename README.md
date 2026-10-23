# Night Shift — ตั้งค่าทีละขั้น

> AI ทำงานคนเดียว 02:00–05:00 Asia/Bangkok สร้างของหนึ่งชิ้น/คืนในแปลง 512×512 มีสมุดบันทึก 200 คำ + hash chain

**สถานะ: LIVE** — 3 ชิ้นจริงในแปลง (`void` · `monolith` · `light`) · hash chain ผ่าน · telemetry มีข้อมูลจริง (near=182, dwell=910) · cron ทุกคืน 02:00 ไทย · หน้าเว็บ GitHub Pages

> คืน `n20261023-a` (light @ 78,163) รันสำเร็จตั้งแต่ 23 ต.ค. แต่ push ไม่ผ่านเพราะ token เป็น read-only — กู้คืนเข้า `site/log.jsonl` แล้วด้วย `npm run resync` (commit `cad7651`) รายละเอียดในหัวข้อ Troubleshooting

สเปคเต็ม: `/Users/thxdadloveyoumost/jjfolder/testing folder/night-shift.md`

---

## ภาพรวมระบบ

```text
┌──────────────────────────────┐           ┌──────────────────────────────┐              ┌────────────────────────────────┐
│ 1. GitHub Actions            │node dist/ │ 2. orchestrator / index.js   │PATCH         │ 6. Roblox Open Cloud           │
│ night.yml, cron 0 19 * *     │index.js   │ node 20, NIGHT=YYYYMMDD TH   │ns:state      │ DataStore NightShift_v1        │
│ = 02:00 Asia/Bangkok         │──────────▶│ idempotent: existing->skip   │─────────────▶│ ns:state  ns:work:{id}         │
│ manual: workflow_dispatch    │           │ reads telemetry 7 days       │              │ ns:journal  ns:telemetry       │
└──────────────────────────────┘           └──────────────────────────────┘              └────────────────────────────────┘
               │                                          │ POST /v1/chat                                │ on change
               │                                          │ completions                                  │ from ns:state
               │  npm ci / build                          ▼                                              ▼
               │  node                     ┌──────────────────────────────┐              ┌────────────────────────────────┐
               │  dist/index.js            │ askLLM                       │              │ publishMessage                 │
               │                           │ Groq openai/gpt-oss-120b     │◀──┘          │ topic 'nightshift' (bus)       │
               │                           │ budget 4K in / 800 out       │   │          └────────────────────────────────┘
               │                           └──────────────────────────────┘   │ telemetry                │ MessagingSvc
               │                                          │ raw JSON          │7-day feed                ▼
               │                                          ▼                   ▲          ┌────────────────────────────────┐
               │                           ┌──────────────────────────────┐   │          │ Studio place 'Night shift'     │
               │                           │ 3. constitution (Zod+rules)  │   │          │ builder.lua  6 forms           │
               │                           │ 6 forms / lexicon 200 words  │   ───────────┤ telemetry.lua near/dwell 5s    │
               │                           │ bounds, no-collision         │              │ journal.lua  7 entries         │
               │                           │ no repeat-form               │              └────────────────────────────────┘
               │                           └──────────────────────────────┘                              │ rebuild on boot
               │                                          │ canonical                                    ▼
               │                                          ▼                              ┌────────────────────────────────┐
               │                           ┌──────────────────────────────┐              │ plot 512 x 512                 │
               │                           │ sha256(night,title,form,x,z) │              │ monolith garden machine        │
               │                           │ prev -> journalHead 16hex    │              │ text light void                │
               │                           └──────────────────────────────┘              └────────────────────────────────┘
               │                                          │ journalHead
               ▼                                          ▼
┌──────────────────────────────┐log.jsonl  ┌──────────────────────────────┐
│ git-auto-commit              │previews   │ pass -> n{NIGHT}-a (real)    │
│ site/log.jsonl + previews/   │◀──────────│ fail -> hesitate() -> void   │
└──────────────────────────────┘           │ hesitate is still a result   │
               │  push                     └──────────────────────────────┘
               ▼
┌──────────────────────────────┐
│ 4. deploy.yml (Pages)        │
│ on push site/** -> Pages     │
│ Pages source = Actions       │
└──────────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│ 5. GitHub Pages              │
│ jayjayjj123456789.github.io  │
└──────────────────────────────┘
```

**อ่านทิศทาง:** ทุกคืน 02:00 ไทย GitHub Actions เรียก orchestrator → orchestrator ถาม LLM → ผ่าน constitution → คำนวณ hash → เขียน DataStore + publish → Studio สร้างของจริงในแปลง 512×512 → orchestrator commit log + preview → deploy.yml ขึ้น GitHub Pages

**ดูแบบภาพ (SVG):** [`site/architecture.html`](site/architecture.html) — deploy ขึ้น Pages แล้วที่ https://jayjayjj123456789.github.io/night-shift/architecture.html (ผูกจากหน้าแรกด้วย)

**ลูกศรย้อนกลับ (ขวาล่าง):** `telemetry.lua` เก็บ near/dwell ของผู้เล่น → `ns:telemetry` → orchestrator อ่านย้อนหลัง 7 วัน → ป้อนกลับเข้า `askLLM` เป็นบริบท (AI เรียนรู้จากคืนก่อน ๆ)

---

## โครงสร้าง

```
night-shift/
├── .github/workflows/        ← night.yml (cron) + deploy.yml (Pages)
├── README.md
├── src/                      ← Luau scripts (ใส่ใน Studio)
│   ├── builder.lua           ← NightShiftBuilder (6 form)
│   ├── telemetry.lua         ← NightShiftTelemetry (near/dwell)
│   └── journal.lua           ← NightShiftJournal (แผ่นจารึก)
├── orchestrator/             ← TypeScript (รันตอน 02:00)
│   ├── src/{schema,datastore,llm,constitution,hash,preview,env,index}.ts
│   │     + lexicon.ts (200 คำ) + test-llm.ts + mock-dryrun.ts
│   └── .env.example          ← template (key ใน .env ไม่ commit)
└── site/                     ← GitHub Pages
    ├── index.html            ← static log + hash verify ฝั่ง client
    ├── log.jsonl             ← แต่ละคืน orchestor append (auto-commit)
    └── previews/*.svg        ← renderPreview (auto-commit)
```

---

## ขั้นที่ 1 — Luau scripts ใน Studio

**ทางเร็ว — installer อัตโนมัติ:**

```bash
python3 tools/install-studio.py            # เขียน scripts + สร้างแปลง 512x512
python3 tools/install-studio.py --check    # ตรวจว่ามีอยู่ครบไหม (เขียนอะไรไม่ได้)
python3 tools/install-studio.py --dry-run  # ดูแผนก่อนลงมือ
```

installer คุยกับ Studio ผ่าน MCP stdio ตรงๆ (ไม่ต้อง Rojo, ไม่ต้องคัดลอกเอง)
- เลือก place จาก `placeId` (default `137052081975336`) หรือ `--name`
- เขียน `NightShiftBuilder` / `NightShiftTelemetry` / `NightShiftJournal` ลง `ServerScriptService`
- สร้าง `Workspace.NightShift.NightShiftPlot` ขนาด 512×512
- **idempotent** — รันซ้ำได้ ไม่พัง

> ⚠️ ต้องเปิด Roblox Studio ค้างไว้ พร้อมเปิด place แล้ว
> Studio → Assistant → `…` → Manage MCP Servers → เปิด **"Enable Studio as MCP server"**

**ทางแมนวล:** copy `src/*.lua` → สร้าง `Script` ชื่อ `NightShiftBuilder` / `NightShiftTelemetry` / `NightShiftJournal` ใน `ServerScriptService`

**สำคัญ:** Studio → Game Settings → Security → เปิด **Enable Studio Access to API Services** ไม่งั้น DataStore `GetAsync` fail ใน playtest

### แปลง 512×512

```lua
local root = workspace:FindFirstChild("NightShift")
if not root then root = Instance.new("Folder"); root.Name = "NightShift"; root.Parent = workspace end
local plot = Instance.new("Part")
plot.Name = "NightShiftPlot"; plot.Anchored = true
plot.Size = Vector3.new(512, 0.5, 512); plot.CFrame = CFrame.new(0, 0.1, 0)
plot.Material = Enum.Material.Neon; plot.Color = Color3.fromHSV(0.6, 0.4, 0.3)
plot.Transparency = 0.85; plot.CanCollide = false; plot.Parent = root
```

---

## ขั้นที่ 2 — Open Cloud API key (GOTCHA สำคัญ)

ไป https://create.roblox.com/dashboard/credentials → Create API key → ชื่อ `night-shift`

### Scopes (ครบ 5 ตัวนี้เท่านั้น)

| Scope | ใช้ทำอะไร |
|---|---|
| `universe-datastores.control:create` | **ต้องมี** — สำหรับ PATCH `allowMissing=true` สร้าง store/entry (ขาดอันนี้ = 403) |
| `universe-datastores.objects:read` | อ่าน state/telemetry |
| `universe-datastores.objects:update` | เขียน work + state |
| `universe-datastores.objects:create` | เขียน entry ใหม่ |
| `universe.messaging-service:publish` | publish `nightshift` topic |

> ❌ หลงทางเจอมาแล้ว: `objects:read/update/create` **ไม่พอ** — ต้องมี `control:create` ด้วย ไม่งั้น `putEntry` จะ 403 `Not authorized, missing scope universe-datastores.control:create`
> IP restriction: อย่าใส่ (GitHub Actions รันจาก IP ต่าง) หรือถ้าใส่ให้ใช้ `0.0.0.0/0`

### Key format — ใช้ key เต็ม 964 chars

API key ที่แสดงบน dashboard = **baseApiKey + JWT ต่อกัน (~964 chars)** — ใช้ **ทั้งก้อน** เป็น `x-api-key: <full>`

> ❌ อย่าแยกเอาส่วนแรก ~48 chars ไปใช้ — จะได้ `401 Invalid API Key` (ส่วนแรกเป็นแค่ identifier ภายใน JWT)
> ⚠️ JWT ส่วนหลังหมดอายุ ~1 ชม. (iat→exp) ถ้า key หยุดทำงาน กลับไป dashboard คัดลอกใหม่

---

## ขั้นที่ 3 — env (orchestrator)

```bash
cd night-shift/orchestrator
cp .env.example .env
```

```bash
ROBLOX_API_KEY=<full key 964 chars จากขั้นที่ 2>
UNIVERSE_ID=<universeId — ดูผ่าน dashboard/creations URL ไม่ใช่ placeId>
NIGHT=20261022             # YYYYMMDD — idempotent check
LLM_BASE=https://api.groq.com/openai/v1
LLM_API_KEY=<Groq key จาก console.groq.com/keys>
LLM_MODEL=openai/gpt-oss-120b
```

> Hermes note: ระบบ censor key/`${{ secrets }}` → `.env` เก็บเป็น `*_B64` (base64) แล้ว `env.ts` (import แรกสุด) decode กลับ
> Universe ID ≠ Place ID — place `Night shift` มี universe `10772285159`

---

## ขั้นที่ 4 — build + dry-run ท้องถิ่น

```bash
cd orchestrator && npm install && npm run build
```

ตรวจ LLM + pipeline (ไม่แตะ DataStore):
```bash
node dist/test-llm.js       # LLM → JSON → Zod → lexicon (กับ stub state)
node dist/mock-dryrun.js    # runNight ครบ แต่เขียน mock-datastore.json แทน Roblox
```

รันจริง (เขียน Roblox DataStore + publish):
```bash
node dist/index.js
# > built n20261022-a — <form> at (<x>,<z>) hash=<16-char>
# หรือ: hesitated (<reason>) — wrote n20261022-void
```
ทั้งสองพิมพ์ถือว่าสำเร็จ — คืนที่ลังเลก็คือผลงาน (สเปคข้อ 6)

---

## วิธีเช็คความคืบหน้า

คำสั่งเดียวที่ตอบได้ว่า "ระบบยังไหวอยู่ไหม" — ไม่ต้องเดา ไม่ต้องดู log

```bash
cd orchestrator
NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d) node dist/status.js
```

ออกผล 7 หัวข้อ: DataStore → Hash chain → Tonight → Site map → Telemetry → Public site → Schedule

ตัวอย่างผลจริง:

```
1. DataStore       PASS  reachable · night=20261022 works=1 head=53822464967a18dc
2. Hash chain      PASS  n20261022-a void hash=53822464967a18dc
                   PASS  chain head matches state.journalHead
3. Tonight         PASS  already ran (idempotent guard held)
4. Site map        WARN  last form was "void" -> คืนหน้าต้องเป็นของจริง
5. Telemetry       PASS  2026-10-22: 1 work tracked
6. Public site     PASS  log.jsonl ตรง DataStore · มี preview ครบ
7. Schedule        ····  next cron 2026-10-23 02:00 Bangkok

  overall: chain INTACT
  site: in sync with the DataStore
```

**อ่านผล:**

| สัญลักษณ์ | แปลว่า | ต้องทำ |
|---|---|---|
| `PASS` | ปกติ | — |
| `WARN` | ยังไม่พัง แต่สัญญาณว่าจะพัง | ดูรายละเอียดในบรรทัด WARN |
| `FAIL` | พังจริง | แก้ก่อนคืนถัดไป |
| `····` | ข้อมูลประกอบ | — |

**exit code:** `0` = ปกติ, `2` = chain พัง **หรือ** `site/log.jsonl` ตกหลัง DataStore (ขาด entry / ขาด preview), `1` = ต่อ Roblox ไม่ได้ — ใช้กับ CI ได้เลย

> เดิมหัวข้อ 6 ขึ้นแค่ `WARN` ตอน log ขาด → CI เขียวทั้งที่เว็บตามไม่ทัน (เจอจริง 24 ต.ค.) ตอนนี้เป็น `FAIL` + `exit 2` แล้ว

**ทำไมต้องมี:** ระบบนี้เคย "ดูเหมือนทำงาน" ทั้งที่พังจริง 3 จุด (void ไม่มี geometry, telemetry flush ทุก 5 วินาที, นับ journal เป็นงาน) คำสั่งนี้จับได้ทั้งหมดในที่เดียว

### `npm run resync` — ซ่อม `site/log.jsonl` ให้ตรงกับ DataStore

```bash
cd orchestrator
NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d) node dist/resync.js
```

`ns:state` + `ns:work:*` คือความจริง — `site/log.jsonl` เป็นแค่ไฟล์ที่ derive มาจากมัน resync จะอ่านทุก work จาก DataStore, เรียงตามคืน, verify hash chain ระหว่างเดิน, เขียน `log.jsonl` ใหม่ทั้งไฟล์ + preview ที่ยังขาด แล้วบอกว่าอะไรเพิ่ม/หาย

```
resync: 3 works from DataStore (head 97294172204894a5)
  added   : n20261023-a
  previews: wrote 1 missing
  chain verified ✓
```

idempotent — รันซ้ำไม่เพิ่มอะไร · เจอ chain พังจะ `exit 2` และปริ๊นว่าพังที่ work ไหน · ใช้กู้เคส "คืนนั้นรันสำเร็จแต่ push ไม่ผ่าน" ได้ตรงๆ

---

## ขั้นที่ 5 — GitHub Actions (cron 02:00 ไทย)

**ไฟล์:** `.github/workflows/night.yml` — schedule `0 19 * * *` UTC = 02:00 Asia/Bangkok + `workflow_dispatch` กดรันมือ

> ⚠️ **สถานะ ณ 24 ต.ค. 01:20** — เวอร์ชันที่แปะไปแล้ว (`f050dc2`) มี `permissions` + `Resync` ครบ และรันผ่าน (run #7) แต่ยังขาดอีกอย่าง: **`Deploy site to Pages`** ด้านล่าง
>
> สาเหตุ: push ที่ทำด้วย `GITHUB_TOKEN` **ไม่ trigger workflow อื่น** (GitHub กัน recursive run ไว้) — `deploy.yml` เลยรอ push event ที่ไม่มีวันมา คอมมิตขึ้น repo แต่เว็บเสิร์ฟคืนเก่าต่อไป ทางแก้คือ `workflow_dispatch` ซึ่งเป็นข้อยกเว้นเดียวที่ trigger ได้ → เพิ่ม `actions: write` แล้วเรียก `gh workflow run deploy.yml --ref main` ปิดท้าย
>
> **วิธีแปะ:** เปิด `github.com/JayJayjj123456789/night-shift/edit/main/.github/workflows/night.yml` → ⌘A → วางไฟล์จาก `~/Downloads/night.yml` → Commit เข้า `main` ตรงๆ (ไฟล์นี้ไม่มี test ให้รอ)
>
> มี input `night` อยู่แล้ว: Actions → Night Shift → Run workflow → ใส่ `20261025` เพื่อลองได้ทันที ไม่ต้องรอ 02:00 (คืนที่รันไปแล้วจะ skip เอง)

```yaml
name: Night Shift

on:
  schedule:
    # 19:00 UTC = 02:00 Asia/Bangkok (UTC+7)
    - cron: "0 19 * * *"
  workflow_dispatch:
    inputs:
      night:
        description: "YYYYMMDD. Empty = today in Bangkok. A night that already ran is a safe no-op (idempotent)."
        required: false
        default: ""

# contents: write  -> the nightly commit can push at all (the repo default was read-only)
# actions: write   -> it can dispatch deploy.yml afterwards. A push made with
#                     GITHUB_TOKEN does NOT trigger other workflows (GitHub blocks
#                     recursive runs), so the deploy has to be asked for by name.
#                     workflow_dispatch is the documented exception, so this works.
permissions:
  contents: write
  actions: write

jobs:
  run-night:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: orchestrator/package-lock.json

      - name: Install dependencies
        working-directory: orchestrator
        run: npm ci

      - name: Build
        working-directory: orchestrator
        run: npm run build

      - name: Run night
        working-directory: orchestrator
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_API_KEY }}
          UNIVERSE_ID: ${{ secrets.UNIVERSE_ID }}
          LLM_BASE: ${{ secrets.LLM_BASE }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: ${{ secrets.LLM_MODEL }}
        run: |
          NIGHT="${{ github.event.inputs.night }}"
          if [ -z "$NIGHT" ]; then NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d); fi
          export NIGHT
          echo "NIGHT=$NIGHT"
          node dist/index.js

      # DataStore is the truth; site/log.jsonl is derived from it. Rebuild before
      # anyone checks the file, so a night that ran while a push was failing still
      # lands, and a hesitation that never wrote a log line still gets published.
      - name: Resync site log from DataStore
        if: always()
        working-directory: orchestrator
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_API_KEY }}
          UNIVERSE_ID: ${{ secrets.UNIVERSE_ID }}
          LLM_BASE: ${{ secrets.LLM_BASE }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: ${{ secrets.LLM_MODEL }}
        run: |
          NIGHT="${{ github.event.inputs.night }}"
          if [ -z "$NIGHT" ]; then NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d); fi
          export NIGHT
          node dist/resync.js

      - name: Verify chain
        if: always()
        working-directory: orchestrator
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_API_KEY }}
          UNIVERSE_ID: ${{ secrets.UNIVERSE_ID }}
          LLM_BASE: ${{ secrets.LLM_BASE }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: ${{ secrets.LLM_MODEL }}
        run: |
          NIGHT="${{ github.event.inputs.night }}"
          if [ -z "$NIGHT" ]; then NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d); fi
          export NIGHT
          node dist/status.js

      - name: Commit log + previews
        id: commit
        if: always()
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          file_pattern: "site/log.jsonl site/previews/*.svg"
          commit_message: "night shift: ${{ github.run_id }}"

      # A push from GITHUB_TOKEN cannot trigger another workflow, so the Pages
      # deploy has to be dispatched explicitly. Without this the commit lands and
      # the site keeps serving the previous night — green everywhere, stale page.
      - name: Deploy site to Pages
        if: always() && steps.commit.outputs.changes_detected == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh workflow run deploy.yml --ref main
```

สิ่งที่แต่ละ step ทำ:

| Step | ทำอะไร | ถ้าพัง |
|---|---|---|
| `checkout` | ดึงโค้ด repo | — |
| `setup-node` | Node 20 + npm cache (key = package-lock.json) | เปลี่ยน `cache-dependency-path` ถ้า yml ย้ายที่ |
| `npm ci` | install ตาม lockfile แม่นๆ | lockfile เก่า → `npm install` แล้ว commit lock ใหม่ |
| `npm run build` | `tsc` → `dist/*.js` | TS error — รัน `npx tsc` ท้องถิ่นก่อน |
| `Run night` | `NIGHT` = input `night` ถ้ากดมือ ไม่งั้น = วันที่ไทย แล้วรัน orchestrator · LLM ตอบผิดกฎได้แก้ตัว **1 ครั้ง** (ส่งข้อหาไปบอก) ก่อนยอมแพ้เป็น void | 401/403 → key issue; LLM error → quota |
| `Resync site log` | เขียน `site/log.jsonl` ใหม่ทั้งไฟล์จาก `ns:state` + `ns:work:*` + preview ที่ขาด — **รันก่อน verify** เพื่อให้ตรวจของจริง ไม่ใช่ของที่ค้าง | `if: always()` · exit 2 = chain พัง (บอก work ที่พัง) |
| `Verify chain` | `status.js` 7 หัวข้อ — chain **และ** site ต้องตรงกับ DataStore | exit 2 = chain พัง หรือ site ตกหลัง DataStore |
| `git-auto-commit` | push `site/log.jsonl` + `previews/*.svg` กลับเข้า repo | ต้องมี `permissions: contents: write` ที่ระดับ workflow — ไม่งั้น commit ผ่านแต่ push 403 · `if: always()` |
| `Deploy site to Pages` | เรียก `gh workflow run deploy.yml` หลังคอมมิตมีของจริง | `actions: write` · **จำเป็น** เพราะ push จาก `GITHUB_TOKEN` ไม่ trigger workflow อื่น |

**NIGHT idempotent** — ถ้า cron รันซ้ำในคืนเดิม (หรือกด manual ซ้ำ) orchestrator เห็น `ns:work:n{NIGHT}-*` มีแล้ว → ไม่สร้างของใหม่ แค่ skip ทักทาย

**Secrets ที่ต้องตั้ง** (Settings → Secrets and variables → Actions):

| Secret | ค่า | หมายเหตุ |
|---|---|---|
| `ROBLOX_API_KEY` | full key 964 chars | ต้องมี scope `control:create` ด้วย |
| `UNIVERSE_ID` | `10772285159` | ไม่ใช่ placeId |
| `LLM_BASE` | `https://api.groq.com/openai/v1` | |
| `LLM_API_KEY` | `gsk_...` | Groq free tier |
| `LLM_MODEL` | `openai/gpt-oss-120b` | Groq ถอด llama ออกแล้ว |

> ⚠️ workflow_dispatch + cron ต่างกัน: cron เป็น "at most" — ถ้า GitHub Actions ค้าง/ล่าช้า อาจเลื่อนไปไม่ถึง 1 ชม. ถ้าต้องการแม่นยำขั้นสุดให้ยืดช่วงเป็น `0 19 * * *` → `55 18 * * *` (03:00) เพื่อกัน botched

### GitHub Pages — `.github/workflows/deploy.yml`

```yaml
name: Deploy Site to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - "site/**"
      - ".github/workflows/deploy.yml"
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**หน้าที่ของแต่ละ block:**

- `on.push.paths: site/**` — trigger เฉพาะเมื่อ night.yml commit `site/log.jsonl` + `previews/*.svg` กลับ (ไม่ deploy ทั้ง repo)
- `permissions: pages: write, id-token: write` — **บังคับ** สำหรับ deploy-pages@v4 (OIDC auth ไม่มี PAT)
- `concurrency: group: pages` — กัน deploy ซ้อนกัน; `cancel-in-progress: false` = ถ้ามี deploy ค้างอยู่ รอให้จบก่อน
- `environment: github-pages` — ใส่สถานะ deploy ตรงหน้า repo Environments tab
- `url: steps.deployment.outputs.page_url` — auto-fill URL หลัง deploy

**ต้องตั้ง Pages ครั้งเดียว:** Settings → Pages → Source: **GitHub Actions** (ไม่ใช่ "Deploy from a branch") — ไม่งั้น deploy.yml รันแล้วไม่มีอะไรเกิดขึ้น

> เจอแล้ว: PAT ต้องมี scope `workflow` ไม่งั้น push `.github/workflows/*.yml` โดน reject — ใช้ GitHub web editor สร้าง workflow แทน (วิธีที่ dj ทำสำเร็จ)

> เจอแล้ว: `${{ secrets.X }}` ใน workflow ถ้าไปโผล่ในโค้ดที่ commit ผ่าน tool ที่ censor จะกลายเป็น `***` → YAML parse error. แก้ด้วย: สร้าง workflow ผ่าน GitHub web editor (หรือเขียนไฟล์ผ่าน execute_code ที่ไม่โดน censor)


## หน้าเว็บ (`site/`) — 4 หน้า + ไฟล์ที่ derive จาก DataStore

| ไฟล์ | ทำอะไร |
|---|---|
| `index.html` | journal — ทุกคืน เรียงใหม่สุดขึ้นก่อน + verify hash chain ฝั่ง client |
| `timeline.html` | แผนผัง 512×512 (วงกลม = ชิ้นงาน) + กราฟ near/dwell + ตารางทุกคืน |
| `timeline3d.html` | **plot 3 มิติ** — Three.js + OrbitControls, ลากหมุน/ซูม, hover อ่านบันทึก · `?src=sim.jsonl` = ชุดจำลอง 30 คืน |
| `architecture.html` | แผนผังระบบทั้งหมด (SVG) |
| `log.jsonl` | ทุกชิ้นงาน เรียงตามคืน — derive จาก `ns:state` + `ns:work:*` |
| `previews/{id}.svg` | ภาพ silhouette ต่อ form — derive จาก work |
| `raw/{id}.json` | **บทสนทนากับโมเดลทั้งรอบ** (prompt + ทุกคำตอบ + เหตุผลที่ถูกปฏิเสธ) — เก็บใน `ns:raw:{id}` ด้วย |
| `telemetry.jsonl` | near/dwell 7 วันล่าสุดที่ aggregate แล้ว — กราฟใน `timeline.html` ใช้ไฟล์นี้ |
| `pubkey.pem` | public key สำหรับตรวจ signature ของแต่ละชิ้น |
| `chain.js` | **hash walk ตัวเดียวของฝั่ง browser** — `index.html` กับ `timeline.html` โหลดไฟล์นี้ ไม่มีสำเนาของใครอีก (ดู "สำเนาที่สาม" ด้านล่าง) |

### สำเนาที่สามของ hash walk
ฟังก์ชันนี้ถูกคัดลอกมาแล้วสามรอบ: `status.ts` → `resync.ts` → `timeline.html` ทุกรอบที่ payload เปลี่ยน (`parts`) มีคนหนึ่งคนที่ไม่ได้แก้ และหน้าหรือคำสั่งนั้นก็โกหก:

- รอบแรก: `status.ts` รายงาน `chain BROKEN` ทั้งที่ chain ดี (แก้ที่ `cd3327c`)
- รอบสอง: `timeline.html` ประกาศ `chain broken at n20261103-a` — ชิ้นงาน assembly ตัวแรก — ทั้งที่ 3D กับ status บอกว่าผ่าน

ตอนนี้ฝั่ง browser เหลือ `site/chain.js` ไฟล์เดียว และมีเทสต์ที่ fail ถ้า `index.html` หรือ `timeline.html` กลับไปประกาศ `sha256Hex` ของตัวเองอีก

**3D อ่านยังไง:** แกน X/Z = `site.x`, `site.z` ในแปลงจริง 512×512 · แกน Y = `params.height` ของชิ้นนั้น (สเกลเร่ง ×24 เพราะของจริงเตี้ย 0.3–1.5 stud เทียบพื้น 512 — ถ้าไม่เร่งจะแบนติดพื้นจนมองไม่เห็น) · สี/รูปทรง = form (monolith=แท่ง, garden=ทรงกระบอกเตี้ย, machine=เหลี่ยม 6, text=แผ่นบาง, light=เสาไฟมีดวง, void=ลูกกลม)

**camera:** ระยะกล้องไม่ได้เดาจาก `bbox × 1.65` อีกแล้ว (เดานั้นพอดีแค่ aspect เดียว — วันที่ชิ้นงานที่ (-131,-190) เข้ามา ชิ้นที่ (188,197) หลุดขอบล่างไปเลย) ตอนนี้ใส่กล่อง 512×512 เข้าไปใน bbox แล้วแก้ระยะด้วยการ double + bisect จนมุมทั้ง 8 ของกล่องอยู่ใน NDC 0.92 · refit ตอน resize ถ้าผู้ชมยังไม่หมุนกล้องเอง

---

## Assemblies — โมเดลจัด composition เองได้แล้ว

เดิมทุกคืนได้ primitive เดียว เพราะ `Decision` ให้เลือก 1 จาก 6 form + params ไม่เกิน 4 ค่า — มันเลือกเทมเพลต ไม่ได้ออกแบบ ตอนนี้เพิ่ม `parts` (optional):

```
shape: block | cylinder | sphere | wedge | cone | torus | plate
size:  [width, height, depth]  (รูปกลมอ่าน width เป็น diameter)
pos:   [x, y, z]  — offset จาก site · **y = จุดกึ่งกลางสูงของ part**
rot:   [x, y, z]  องศา (optional)
color: ink | slate | bone | rust | amber | jade | sky | violet
material: neon | glass | stone | metal
emissive: 0..2 (เกิน 1 = เป็นแสง)   spin: -60..60 องศา/วิ   float: 0..6 studs
```

งบไม้ตาย (constitution บังคับ): ≤ 8 parts · ห่างจาก site ≤ 64 studs · สูงสุด 90 studs · ปริมาตรรวม ≤ 30000 stud³ · `form: void` + parts = reject

### hash — จุดที่ต้องระวังที่สุด
`parts` ถูกแถbar เข้า payload **เฉพาะตอนที่มี field นั้น** ถ้าใส่ `null` แทนของเก่า hash 6 ตัวแรกจะเปลี่ยนหมด เว็บจะรายงานพังตั้งแต่ entry แรก (มีเทสต์คุม)

### render 3 ที่
| ที่ไหน | parts แปลว่าอะไร |
|---|---|
| `previews/{id}.svg` | silhouette แบบ side-view ภาษาเดียวกับ preview แบบ form |
| `timeline3d.html` | mesh จริง + เงา + glass + neon + point light + spin/float |
| `builder.lua` | Part/Ball/Cylinder/Wedge + Neon + PointLight · **cone/torus กลายเป็นกลมเท่ามี** เพราะ Roblox ไม่มี primitive พวกนี้โดยไม่ต้องมี asset และ CSG ไม่ไว้ใจได้ตอน runtime |

งานที่ไม่มี `parts` (6 ตัวแรก) render เหมือนเดิมทุกตัว

## Void — ทำไม 7 ใน 15 คืนถึงว่าง

ตอน 2026-11-03 ตัวเลขคือ **7 จาก 15 work เป็น void** และ 4 ตัวนอนทับกันอยู่ที่ (0,0) ตัวเลขนั้นไม่ใช่ปัญหาของโมเดล แต่เป็นปัญหาของ prompt

อ่าน `site/raw/*.json` ทั้ง 15 answer ที่โมเดลเคยตอบ:

| สิ่งที่โมเดลตอบ | จำนวน |
|---|---|
| `form: "void"` + `journal: "no action"` | **7 จาก 15** |
| `journal` มีคำนอก lexicon (`text`, `action`) | 4 |
| `params` หาย → zod `invalid_type` | 1 |
| content ว่าง (token หมดก่อนเขียนคำตอบ) | 1 |
| `NIGHT=20261032` ไม่ใช่วันที่จริง → RangeError | 1 |

สาเหตุใหญ่คือ rule 6 ใน prompt เดิม ซึ่งเขียนว่า *"ถ้าไม่แน่ใจ ให้ตอบ `form: "void"` journal `"void no"`"* — โมเดลทำตาม แต่เขียน `"no action"` ซึ่ง **`action` ไม่อยู่ใน 200 คำ** → โดน reject → ลองใหม่ → โดนอีก จนหมด 3 attempt แล้วคืน void อยู่ดี คือ **ระบบสั่งให้มันหาทางออก แล้วก็ปฏิเสธทางออกนั้นเอง**

### กฎใหม่

1. **`void` ไม่ใช่ decision ของโมเดลอีกต่อไป** — `assertConstitution` reject ทุกครั้งที่ `form: "void"` ไม่ว่าสถานะจะเป็นอะไร void เหลือทางเดียวคือ `hesitate()` ซึ่งเขียนเองตอนที่ *ไม่มีงานเกิดขึ้นจริง* เท่านั้น (enum ยังมี void เพราะ chain มี 7 ตัวและ builder ยังต้องวาดมัน)
2. **rejection ต้องบอกทางไปต่อ** — `"void is not available"` เดี่ยว ๆ ทำให้โมเดลลอง void อีกครั้งด้วยถ้อยคำใหม่ (เกิดจริง 3 ครั้งในคืน 20261102) ตอนนี้ index.ts ต่อท้ายด้วย site ที่ว่างจริงและชื่อ form ที่ใช้ได้: `Use exactly this site: {"x": -131, "z": -190} and form "monolith".`
3. **`params` เป็น optional** (default `{}`) — assembly ไม่มีตัวเลขให้ใส่ และการไม่ส่งมาคือเรื่องปกติ ไม่ควรกินคืนหนึ่ง
4. **`void` ไม่โผล่ในลิสต์ form อีก** — เดิม `freeForms` มี `|| f === "void"` ทำให้บรรทัด "forms available to you" ประกาศ void ว่าเป็นตัวเลือก ในคืนที่โมเดลกำลังหาทางออกพอดี
5. **`hesitate()` ไม่เขียนที่ (0,0) แล้ว** — `freeSpot()` สแกนวงแหวนออกจาก origin แล้วคืนจุดแรกที่ห่าง ≥ 30 studs (deterministic) void ยังเป็นที่อยู่ ไม่ใช่กองขยะบนจุดเกิด
6. **assembly night ถูกประกาศใน prompt** ไม่ใช่บังคับเงียบ ๆ หลังโมเดลตอบเสร็จ
7. **prompt แนบ title ที่ใช้ไปแล้ว** — `ns:state` ไม่เคยเก็บ title มาก่อน (resync เติมให้แล้ว 15 ตัว) "bright night sky" จึงถูกเขียนซ้ำ 3 ครั้งโดยที่โมเดลไม่เคยเห็นว่าตัวเองใช้ไปแล้ว
8. **`hasAttention` เคยโกหก** — `readTelemetry` คืนแถวให้ทุก work ไม่ว่าจะมีคนดูหรือไม่ ดังนั้น `telemetry.length > 0` เป็นจริงตลอดตั้งแต่คืนที่สอง และ prompt สั่งให้ "respond to attention" ทุกคืนทั้งที่ไม่มีใครเคยเห็นอะไรเลย ตอนนี้ใช้ `some(t => t.near > 0)` และลิสต์เฉพาะงานที่มีคนดูจริง

### เช็คยังไง
```bash
cd orchestrator && npm test && npm run status
```
`status` มีบรรทัด `voids: N/15 (X%)` และ WARN ถ้าเกิน 25% — ตัวเลขนั้นคือ health metric ของงานชิ้นนี้ ไม่ใช่แค่สถิติ

## Attestation — ทำไม hash chain อย่างเดียวไม่พอ

hash chain เป็น **self-referential**: ใครแก้ `log.jsonl` แล้วคำนวณ hash ใหม่ทั้งไฟล์ ก็ verify ผ่านหมด เพราะมันแค่ตรวจว่าคณิตศาสตร์ตรงกัน ไม่ได้ตรวจว่า *ใคร* เขียน

แต่ละ work เลยมี `sig` — Ed25519 signature ทับค่า `hash` ของตัวเอง กุญแจส่วนตัวอยู่ใน GitHub Secrets ไม่เคยออกจาก CI ส่วน public key อยู่ที่ `site/pubkey.pem` ให้ใครก็ตรวจได้

```
node -e "const{createPublicKey,verify}=require('node:crypto'); ..."   # หรือดูใน status.js
```

- **ไม่มี key = ไม่มี signature และไม่มีอะไรพัง** — signing เป็น optional โดยตั้งใจ คืนห้ามตายเพราะ attestation
- ตั้งค่า: `NS_SIGNING_KEY` = base64 ของ PKCS8 PEM (สร้างด้วย `node -e` ที่ให้มาใน PR) · ไฟล์ `ns-signing-key.b64`
- `npm run status` รายงาน `N/N works signed with Ed25519 and verified`
- `npm run resync` exit **3** ถ้า signature ไม่ตรง (= entry ถูกแก้หลังเซ็น) แยกจาก exit 2 ที่ chain พัง

## ยังค้าง — workflow v3 (ไฟล์พร้อมแปะที่ `~/Downloads/night.yml`)

โค้ดทุกอย่างในหัวข้อบนทำงานได้แล้ว แต่ workflow ที่รันอยู่จริงยังเป็น v2 ซึ่ง **ไม่รู้จักไฟล์ใหม่** สิ่งที่ v3 เพิ่ม:

| เพิ่ม | เพราะ |
|---|---|
| step `Lint workflows` (actionlint 1.7.12) | บั๊กที่กินไป 2 คืนเป็น workflow defect ทั้งคู่ — ตรวจก่อนรัน |
| step `Test` (`node --test`) | 14 เคส ก่อนใช้ runner สร้างงานจริง |
| `NS_SIGNING_KEY` ใน env ของ `Run night` | ถ้าไม่มี signature ก็ไม่เกิด |
| `file_pattern` เพิ่ม `site/raw/*.json site/telemetry.jsonl site/pubkey.pem` | ไฟล์ที่ runner เขียนแล้วไม่ถูก commit = หาย |

> ไม่แปะก็ไม่พัง — raw/telemetry ยังถูกกู้จาก DataStore ด้วย `npm run resync` และ signature แค่ไม่มีคนเซ็น แต่จะเสีย lint/test ใน CI กับ commit ของไฟล์ใหม่

## Test

```bash
cd orchestrator && npm test      # build แล้วรัน node --test
```

14 เคส ไม่มี dependency เพิ่ม (ใช้ `node:test` ในตัว) — ตอนนี้ **26 เคส**:
- hash vector จริง 2 ตัวที่อยู่บน chain แล้ว (`53822464967a18dc`, `65de0e2b02056c99`) — ถ้ามันเปลี่ยน hash ที่ประกาศไว้ทั้งหมดก็โกหก
- สร้าง chain สุ่ม 300 ชุด ต้อง verify ผ่านทุกชุด และแก้ 1 field ต้องไม่ผ่านทุกชุด
- กฎ constitution: lexicon / param bounds / site collision / repeat form
- signature round-trip: เซ็นแล้ว verify ผ่าน, แก้ hash 1 ตัวอักษรไม่ผ่าน
- **prompt ต้องไม่มีทางออกที่ constitution จะ reject** — เช็คว่า `void` ไม่โผล่ใน rule 6 และไม่โผล่ใน form enum ของ schema block (ดูหัวข้อ void ด้านบน)
- `freeSpot()` ต้องคืนจุดที่ห่างงานเดิม ≥ 30 studs และต้อง deterministic
- `params` ที่ไม่ส่งมาต้องกลายเป็น `{}` ไม่ใช่ schema error


**ปิด laptop แล้ว cron ยังรันไหม → รัน.** `night.yml` วิ่งบน GitHub Actions runner (คลาวด์) ไม่ใช่เครื่อง dj · DataStore = Roblox Cloud · หน้าเว็บ = GitHub Pages · เหลือแค่ secret ใน repo ต้องไม่ถูกลบ — sleep/ปิดเครื่อง/เน็ตหลุดที่บ้าน ไม่กระทบ


## Kill switch

- **ปิดชั่วคราว:** GitHub → Actions → Night Shift → Disable workflow
- **ถาวร:** ลบ API key ใน dashboard → orchestrator เรียก fail → `hesitate()` เขียน `n{NIGHT}-void` แทน crash
- **rollback ชิ้นเดียว (manual):** ลบ `ns:work:{id}` ใน DataStore + เอาออกจาก `ns:state.works` — ระบบไม่มีโค้ดลบโดยตั้งใจ

---

## โควตาที่ต้องจำ

| รายการ | โควตา |
|---|---|
| DataStore write key เดียวกัน | ~1 ครั้ง/6 วินาที |
| MessagingService | 1 KB/ข้อความ, ~1–2 s latency, best-effort |
| Open Cloud DataStore | 5,000 req/นาที/API key owner |
| LLM budget/คืน | 4K input / **1500** output / $0.10 |
| Groq free tier TPM | 8,000 tokens/นาที — prompt ~1K + output 1.5K = 2.5K/ครั้ง → เว้น ≥15 วินาทีเมื่อเจอ 429 |

---

## Definition of Done — สถานะจริง

- [x] รันคืนแรกได้ผลงาน (n20261022-a, form void ลังเล)
- [x] รันซ้ำ NIGHT เดิม → ไม่สร้างซ้ำ (idempotent)
- [x] ปิด key → hesitate ไม่ crash
- [x] Startup rebuild ทุกชิ้นจาก ns:state
- [x] หน้าเว็บ Pages + hash chain verify (client-side)
- [x] `npm run status` — เช็คความคืบหน้า 7 หัวข้อในคำสั่งเดียว (exit 2 = chain พัง)
- [x] `tools/install-studio.py` — ติดตั้ง Luau scripts ลง Studio อัตโนมัติ (MCP stdio, idempotent)
- [x] LLM ไม่คืน void แล้ว — prompt ส่ง lexicon+sites+telemetry ครบ, 3 คืนจำลองได้ 3 form ต่างกัน
- [x] **คืนสองสร้างงานจริงแล้ว** — `n20261022-b` monolith @(100,80) hash=65de0e2b02056c99
- [x] `readTelemetry` อ่าน key ถูกรูปแบบแล้ว (prompt เห็น attention จริง)
- [ ] **30 คืนติด** ตามสเปค — วัดจาก cron รันตรง

---

## Troubleshooting 401/403 (เจอจริง)

| Error | สาเหตุ | แก้ |
|---|---|---|
| `401 Invalid API Key` | ใช้แค่ 48-chars baseApiKey หรือ key หมดอายุ | ใช้ full 964 chars; copy ใหม่จาก dashboard |
| `403 missing universe-datastores.control:create` | scope ไม่ครบ | tick `control:create` |
| `404 Data store not found` | store ยังว่าง (คืนแรก) | ปกติ — auth ผ่านแล้ว |
| `chain BROKEN` (status exit 2) | hash ไม่ตรงกับ payload หรือ `prevHash` ขาด link | ดูบรรทัด FAIL — มันบอกชิ้นไหนพัง (`n2026xxxx-a`) |
| `no telemetry in the last 7 days` | ไม่มีผู้เข้าเกม หรือ work ไม่มี geometry | เปิดเกม + ยืนใกล้งาน >15 วินาที แล้วรอ flush (~1 นาที) |
| installer เขียน source ไม่ได้ | `Base64Decode is not a valid member of HttpService` | Roblox ไม่มี base64 decoder — installer ใช้ Lua long-bracket string แทน (แก้แล้ว) |
| installer บอก `Edit datamodel is not available` | Studio อยู่โหมด Play | installer จะหยุด Play ให้เอง ถ้ายังไม่ได้กด Stop ใน Studio |
| Pages deploy ค้าง `queued` ไม่เคยขึ้นเว็บ | environment `github-pages` มี branch policy รอคนอนุมัติ | `DELETE /repos/OWNER/REPO/environments/github-pages/deployment-branch-policies/{id}` แล้ว dispatch ใหม่ |
| telemetry ว่างทุกคืนทั้งที่มีข้อมูล | key format ไม่ตรงกับ `src/telemetry.lua` | Lua เขียน `ns:telemetry:2026-10-22` (มีขีด) — TS ต้องอ่านแบบเดียวกัน |
| work id ซ้ำ `n20261022-a` | id ตายตัว | ตอนนี้หา suffix ตัวอักษรว่างถัดไป |
| YAML workflow parse error | `${{ secrets.X }}` โดน censor เป็น `***` | เขียนผ่าน execute_code/python |
| Night Shift แดงที่ step `Commit log + previews` — `Permission to ... denied to github-actions[bot]` + `403` | workflow ไม่มี `permissions: contents: write` (default ของ `GITHUB_TOKEN` ใน repo นี้ = read-only) → commit เกิดบน runner แต่ push ไม่ผ่าน แล้ว runner ตายทิ้ง commit ไป | เพิ่ม `permissions: contents: write` ที่ระดับ workflow · คืนที่หลุดไปแล้วกู้ด้วย `npm run resync` (DataStore ยังมี work ครบ) |
| เว็บโชว์งานน้อยกว่า DataStore 1 คืน | ผลข้างเคียงของ 403 ข้างบน — `log.jsonl` ใน repo ตกหล่น แต่ `ns:state` ไม่ตก | `npm run resync` แล้ว commit; ตั้งแต่มี step Resync ใน workflow มันจะซ่อมเองทุกคืน |
| หลังแก้ token แล้ว เว็บขึ้น `chain broken at n{คืนนี้}` | งานของคืนที่หายไปยังไม่อยู่ในไฟล์ → งานคืนนี้ chain ไปเกาะ hash ที่ไม่มีในไฟล์ | ต้อง `npm run resync` **ก่อน** คืนถัดไปรัน ไม่งั้นยิ่ง push ได้ยิ่งพัง (เจอจริง: กู้ `n20261023-a` แล้วไฟล์กลับมา verify ผ่าน 3 entries) |
| run เขียวทั้งที่เว็บไม่ขยับ | `hesitate()` เคยไม่เขียน log/preview → ไม่มีอะไรให้ commit → step `success` แบบไม่ทำอะไร | แก้แล้ว: ทุกผลลัพธ์ผ่าน `publishWork()` · และ status หัวข้อ 6 เป็น `FAIL` แล้ว ไม่ใช่ `WARN` |
| `lexicon: title has [...]` แล้วได้ void | โมเดลเขียนคำนอกลิสต์ 200 คำ (พบบ่อย: `the` `a` `of` และชื่อ form เอง) | มี retry 1 ครั้งพร้อมบอกคำที่ผิดแล้ว · prompt เตือนเรื่อง article/of/form name ชัดขึ้น |
| Night Shift เขียว คอมมิตขึ้น repo แต่เว็บไม่เปลี่ยน | push จาก `GITHUB_TOKEN` ไม่ trigger workflow อื่น → `deploy.yml` ไม่เคยรัน | ต้อง `workflow_dispatch` จากใน workflow (`gh workflow run deploy.yml --ref main` + `actions: write`) — เจอจริง run #7 (24 ต.ค.) |
