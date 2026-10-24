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
local ticks = 0      -- loop iterations; 5s each, so 12 is a minute

-- What the last iteration actually saw. `wrote: 0` on its own does not say
-- whether nobody was playing, nobody was near a work, or no work matched the
-- name — three completely different failures that all look identical from the
-- store. These three numbers separate them in one read.
local seen = { players = 0, models = 0, nearest = -1 }

-- Flush every 12th iteration of the 5-second loop — a minute — counted rather
-- than read from a clock.
--
-- It used to gate on `os.date("!%S") < 6`, a five-second window inside each
-- minute. That is the original code and it may never have worked: telemetry has
-- produced data exactly once, on 2026-10-22, and nobody had visited since, so a
-- flush that never fires is indistinguishable from a plot nobody looks at.
-- Counting iterations needs no time API at all.
local FLUSH_EVERY = 12;

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
  ticks += 1
  if ticks % FLUSH_EVERY ~= 0 then return end

  local wrote = 0
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
        wrote += 1
      end
    end
  end

  -- A liveness marker, written with SetAsync rather than UpdateAsync because
  -- SetAsync is the path the builder heartbeat proves works. Without it, "the
  -- loop never runs" and "the loop runs but the write fails" look identical from
  -- outside — which is exactly the confusion this whole session has been fixing.
  pcall(function()
    store:SetAsync("ns:telemetry:status", {
      at = os.time(),
      flushes = ticks,
      wrote = wrote,
      players = seen.players,
      models = seen.models,
      nearest = seen.nearest >= 0 and math.floor(seen.nearest) or -1,
    })
  end)
end

task.spawn(function()
  while true do
    task.wait(5)
    local date = os.date("!%Y-%m-%d")
    acc[date] = acc[date] or {}

    local root = workspace:FindFirstChild("NightShift")
    if root then
      seen.models = 0
      seen.nearest = -1
      for _, model in ipairs(root:GetChildren()) do
        if model:IsA("Model") and string.match(model.Name, "^n%d+%-%a") then
          seen.models += 1
        end
      end
      seen.players = #Players:GetPlayers()
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
              if seen.nearest < 0 or dist < seen.nearest then seen.nearest = dist end
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
