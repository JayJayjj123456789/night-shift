-- ServerScriptService/NightShiftBuilder
-- Builds every work from DataStore spec. Deterministic: same seed+params = same result on every server.
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

local FORMS = {}

function FORMS.monolith(model, p)
  local h = lerp(8, 120, p.height or 0.5)
  local w = lerp(4, 40, p.width or 0.3)
  local part = Instance.new("Part")
  part.Anchored = true
  part.Size = Vector3.new(w, h, w)
  part.CFrame = CFrame.new(0, h / 2, 0)
  part.Material = Enum.Material.Concrete
  part.Color = Color3.fromHSV(p.hue or 0, 0.15, 0.85)
  part.Parent = model

  if (p.glow or 0) > 0.5 then
    local light = Instance.new("PointLight")
    light.Brightness = 2
    light.Range = 40
    light.Color = Color3.fromHSV(p.hue or 0, 0.8, 1)
    light.Parent = part
  end
end

function FORMS.garden(model, p)
  local radius = lerp(10, 60, p.radius or 0.5)
  local density = math.floor(lerp(5, 40, p.density or 0.5))
  local hue = p.hue or 0
  for i = 1, density do
    local angle = (i / density) * math.pi * 2
    local r = radius * math.sqrt(i / density)
    local x, z = math.cos(angle) * r, math.sin(angle) * r
    local h = lerp(1, 6, math.random())
    local part = Instance.new("Part")
    part.Anchored = true
    part.Size = Vector3.new(2, h, 2)
    part.CFrame = CFrame.new(x, h / 2, z)
    part.Material = Enum.Material.Grass
    part.Color = Color3.fromHSV((hue + i / density * 0.3) % 1, 0.7, 0.9)
    part.Parent = model
  end
end

function FORMS.machine(model, p)
  local count = math.floor(lerp(3, 12, p.parts or 0.5))
  local speed = lerp(0.1, 2, p.speed or 0.5)
  local glow = p.glow or 0
  for i = 1, count do
    local size = lerp(2, 8, math.random())
    local part = Instance.new("Part")
    part.Anchored = true
    part.Size = Vector3.new(size, size, size)
    part.CFrame = CFrame.new(0, size, 0) * CFrame.Angles(0, i * 0.5, 0)
    part.Material = Enum.Material.Metal
    part.Color = Color3.fromHSV(0, 0, 0.6)
    part.Parent = model

    if glow > 0.5 then
      local light = Instance.new("PointLight")
      light.Brightness = 1
      light.Range = 20
      light.Parent = part
    end

    -- simple rotation via RotateVelocity isn't available on anchored parts; use Tween
    local a = Instance.new("AlignOrientation")
    a.Mode = Enum.OrientationAlignmentMode.OneAttachment
    a.MaxTorque = math.huge
    a.Responsiveness = 100
    local att = Instance.new("Attachment")
    att.Parent = part
    a.Attachment0 = att
    a.Parent = part
  end
end

function FORMS.text(model, p)
  local size = lerp(4, 20, p.size or 0.5)
  local depth = lerp(0.5, 2, p.depth or 0.5)
  local hue = p.hue or 0
  local part = Instance.new("Part")
  part.Anchored = true
  part.Size = Vector3.new(size, size, depth)
  part.CFrame = CFrame.new(0, size / 2, 0)
  part.Material = Enum.Material.Neon
  part.Color = Color3.fromHSV(hue, 1, 1)
  part.Parent = model

  local gui = Instance.new("SurfaceGui")
  gui.Face = Enum.NormalId.Front
  gui.Parent = part
  local label = Instance.new("TextLabel")
  label.Size = UDim2.new(1, 0, 1, 0)
  label.BackgroundTransparency = 1
  label.Text = "—"
  label.TextScaled = true
  label.Font = Enum.Font.GothamBold
  label.TextColor3 = Color3.new(1, 1, 1)
  label.Parent = gui
end

function FORMS.light(model, p)
  local h = lerp(20, 200, p.height or 0.5)
  local intensity = lerp(0.5, 5, p.intensity or 0.5)
  local hue = p.hue or 0
  local pole = Instance.new("Part")
  pole.Anchored = true
  pole.Size = Vector3.new(1, h, 1)
  pole.CFrame = CFrame.new(0, h / 2, 0)
  pole.Material = Enum.Material.Metal
  pole.Parent = model

  local beacon = Instance.new("Part")
  beacon.Anchored = true
  beacon.Shape = Enum.PartType.Ball
  beacon.Size = Vector3.new(3, 3, 3)
  beacon.CFrame = CFrame.new(0, h, 0)
  beacon.Material = Enum.Material.Neon
  beacon.Color = Color3.fromHSV(hue, 1, 1)
  beacon.Parent = model

  local light = Instance.new("PointLight")
  light.Brightness = intensity
  light.Range = 80
  light.Color = Color3.fromHSV(hue, 1, 1)
  light.Parent = beacon
end

-- void still leaves a marker: an empty plot should show *something* (and telemetry
-- needs at least one BasePart to measure a distance against).
function FORMS.void(model, p)
  local marker = Instance.new("Part")
  marker.Name = "VoidMarker"
  marker.Anchored = true
  marker.CanCollide = false
  marker.Transparency = 0.55
  marker.Size = Vector3.new(4, 4, 4)
  marker.Shape = Enum.PartType.Ball
  marker.CFrame = CFrame.new(0, 2, 0)
  marker.Material = Enum.Material.Glass
  marker.Color = Color3.fromRGB(120, 120, 130)
  marker.Parent = model
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

local function build(work)
  if not work or not work.form or work.builderVersion ~= 1 then return end
  local ok, err = validateParams(work.form, work.params or {})
  if not ok then warn("[NightShift] rejected " .. tostring(work.id) .. ": " .. err) return end

  local model = Instance.new("Model")
  model.Name = work.id
  FORMS[work.form](model, work.params or {})
  model:PivotTo(CFrame.new(work.site.x, 0, work.site.z))
  model.Parent = root
end

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
