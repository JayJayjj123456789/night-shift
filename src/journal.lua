-- ServerScriptService/NightShiftJournal
-- Renders the last 7 journal entries as a Part + SurfaceGui tablet.
local DSS = game:GetService("DataStoreService")
local TextService = game:GetService("TextService")
local store = DSS:GetDataStore("NightShift_v1")

local root = workspace:FindFirstChild("NightShift")
if not root then
  root = Instance.new("Folder")
  root.Name = "NightShift"
  root.Parent = workspace
end

local function buildTablet(state)
  local old = root:FindFirstChild("NightShiftJournal")
  if old then old:Destroy() end

  local works = {}
  local all = state and state.works or {}
  for i = math.max(1, #all - 6), #all do
    table.insert(works, all[i])
  end

  local lines = {}
  for i, ref in ipairs(works) do
    local work = store:GetAsync("ns:work:" .. ref.id)
    if work then
      table.insert(lines, string.format("[N%d] %s\n%s\nhash: %s",
        work.night, work.title, work.journal, work.hash))
    end
  end

  local model = Instance.new("Model")
  model.Name = "NightShiftJournal"

  local W, H, D = 24, 32, 1
  local part = Instance.new("Part")
  part.Anchored = true
  part.Size = Vector3.new(W, H, D)
  part.CFrame = CFrame.new(30, H / 2, 0)
  part.Material = Enum.Material.Slate
  part.Color = Color3.fromHSV(0, 0, 0.15)
  part.Parent = model

  local gui = Instance.new("SurfaceGui")
  gui.Face = Enum.NormalId.Front
  gui.CanvasSize = Vector2.new(W * 24, H * 24)
  gui.Parent = part

  local label = Instance.new("TextLabel")
  label.Size = UDim2.new(1, -16, 1, -16)
  label.Position = UDim2.new(0, 8, 0, 8)
  label.BackgroundTransparency = 1
  label.Font = Enum.Font.Code
  label.TextSize = 16
  label.TextWrapped = true
  label.TextYAlignment = Enum.TextYAlignment.Top
  label.TextXAlignment = Enum.TextXAlignment.Left
  label.TextColor3 = Color3.fromHSV(0.1, 0.1, 0.9)
  label.Text = table.concat(lines, "\n\n---\n\n")
  label.Parent = gui

  model:PivotTo(part.CFrame)
  model.Parent = root
end

-- initial build + periodic refresh every 60s
task.spawn(function()
  while true do
    local ok, state = pcall(function() return store:GetAsync("ns:state") end)
    if ok and state then buildTablet(state) end
    task.wait(60)
  end
end)
