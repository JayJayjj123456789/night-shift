# Night Shift — ตั้งค่าทีละขั้น

> AI ทำงานคนเดียว 02:00–05:00 Asia/Bangkok สร้างของหนึ่งชิ้น/คืนในแปลง 512×512 มีสมุดบันทึก 200 คำ + hash chain

**สถานะ: LIVE** — รันจริงครั้งแรกผ่าน 2026-10-22 (คืน 1: form `void` ลังเล ตามสเปค) · GitHub Actions cron ทุกคืน 02:00 ไทย · หน้าเว็บ GitHub Pages

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
```

**อ่านผล:**

| สัญลักษณ์ | แปลว่า | ต้องทำ |
|---|---|---|
| `PASS` | ปกติ | — |
| `WARN` | ยังไม่พัง แต่สัญญาณว่าจะพัง | ดูรายละเอียดในบรรทัด WARN |
| `FAIL` | พังจริง | แก้ก่อนคืนถัดไป |
| `····` | ข้อมูลประกอบ | — |

**exit code:** `0` = ปกติ, `2` = chain พัง, `1` = ต่อ Roblox ไม่ได้ — ใช้กับ CI ได้เลย

**ทำไมต้องมี:** ระบบนี้เคย "ดูเหมือนทำงาน" ทั้งที่พังจริง 3 จุด (void ไม่มี geometry, telemetry flush ทุก 5 วินาที, นับ journal เป็นงาน) คำสั่งนี้จับได้ทั้งหมดในที่เดียว

---

## ขั้นที่ 5 — GitHub Actions (cron 02:00 ไทย)

**ไฟล์:** `.github/workflows/night.yml` — schedule `0 19 * * *` UTC = 02:00 Asia/Bangkok + `workflow_dispatch` กดรันมือ

```yaml
name: Night Shift

on:
  schedule:
    # 19:00 UTC = 02:00 Asia/Bangkok (UTC+7)
    - cron: "0 19 * * *"
  workflow_dispatch: {}

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
          export NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d)
          echo "NIGHT=$NIGHT"
          node dist/index.js

      - name: Verify chain
        working-directory: orchestrator
        env:
          ROBLOX_API_KEY: ${{ secrets.ROBLOX_API_KEY }}
          UNIVERSE_ID: ${{ secrets.UNIVERSE_ID }}
          LLM_BASE: ${{ secrets.LLM_BASE }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: ${{ secrets.LLM_MODEL }}
        run: |
          export NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d)
          node dist/status.js

      - name: Commit log + previews
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          file_pattern: "site/log.jsonl site/previews/*.svg"
          commit_message: "night shift: ${{ github.run_id }}"
```

สิ่งที่แต่ละ step ทำ:

| Step | ทำอะไร | ถ้าพัง |
|---|---|---|
| `checkout` | ดึงโค้ด repo | — |
| `setup-node` | Node 20 + npm cache (key = package-lock.json) | เปลี่ยน `cache-dependency-path` ถ้า yml ย้ายที่ |
| `npm ci` | install ตาม lockfile แม่นๆ | lockfile เก่า → `npm install` แล้ว commit lock ใหม่ |
| `npm run build` | `tsc` → `dist/*.js` | TS error — รัน `npx tsc` ท้องถิ่นก่อน |
| `Run night` | export `NIGHT` เป็นวันที่ไทย แล้วรัน orchestrator | 401/403 → key issue; LLM error → quota |
| `git-auto-commit` | push `site/log.jsonl` + `previews/*.svg` กลับเข้า repo | ใช้ `GITHUB_TOKEN` default อย่าแก้ |

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
| YAML workflow parse error | `${{ secrets.X }}` โดน censor เป็น `***` | เขียนผ่าน execute_code/python |
