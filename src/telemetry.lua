-- ServerScriptService/NightShiftTelemetry
-- Samples every 5s: for each player, for each work within 30 studs, accumulate {near, dwell}.
local Players = game:GetService("Players")
local DSS = game:GetService("DataStoreService")
local store = DSS:GetDataStore("NightShift_v1")

local acc = {} -- [date][workId] = { near, dwell }

task.spawn(function()
  while true do
    task.wait(5)
    local date = os.date("!%Y-%m-%d")
    acc[date] = acc[date] or {}

    local root = workspace:FindFirstChild("NightShift")
    if not root then continue end

    for _, player in ipairs(Players:GetPlayers()) do
      local char = player.Character
      local hrp = char and char:FindFirstChild("HumanoidRootPart")
      if not hrp then continue end

      for _, model in ipairs(root:GetChildren()) do
        -- only real works: id pattern n{NIGHT}-x (e.g. n20261022-a), and must have
        -- geometry to measure against. Skips NightShiftJournal and empty models.
        if model:IsA("Model") and string.match(model.Name, "^n%d+%-%a") then
          local hasPart = false
          for _, d in ipairs(model:GetDescendants()) do
            if d:IsA("BasePart") then hasPart = true break end
          end
          if not hasPart then continue end
          local d = (hrp.Position - model:GetPivot().Position).Magnitude
          if d <= 30 then
            local row = acc[date][model.Name] or { near = 0, dwell = 0 }
            row.near += 1
            row.dwell += 5
            acc[date][model.Name] = row
          end
        end
      end
    end

    -- flush once per minute to avoid hammering DataStore write quota
    -- (os.date("!%M") is the minute-of-hour 0..59 — %1 == 0 is always true, so track seconds too)
    local sec = tonumber(os.date("!%S"))
    if sec < 6 and next(acc) then
      for d, works in pairs(acc) do
        if next(works) then
          pcall(function()
            store:SetAsync("ns:telemetry:" .. d, works)
          end)
        end
      end
    end
  end
end)
