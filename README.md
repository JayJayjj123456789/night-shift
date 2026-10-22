# Night Shift — ตั้งค่าทีละขั้น

> AI ทำงานคนเดียว 02:00–05:00 Asia/Bangkok สร้างของหนึ่งชิ้น/คืนในแปลง 512×512 มีสมุดบันทึก 200 คำ + hash chain

**สถานะ: LIVE** — รันจริงครั้งแรกผ่าน 2026-10-22 (คืน 1: form `void` ลังเล ตามสเปค) · GitHub Actions cron ทุกคืน 02:00 ไทย · หน้าเว็บ GitHub Pages

สเปคเต็ม: `/Users/thxdadloveyoumost/jjfolder/testing folder/night-shift.md`

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

ผ่าน Hermes + Roblox Studio MCP:

```
"inject builder.lua, telemetry.lua, journal.lua เข้า ServerScriptService ของ place Night shift"
```

ทำเอง: copy `src/*.lua` → สร้าง `Script` ชื่อ `NightShiftBuilder` / `NightShiftTelemetry` / `NightShiftJournal` ใน `ServerScriptService`

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

## ขั้นที่ 5 — GitHub Actions (cron 02:00 ไทย)

`.github/workflows/night.yml` — schedule `0 19 * * *` UTC = 02:00 Asia/Bangkok, มี `workflow_dispatch` กดรันมือ

Secrets ที่ต้องตั้ง (Settings → Secrets and variables → Actions):
- `ROBLOX_API_KEY` (full 964 chars), `UNIVERSE_ID`, `LLM_BASE`, `LLM_API_KEY` (Groq), `LLM_MODEL`

Workflow ทำ: npm ci → build → รัน `node dist/index.js` (NIGHT = `TZ=Asia/Bangkok date +%Y%m%d`) → auto-commit `site/log.jsonl` `site/previews/*.svg`

### GitHub Pages

`.github/workflows/deploy.yml` — trigger บน push ไป `site/**` → configure-pages + upload-pages-artifact (path: `site`) + deploy-pages → URL `https://<user>.github.io/night-shift/`

> เจอแล้ว: PAT ต้องมี scope `workflow` ไม่งั้น push `.yml` โดน reject — ใช้ GitHub web editor สร้าง workflow แทน

---

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
| LLM budget/คืน | 4K input / 800 output / $0.10 |

---

## Definition of Done — สถานะจริง

- [x] รันคืนแรกได้ผลงาน (n20261022-a, form void ลังเล)
- [x] รันซ้ำ NIGHT เดิม → ไม่สร้างซ้ำ (idempotent)
- [x] ปิด key → hesitate ไม่ crash
- [x] Startup rebuild ทุกชิ้นจาก ns:state
- [x] หน้าเว็บ Pages + hash chain verify (client-side)
- [ ] **30 คืนติด** ตามสเปค — วัดจาก cron รันตรง

---

## Troubleshooting 401/403 (เจอจริง)

| Error | สาเหตุ | แก้ |
|---|---|---|
| `401 Invalid API Key` | ใช้แค่ 48-chars baseApiKey หรือ key หมดอายุ | ใช้ full 964 chars; copy ใหม่จาก dashboard |
| `403 missing universe-datastores.control:create` | scope ไม่ครบ | tick `control:create` |
| `404 Data store not found` | store ยังว่าง (คืนแรก) | ปกติ — auth ผ่านแล้ว |
| YAML workflow parse error | `${{ secrets.X }}` โดน censor เป็น `***` | เขียนผ่าน execute_code/python |
