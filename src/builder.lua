-- ServerScriptService/NightShiftBuilder
-- Builds every work from the DataStore spec. Deterministic: the same work always
-- produces the same shape on every server, because every random value comes from
-- a generator seeded with work.seed. (The first version claimed determinism in
-- this comment and then called math.random() in garden and machine, so two
-- servers showed two different gardens. Fixed.)
--
-- Visual pass 2026-10-24: each form is composed from several parts instead of
-- one box — tapered slabs with glowing seams, layered planting, a real
-- mechanism, letterspaced type on a plinth, a segmented lantern, a void that
-- reads as deliberate. Primitives only, no meshes: a server must be able to
-- rebuild the whole plot from the DataStore with no asset dependency.

-- Bumped by hand whenever this file changes, in the same commit as the change.
--
-- Nothing in the place can know what the repo contains, so the number is the only
-- thing that can travel. The startup heartbeat below writes it to ns:builder, the
-- orchestrator reads that and compares it with this line, and `npm run status`
-- then says "the place is running v2, the repo has v3" instead of staying green
-- over a place that was never re-installed.
local BUILDER_VERSION = 4

local DSS = game:GetService("DataStoreService")
local Messaging = game:GetService("MessagingService")
local Http = game:GetService("HttpService")

local store = DSS:GetDataStore("NightShift_v1")
local root = workspace:FindFirstChild("NightShift")
if not root then
  root = Instance.new("Folder")
  root.Name = "NightShift"
  root.Parent = workspace
end

-- Param spec mirrors orchestrator's PARAM_SPEC. Each form: key -> {min, max}
local SPEC = {
  monolith = { height = {0.2, 1}, width = {0.1, 0.6}, glow = {0, 1}, hue = {0, 1} },
  garden   = { radius = {0.2, 1}, density = {0.1, 1}, hue = {0, 1} },
  machine  = { parts = {0.2, 1}, speed = {0.1, 1}, glow = {0, 1} },
  text     = { size = {0.2, 1}, depth = {0.1, 1}, hue = {0, 1} },
  light    = { height = {0.2, 1}, intensity = {0.1, 1}, hue = {0, 1} },
  void     = {},
}

local function lerp(a, b, t)
  return a + (b - a) * math.clamp(t, 0, 1)
end

-- Park–Miller. Small, exact in doubles, identical on every server.
local function rng(seed)
  local s = math.floor(math.abs(seed or 1)) % 2147483647
  if s <= 0 then s += 2147483646 end
  return function()
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  end
end

local function part(model, name, size, cf, props)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = false
  p.Size = size
  p.CFrame = cf
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  for k, v in pairs(props or {}) do p[k] = v end
  p.Parent = model
  return p
end

-- PartType.Cylinder stands on its side, so every cylinder is turned to make Y
-- its axis — otherwise "height" comes out horizontal.
local function cylinder(model, name, size, cf, props)
  local p = part(model, name, size, cf * CFrame.Angles(0, 0, math.rad(90)), props)
  p.Shape = Enum.PartType.Cylinder
  return p
end

local function wedge(model, name, size, cf, props)
  local w = Instance.new("WedgePart")
  w.Name = name
  w.Anchored = true
  w.CanCollide = false
  w.Size = size
  w.CFrame = cf
  w.TopSurface = Enum.SurfaceType.Smooth
  w.BottomSurface = Enum.SurfaceType.Smooth
  for k, v in pairs(props or {}) do w[k] = v end
  w.Parent = model
  return w
end

local FORMS = {}

-- A tapering stack of slabs with a seam of light between them, on a plinth.
-- At 200 studs the silhouette is all anyone sees, so the taper carries it.
function FORMS.monolith(model, p, work)
  local h = lerp(14, 130, p.height or 0.5)
  local w = lerp(6, 34, p.width or 0.3)
  local hue = p.hue or 0
  local glow = p.glow or 0
  local r = rng(work.seed)

  local levels = 5 + math.floor(r() * 4)          -- 5..8 slabs
  local plinthH = h * 0.06
  -- two stepped tiers instead of wedge buttresses: a wedge that size reads as a
  -- black board standing next to the tower, not as part of it
  part(model, "PlinthLow", Vector3.new(w * 1.45, plinthH * 0.6, w * 1.45),
    CFrame.new(0, plinthH * 0.3, 0),
    { Material = Enum.Material.Basalt, Color = Color3.fromHSV(hue, 0.08, 0.42) })
  part(model, "PlinthHigh", Vector3.new(w * 1.22, plinthH * 0.5, w * 1.22),
    CFrame.new(0, plinthH * 0.85, 0),
    { Material = Enum.Material.Basalt, Color = Color3.fromHSV(hue, 0.08, 0.36) })

  local y = plinthH
  for i = 1, levels do
    local t = (i - 1) / levels
    local taper = 1 - t * 0.45
    local slabW = w * taper
    local slabH = (h - plinthH) / levels * lerp(1.25, 0.85, t)

    part(model, "Slab" .. i, Vector3.new(slabW, slabH, slabW),
      CFrame.new(0, y + slabH / 2, 0),
      { Material = Enum.Material.Concrete, Color = Color3.fromHSV(hue, 0.10, lerp(0.92, 0.74, t)) })

    -- a lit joint between slabs reads as construction, not as a texture
    if glow > 0.35 and i > 1 then
      part(model, "Seam" .. i, Vector3.new(slabW * 0.92, 0.35, slabW * 0.92),
        CFrame.new(0, y + 0.18, 0),
        { Material = Enum.Material.Neon, Color = Color3.fromHSV(hue, 0.85, 1) })
    end

    y += slabH
  end

  if glow > 0.5 then
    local cap = part(model, "Cap", Vector3.new(w * 0.16, 2.5, w * 0.16),
      CFrame.new(0, y + 1.2, 0),
      { Material = Enum.Material.Neon, Color = Color3.fromHSV(hue, 0.8, 1) })
    local l = Instance.new("PointLight")
    l.Brightness = 2.2
    l.Range = math.max(40, w * 3)
    l.Color = Color3.fromHSV(hue, 0.7, 1)
    l.Parent = cap
  end
end

-- A planted mound: three stacked discs, a thicket of trunks with canopies, and
-- blades at the rim. The first pass used 0.5-stud stems with 3-stud blooms and
-- read as coloured balls floating over the ground — thin parts vanish at 100
-- studs, so nothing here is thinner than ~1.5.
function FORMS.garden(model, p, work)
  local radius = lerp(14, 58, p.radius or 0.5)
  local density = p.density or 0.5
  local hue = p.hue or 0
  local r = rng(work.seed)

  local tiers = 3
  for i = 1, tiers do
    local f = 1 - (i - 1) * 0.28
    local hh = radius * 0.12
    cylinder(model, "Mound" .. i, Vector3.new(radius * f, hh, radius * f),
      CFrame.new(0, hh * (i - 0.5), 0),
      { Material = Enum.Material.Ground,
        Color = Color3.fromHSV((hue + 0.08) % 1, 0.35, lerp(0.34, 0.46, i / tiers)) })
  end
  local groundY = radius * 0.12 * tiers

  local trees = math.floor(lerp(4, 14, density))
  for i = 1, trees do
    local a = (i / trees) * math.pi * 2 + r() * 0.8
    local d = radius * (0.15 + r() * 0.65)
    local x, z = math.cos(a) * d, math.sin(a) * d
    local trunkH = lerp(4, 13, r())
    local tint = (hue + r() * 0.22) % 1

    cylinder(model, "Trunk" .. i, Vector3.new(1.6, trunkH, 1.6),
      CFrame.new(x, groundY + trunkH / 2, z),
      { Material = Enum.Material.Wood, Color = Color3.fromHSV(tint, 0.45, 0.34) })

    local canopy = lerp(4.5, 9, r())
    part(model, "Canopy" .. i, Vector3.new(canopy, canopy * 0.8, canopy),
      CFrame.new(x, groundY + trunkH + canopy * 0.3, z),
      { Shape = Enum.PartType.Ball,
        Material = (r() > 0.85) and Enum.Material.Neon or Enum.Material.Grass,
        Color = Color3.fromHSV(tint, 0.55, lerp(0.45, 0.62, r())) })
  end

  local blades = math.floor(lerp(10, 30, density))
  for i = 1, blades do
    local a = r() * math.pi * 2
    local d = radius * (0.75 + r() * 0.3)
    local bh = lerp(3, 9, r())
    wedge(model, "Blade" .. i, Vector3.new(1.6, bh, 0.4),
      CFrame.new(math.cos(a) * d, groundY + bh / 2, math.sin(a) * d)
        * CFrame.Angles(math.rad(lerp(-14, 14, r())), a, 0),
      { Material = Enum.Material.Grass,
        Color = Color3.fromHSV((hue + 0.12) % 1, 0.6, lerp(0.4, 0.55, r())) })
  end

  for i = 1, 3 do
    local a = r() * math.pi * 2
    local d = radius * (0.3 + r() * 0.5)
    part(model, "Bloom" .. i, Vector3.new(1.4, 1.4, 1.4),
      CFrame.new(math.cos(a) * d, groundY + lerp(4, 9, r()), math.sin(a) * d),
      { Shape = Enum.PartType.Ball, Material = Enum.Material.Neon,
        Color = Color3.fromHSV((hue + 0.5) % 1, 0.7, 1) })
  end
end

-- A core with two rings and four pistons. The first version placed every part at
-- CFrame.new(0, size, 0), so the "machine" was one pile of cubes at the origin.
function FORMS.machine(model, p, work)
  local count = math.floor(lerp(3, 12, p.parts or 0.5))
  local glow = p.glow or 0
  local r = rng(work.seed)

  local coreH = lerp(6, 22, r())
  cylinder(model, "Core", Vector3.new(3.2, coreH, 3.2),
    CFrame.new(0, coreH / 2 + 1.5, 0),
    { Material = Enum.Material.Metal, Color = Color3.fromRGB(58, 60, 66) })

  part(model, "Base", Vector3.new(12, 1.5, 12), CFrame.new(0, 0.75, 0),
    { Material = Enum.Material.DiamondPlate, Color = Color3.fromRGB(44, 46, 52) })

  for ring = 1, 2 do
    local radius = 6 + ring * 4
    local y = coreH * (0.35 + ring * 0.25) + 1.5
    local n = math.max(4, count - ring * 2)
    for i = 1, n do
      local a = (i / n) * math.pi * 2 + ring * 0.4
      local sz = lerp(1.6, 3.4, r())
      part(model, "Ring" .. ring .. "_" .. i, Vector3.new(sz * 2.2, sz, sz * 0.6),
        CFrame.new(math.cos(a) * radius, y, math.sin(a) * radius)
          * CFrame.Angles(0, -a, 0),
        { Material = Enum.Material.Metal,
          Color = Color3.fromHSV(0.08, 0.05, lerp(0.55, 0.75, r())) })
    end
  end

  for i = 1, 4 do
    local a = (i / 4) * math.pi * 2 + math.rad(45)
    cylinder(model, "Piston" .. i, Vector3.new(1.4, 9, 1.4),
      CFrame.new(math.cos(a) * 5, 1.5 + 4.5, math.sin(a) * 5)
        * CFrame.Angles(0, -a, math.rad(62)),
      { Material = Enum.Material.Metal, Color = Color3.fromRGB(90, 92, 98) })
  end

  if glow > 0.4 then
    local ring = cylinder(model, "GlowRing", Vector3.new(6.6, 0.6, 6.6),
      CFrame.new(0, coreH + 1.5, 0),
      { Material = Enum.Material.Neon, Color = Color3.fromHSV(0.08, 0.9, 1) })
    local l = Instance.new("PointLight")
    l.Brightness = 2
    l.Range = 50
    l.Color = Color3.fromHSV(0.08, 0.7, 1)
    l.Parent = ring
  end
end

-- The work's own title, letterspaced on a lit face, on a plinth. It used to be a
-- Neon plate showing an em dash.
function FORMS.text(model, p, work)
  local size = lerp(8, 30, p.size or 0.5)
  local depth = lerp(1.2, 4, p.depth or 0.5)
  local hue = p.hue or 0
  local title = (work.title or ""):upper()

  part(model, "Plinth", Vector3.new(size * 1.15, 2, size * 0.5),
    CFrame.new(0, 1, 0),
    { Material = Enum.Material.Basalt, Color = Color3.fromRGB(30, 30, 34) })

  local plate = part(model, "Plate", Vector3.new(size, size * 0.55, depth),
    CFrame.new(0, 2 + size * 0.275, 0),
    { Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(16, 16, 20) })

  local face = part(model, "Face", Vector3.new(size * 0.94, size * 0.48, 0.2),
    CFrame.new(0, 2 + size * 0.275, -depth / 2 - 0.05),
    { Material = Enum.Material.Neon, Color = Color3.fromHSV(hue, 0.9, 1) })

  local gui = Instance.new("SurfaceGui")
  gui.Face = Enum.NormalId.Front
  gui.CanvasSize = Vector2.new(1000, 520)
  gui.LightInfluence = 0
  gui.Parent = face

  local label = Instance.new("TextLabel")
  label.Size = UDim2.fromScale(1, 1)
  label.BackgroundTransparency = 1
  label.Text = title
  label.TextScaled = true
  label.Font = Enum.Font.GothamBold
  label.TextColor3 = Color3.fromRGB(10, 10, 12)
  label.Parent = gui

  local light = Instance.new("PointLight")
  light.Brightness = 1.6
  light.Range = size * 2
  light.Color = Color3.fromHSV(hue, 0.6, 1)
  light.Parent = face
end

-- A segmented mast, a lantern with a glass shell, a downward spot. The pole used
-- to be one 200-stud stick with a ball on top.
function FORMS.light(model, p, work)
  local h = lerp(24, 180, p.height or 0.5)
  local intensity = lerp(0.5, 5, p.intensity or 0.5)
  local hue = p.hue or 0
  local r = rng(work.seed)

  local baseH = h * 0.04
  cylinder(model, "Base", Vector3.new(h * 0.06, baseH, h * 0.06),
    CFrame.new(0, baseH / 2, 0),
    { Material = Enum.Material.Basalt, Color = Color3.fromRGB(28, 28, 32) })

  local segments = 5
  local y = baseH
  for i = 1, segments do
    local t = (i - 1) / segments
    local segH = (h - baseH) / segments
    -- 0.018 * h was 2.4 studs on a 134-stud mast: invisible from 60 studs away
    local w = math.max(2, lerp(h * 0.034, h * 0.018, t))
    cylinder(model, "Mast" .. i, Vector3.new(w, segH * 0.94, w),
      CFrame.new(0, y + segH / 2, 0),
      { Material = Enum.Material.Metal, Color = Color3.fromRGB(128, 132, 140) })
    cylinder(model, "Collar" .. i, Vector3.new(w * 1.7, 0.9, w * 1.7),
      CFrame.new(0, y + segH, 0),
      { Material = Enum.Material.Metal, Color = Color3.fromRGB(170, 174, 182) })
    y += segH
  end

  local lanternY = h + 2
  local shell = part(model, "Lantern", Vector3.new(5, 5, 5),
    CFrame.new(0, lanternY, 0),
    { Shape = Enum.PartType.Ball, Material = Enum.Material.Glass,
      Color = Color3.fromHSV(hue, 0.15, 0.95), Transparency = 0.35 })

  local core = part(model, "LanternCore", Vector3.new(2.4, 2.4, 2.4),
    CFrame.new(0, lanternY, 0),
    { Shape = Enum.PartType.Ball, Material = Enum.Material.Neon,
      Color = Color3.fromHSV(hue, 0.85, 1) })

  local halo = Instance.new("PointLight")
  halo.Brightness = intensity
  halo.Range = 60 + h * 0.4
  halo.Color = Color3.fromHSV(hue, 0.55, 1)
  halo.Parent = core

  local spot = Instance.new("SpotLight")
  spot.Angle = 70
  spot.Range = 40 + h * 0.5
  spot.Brightness = intensity * 0.8
  spot.Face = Enum.NormalId.Bottom
  spot.Color = Color3.fromHSV(hue, 0.4, 1)
  spot.Parent = shell

  for i = 1, 6 do
    local a = (i / 6) * math.pi * 2 + r()
    part(model, "Orbit" .. i, Vector3.new(0.8, 0.8, 0.8),
      CFrame.new(math.cos(a) * 3.4, lanternY + math.sin(a * 2) * 1.2, math.sin(a) * 3.4),
      { Shape = Enum.PartType.Ball, Material = Enum.Material.Neon,
        Color = Color3.fromHSV(hue, 0.7, 1) })
  end
end

-- void still leaves a marker: an empty plot should show *something* (and
-- telemetry needs at least one BasePart to measure a distance against). A ring
-- and a dim core, so it reads as a decision rather than an absence.
function FORMS.void(model, p, work)
  cylinder(model, "Ring", Vector3.new(14, 0.8, 14), CFrame.new(0, 0.4, 0),
    { Material = Enum.Material.Slate, Color = Color3.fromRGB(96, 98, 110) })

  part(model, "VoidMarker", Vector3.new(5, 5, 5),
    CFrame.new(0, 3.6, 0),
    { Shape = Enum.PartType.Ball, Material = Enum.Material.Glass,
      Color = Color3.fromRGB(150, 152, 168), Transparency = 0.2 })

  local inner = part(model, "VoidCore", Vector3.new(2, 2, 2),
    CFrame.new(0, 3.6, 0),
    { Shape = Enum.PartType.Ball, Material = Enum.Material.Neon,
      Color = Color3.fromRGB(120, 122, 150) })
  local l = Instance.new("PointLight")
  l.Brightness = 0.5
  l.Range = 18
  l.Color = Color3.fromRGB(150, 150, 180)
  l.Parent = inner
end

local function validateParams(form, params)
  local spec = SPEC[form]
  if not spec then return false, "unknown form" end
  for k, v in pairs(params) do
    local range = spec[k]
    if not range then return false, "unknown param " .. k end
    if v < range[1] or v > range[2] then return false, "param " .. k .. " out of range" end
  end
  return true
end

-- ── assemblies (parts) ────────────────────────────────────────────────────────
-- A work may carry an explicit part list instead of one templated form. Same
-- palette, materials and size semantics as the orchestrator schema, the SVG
-- preview and the 3D page, so a work looks like itself everywhere.
-- pos is the CENTRE of the part in studs, relative to the work's site.
local PALETTE = {
  ink    = Color3.fromRGB(11, 18, 32),
  slate  = Color3.fromRGB(51, 65, 85),
  bone   = Color3.fromRGB(214, 203, 184),
  rust   = Color3.fromRGB(154, 75, 43),
  amber  = Color3.fromRGB(224, 163, 58),
  jade   = Color3.fromRGB(63, 158, 122),
  sky    = Color3.fromRGB(90, 169, 230),
  violet = Color3.fromRGB(139, 107, 217),
}

local MATERIALS = {
  neon  = Enum.Material.Neon,
  glass = Enum.Material.Glass,
  stone = Enum.Material.Slate,
  metal = Enum.Material.Metal,
}

local PARTS_BUDGET = 8
local PART_REACH = 64
local MAX_HEIGHT = 90

local function rotate(cf, rot)
  if not rot then return cf end
  local d = math.pi / 180
  return cf * CFrame.Angles(rot[1] * d, rot[2] * d, rot[3] * d)
end

local function addPart(parent, p)
  local color = PALETTE[p.color] or PALETTE.bone
  local material = MATERIALS[p.material] or Enum.Material.Slate
  local shape = p.shape or "block"
  local size = p.size or { 1, 1, 1 }
  local pos = p.pos or { 0, 0, 0 }

  local cf = CFrame.new(pos[1], pos[2], pos[3])
  local p2

  if shape == "sphere" then
    p2 = part(parent, "part", { size[1], size[1], size[1] }, rotate(cf, p.rot), {
      Shape = Enum.PartType.Ball, Material = material, Color = color,
    })
  elseif shape == "cylinder" then
    p2 = cylinder(parent, "part", { size[1], size[2], size[1] }, rotate(cf, p.rot), {
      Material = material, Color = color,
    })
  elseif shape == "wedge" then
    p2 = wedge(parent, "part", { size[1], size[2], size[3] }, rotate(cf, p.rot), {
      Material = material, Color = color,
    })
  else
    -- block, plate, cone and torus have no Roblox primitive without an asset;
    -- cone and torus fall back to a block of the same footprint so the work
    -- still reads as the same object in-game.
    p2 = part(parent, "part", { size[1], size[2], size[3] }, rotate(cf, p.rot), {
      Material = material, Color = color,
    })
  end

  if p2 and (p.emissive or 0) > 0 then
    local l = Instance.new("PointLight")
    l.Color = color
    l.Brightness = 0.4 + (p.emissive or 0) * 0.9
    l.Range = 14 + (p.emissive or 0) * 18
    l.Parent = p2
  end
  return p2
end

local function buildParts(model, parts, work)
  if #parts > PARTS_BUDGET then
    warn("[NightShift] rejected " .. tostring(work.id) .. ": too many parts")
    return false
  end
  for i, p in ipairs(parts) do
    local size = p.size or { 1, 1, 1 }
    local pos = p.pos or { 0, 0, 0 }
    if math.abs(pos[1]) + size[1] / 2 > PART_REACH
      or math.abs(pos[3]) + (size[3] or size[1]) / 2 > PART_REACH then
      warn("[NightShift] rejected " .. tostring(work.id) .. ": part " .. i .. " too far from site")
      return false
    end
    if pos[2] + size[2] > MAX_HEIGHT then
      warn("[NightShift] rejected " .. tostring(work.id) .. ": part " .. i .. " too tall")
      return false
    end
    addPart(model, p)
  end
  return true
end

local function build(work)
  if not work or not work.form or work.builderVersion ~= 1 then return end
  local ok, err = validateParams(work.form, work.params or {})
  if not ok then warn("[NightShift] rejected " .. tostring(work.id) .. ": " .. err) return end

  -- rebuild in place: a repeat call must not leave a second copy behind
  local existing = root:FindFirstChild(work.id)
  if existing then existing:Destroy() end

  local model = Instance.new("Model")
  model.Name = work.id

  -- an assembly replaces the templated form; works without parts keep building
  -- exactly as they did before this existed
  if work.parts and #work.parts > 0 then
    if not buildParts(model, work.parts, work) then model:Destroy() return end
  else
    FORMS[work.form](model, work.params or {}, work)
  end

  -- Translate, do not re-pivot. PivotTo sets the pivot's position, and a model's
  -- pivot is its bounding-box centre — so PivotTo(CFrame.new(x, 0, z)) buried
  -- every work halfway into the ground. That bug predates this rewrite: a
  -- 130-stud monolith stood with its base at y=-65 and nobody had looked.
  local pivot = model:GetPivot()
  model:PivotTo(pivot + Vector3.new(work.site.x, 0, work.site.z))
  model.Parent = root
end

-- heartbeat: which builder is actually running in this place.
--
-- FIRST, before anything that can fail. It was written after the rebuild loop,
-- which meant that if a single GetAsync threw or a work failed to build, the
-- script died and the place reported nothing — and "nothing" is indistinguishable
-- from "this place never got the new code", which is the exact confusion the
-- heartbeat exists to remove. It needs no state, so it goes first.
--
-- One write per server start. Wrapped: a failed heartbeat must never stop the
-- plot from being built.
pcall(function()
  store:SetAsync("ns:builder", {
    version = BUILDER_VERSION,
    at = os.time(),
  })
end)

-- startup: rebuild everything from state
local state = store:GetAsync("ns:state")
if state then
  for _, ref in ipairs(state.works or {}) do
    local work = store:GetAsync("ns:work:" .. ref.id)
    if work then build(work) end
  end
end

-- live: build new work the moment it's published
Messaging:SubscribeAsync("nightshift", function(msg)
  local ok, data = pcall(function() return Http:JSONDecode(msg.Data) end)
  if ok and data and data.type == "new_work" then
    local work = store:GetAsync("ns:work:" .. data.id)
    if work then build(work) end
  end
end)
