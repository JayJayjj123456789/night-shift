-- ServerScriptService/NightShiftTelemetry
-- Samples every 5s: for each player, for each work within 30 studs, accumulate {near, dwell}.
--
-- The flush used to be `SetAsync` of this server's running total, which is
-- correct for exactly one server and wrong the moment there are two: each server
-- holds its own accumulator, each writes the WHOLE day's table, and the last
-- writer erases the other one's attention. Nothing errors, nothing turns red —
-- the piece just quietly sees less of its visitors than it had.
--
-- Now the flush sends only the DELTA since this server's last write, and merges
-- it with UpdateAsync, whose transform runs server-side and atomically. The
-- running total is still kept, for nothing else than to compute that delta; what
-- lands in the store is the sum of every server's deltas.
local Players = game:GetService("Players")
local DSS = game:GetService("DataStoreService")
local store = DSS:GetDataStore("NightShift_v1")

local acc = {}       -- [date][workId] = { near, dwell }  this server's running total
local flushed = {}   -- [date][workId] = { near, dwell }  what this server last wrote

local function snapshot(t)
  -- a copy of one day's rows; without it `flushed` would alias the table that
  -- keeps mutating and every delta after the first would come out zero
  local out = {}
  for id, row in pairs(t) do
    out[id] = { near = row.near, dwell = row.dwell }
  end
  return out
end

local function flush()
  -- once per minute: os.date("!%M") is minute-of-hour 0..59 so %1 is always true;
  -- track seconds instead and take the first 5s window of each minute
  local sec = tonumber(os.date("!%S"))
  if not sec or sec >= 6 then return end

  for d, works in pairs(acc) do
    if next(works) then
      local prev = flushed[d] or {}
      local delta = {}
      for id, row in pairs(works) do
        local before = prev[id]
        local dn = row.near - (before and before.near or 0)
        local dd = row.dwell - (before and before.dwell or 0)
        if dn > 0 or dd > 0 then
          delta[id] = { near = dn, dwell = dd }
        end
      end
      flushed[d] = snapshot(works)

      if next(delta) then
        local key = "ns:telemetry:" .. d
        local payload = delta
        pcall(function()
          store:UpdateAsync(key, function(old)
            local merged = {}
            if old then
              for id, row in pairs(old) do
                merged[id] = { near = row.near or 0, dwell = row.dwell or 0 }
              end
            end
            for id, row in pairs(payload) do
              local cur = merged[id] or { near = 0, dwell = 0 }
              cur.near = (cur.near or 0) + row.near
              cur.dwell = (cur.dwell or 0) + row.dwell
              merged[id] = cur
            end
            return merged
          end)
        end)
      end
    end
  end
end

task.spawn(function()
  while true do
    task.wait(5)
    local date = os.date("!%Y-%m-%d")
    acc[date] = acc[date] or {}

    local root = workspace:FindFirstChild("NightShift")
    if root then
      for _, player in ipairs(Players:GetPlayers()) do
        local char = player.Character
        local hrp = char and char:FindFirstChild("HumanoidRootPart")
        if hrp then
          for _, model in ipairs(root:GetChildren()) do
            -- only real works: id pattern n{NIGHT}-x (e.g. n20261022-a), and must have
            -- geometry to measure against. Skips NightShiftJournal and empty models.
            if model:IsA("Model") and string.match(model.Name, "^n%d+%-%a") then
              local hasPart = false
              for _, d in ipairs(model:GetDescendants()) do
                if d:IsA("BasePart") then hasPart = true break end
              end
              if not hasPart then continue end
              local dist = (hrp.Position - model:GetPivot().Position).Magnitude
              if dist <= 30 then
                local row = acc[date][model.Name] or { near = 0, dwell = 0 }
                row.near += 1
                row.dwell += 5
                acc[date][model.Name] = row
              end
            end
          end
        end
      end
    end

    flush()
  end
end)
