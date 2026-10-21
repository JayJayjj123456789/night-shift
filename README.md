# Night Shift — ตั้งค่าทีละขั้น

## โครงสร้าง

```
night-shift/
├── README.md                    ← ไฟล์นี้
├── src/                         ← Luau scripts (ใส่ใน Studio ผ่าน MCP หรือ copy/paste เอง)
│   ├── builder.lua              ← NightShiftBuilder (6 form)
│   ├── telemetry.lua            ← NightShiftTelemetry
│   └── journal.lua              ← NightShiftJournal (แผ่นจารึก)
├── orchestrator/                ← TypeScript (รันตอน 02:00 Asia/Bangkok)
│   ├── src/
│   │   ├── schema.ts            ← Zod + PARAM_SPEC + lexicon 200 คำ
│   │   ├── datastore.ts         ← Open Cloud get/put/publish
│   │   ├── llm.ts               ← askLLM + readTelemetry + budget
│   │   ├── constitution.ts      ← assertConstitution (lexicon + bounds + repeat-form)
│   │   ├── hash.ts              ← hash chain
│   │   ├── preview.ts           ← renderPreview (SVG)
│   │   └── index.ts             ← runNight + hesitate
│   ├── package.json
│   └── tsconfig.json
└── site/
    └── index.html               ← static log + hash chain verify ฝั่ง client
```

## ขั้นที่ 1 — ติดตั้ง Luau scripts ใน Studio

ถ้าใช้ผ่าน Hermes + Roblox Studio MCP (แนะนำ):

```
# ใน session Hermes สั่ง:
"inject builder.lua, telemetry.lua, journal.lua เข้า ServerScriptService ของ place Night shift"
```

ถ้าทำเอง: copy เนื้อหาแต่ละไฟล์ใน `src/` ไปสร้าง `Script` ใหม่ใน `ServerScriptService` ของ place (ชื่อ `NightShiftBuilder`, `NightShiftTelemetry`, `NightShiftJournal`)

## ขั้นที่ 2 — สร้างแปลง 512×512 ใน Workspace

ใน Studio Edit mode ใช้ MCP execute_luau:

```lua
local root = workspace:FindFirstChild("NightShift")
if not root then
  root = Instance.new("Folder")
  root.Name = "NightShift"
  root.Parent = workspace
end
local plot = Instance.new("Part")
plot.Name = "NightShiftPlot"
plot.Anchored = true
plot.Size = Vector3.new(512, 0.5, 512)
plot.CFrame = CFrame.new(0, 0.1, 0)
plot.Material = Enum.Material.Neon
plot.Color = Color3.fromHSV(0.6, 0.4, 0.3)
plot.Transparency = 0.85
plot.CanCollide = false
plot.Parent = root
```

หรือถ้าใช้ Hermes MCP ให้บอกกูสั่งแทนได้เลย

## ขั้นที่ 3 — เปิดใช้ API Access ใน Studio (สำหรับทดสอบในเครื่อง)

Studio → Game Settings → Security → เปิด:
- **Enable Studio Access to API Services** ✅

อันนี้ทำให้ DataStoreService + MessagingService ใช้ได้ใน playtest — ถ้าไม่เปิด `GetAsync` จะ fail

## ขั้นที่ 4 — สร้าง Open Cloud API key

1. ไป https://create.roblox.com/dashboard/credentials
2. Create API key → ตั้งชื่อ `night-shift`
3. จำกัด scope เฉพาะ:
   - `universe-datastores.objects:read`
   - `universe-datastores.objects:update`
   - `universe-datastores.objects:create`
   - `universe.messaging-service:publish`
4. จำกัด IP (ถ้ารันบนเครื่องตัวเอง) หรือไม่ก็ปล่อยว่าง
5. **คัดลอก key เก็บใน env — ห้าม commit**

## ขั้นที่ 5 — ตั้ง env ของ orchestrator

```bash
cd night-shift/orchestrator
cp .env.example .env   # แล้วแก้ค่า
```

```
ROBLOX_API_KEY=<key จากขั้นที่ 4>
UNIVERSE_ID=<universe id ของ place Night shift — ดูได้จาก Game Settings → Security>
NIGHT=20261023
LLM_API_KEY=<key ของ LLM ที่จะใช้>
LLM_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

> Universe ID ≠ Place ID — ดูได้จาก https://create.roblox.com/dashboard/creations → คลิก place → URL มีทั้ง universeId และ placeId

## ขั้นที่ 6 — build + รัน dry-run คืนแรก

```bash
npm install
npm run build
npm run night
```

ถ้าทุกอย่างถูกต้องจะได้:
```
built n20261023-a — <form> at (<x>, <z>) hash=<16-char>
```

ถ้า LLM หรือ constitution ปฏิเสธ จะได้:
```
hesitated (<reason>) — wrote n20261023-void
```

ทั้งสองกรณีถือว่าสำเร็จ — คืนที่ล้มเหลวก็เป็นผลงาน

## ขั้นที่ 7 — เปิดดูในเกม

กลับไป Studio กด Play (หรือ Publish แล้วเปิดใน client) — `NightShiftBuilder` จะ:
1. อ่าน `ns:state` จาก DataStore
2. สร้างทุกชิ้นที่มี deterministic (seed = night)
3. Subscribe `nightshift` topic รอชิ้นใหม่ทันที

`NightShiftJournal` จะแสดง 7 entries ล่าสุดบนแผ่นจารึกที่ (30, 16, 0)

## ขั้นที่ 8 — หน้าเว็บ (static)

```bash
cd ../site
python3 -m http.server 8000
# เปิด http://localhost:8000
```

หรือ deploy ขึ้น Vercel/Netlify/GitHub Pages — ต้องมี `log.jsonl` + `previews/` + `index.html` ใน folder เดียวกัน

`index.html` verify hash chain ฝั่ง client ด้วย Web Crypto — ถ้า chain ขาดจะขึ้นป้ายแดง

## ขั้นที่ 9 — ตั้ง cron ให้รันตอน 02:00

### GitHub Actions (ฟรี)

`.github/workflows/night.yml`:

```yaml
name: Night Shift
on:
  schedule:
    - cron: "0 19 * * *"   # 19:00 UTC = 02:00 Asia/Bangkok
  workflow_dispatch: {}     # ปุ่มกดรัน manual

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd orchestrator && npm ci && npm run build
      - run: |
          export ROBLOX_API_KEY="${{ secrets.ROBLOX_API_KEY }}"
          export UNIVERSE_ID="${{ secrets.UNIVERSE_ID }}"
          export LLM_API_KEY="${{ secrets.LLM_API_KEY }}"
          export NIGHT=$(TZ=Asia/Bangkok date +%Y%m%d)
          cd orchestrator && npm run night
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          file_pattern: "site/log.jsonl site/previews/*.svg"
```

เพิ่ม secrets ใน GitHub repo → Settings → Secrets → Actions:
- `ROBLOX_API_KEY`
- `UNIVERSE_ID`
- `LLM_API_KEY`

### Fly.io Scheduled Machine (ทางเลือก ถ้าอยากได้ latency ต่ำ)

```bash
fly launch --now
fly secrets set ROBLOX_API_KEY=... UNIVERSE_ID=... LLM_API_KEY=...
fly sched add nightly --at "02:00" -- cmd "cd orchestrator && npm run night"
```

## Kill switch

- **ปิดชั่วคราว:** ปิด GitHub Actions workflow หรือ `fly sched pause`
- **ถาวร:** ลบ API key ใน https://create.roblox.com/dashboard/credentials → orchestrator จะ fail → `hesitate()` เขียน `n{NIGHT}-void` แทนที่จะ crash
- **rollback ชิ้นเดียว:** ลบ `ns:work:{id}` ใน DataStore แล้วลบ `works[i]` ออกจาก `ns:state` (ทำ manual เท่านั้น — ไม่มีโค้ดลบในระบบ)

## โควตาที่ต้องจำ

| รายการ | โควตา |
|---|---|
| DataStore write key เดียวกัน | ~1 ครั้ง/6 วินาที |
| MessagingService | 1 KB/ข้อความ, ~1–2 วินาที latency, best-effort |
| Open Cloud DataStore | 5,000 req/นาที/API key owner |
| LLM budget ต่อคืน | 4K input / 800 output / $0.10 |

## เกณฑ์สำเร็จ (Definition of Done)

- [ ] รัน `NIGHT=20261023` แล้วได้ผลงาน 1 ชิ้น (หรือ void — ก็ถือว่าเป็นผลงาน)
- [ ] รันซ้ำด้วย `NIGHT` เดิม → ไม่สร้างซ้ำ (`already ran tonight`)
- [ ] ปิด API key → `hesitate()` ไม่ crash
- [ ] ผู้เยี่ยมชมใหม่เข้า server ใหม่ → เห็นของทุกชิ้น (startup rebuild)
- [ ] หน้าเว็บ verify ผ่าน `hash chain verified ✓`
