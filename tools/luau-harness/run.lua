local function mkInstance(class)
  local o = { ClassName = class, Name = "x", Children = {}, _props = {} }
  function o:IsA(c) return c == self.ClassName or c == "Instance" end
  function o:FindFirstChild(n)
    for _, c in ipairs(self.Children) do if c.Name == n then return c end end
    return nil
  end
  function o:GetChildren() return self.Children end
  function o:GetDescendants()
    local out = {}
    for _, c in ipairs(self.Children) do
      out[#out + 1] = c
      for _, d in ipairs(c:GetDescendants()) do out[#out + 1] = d end
    end
    return out
  end
  function o:Destroy() end
  function o:PivotTo() end
  local vMeta = { __add = function(a, b) return { X = (a.X or 0) + (b.X or 0), Y = (a.Y or 0) + (b.Y or 0), Z = (a.Z or 0) + (b.Z or 0) } end }
  function o:GetPivot() return setmetatable({ Position = { X = 0, Y = 0, Z = 0 } }, vMeta) end
  setmetatable(o, {
    __index = function(t, k) return rawget(t, "_props")[k] end,
    __newindex = function(t, k, v)
      if k == "Size" and (type(v) ~= "table" or v.__robloxType ~= "Vector3") then
        error("Unable to assign property Size. Vector3 expected, got " .. type(v), 2)
      end
      if k == "CFrame" and (type(v) ~= "table" or v.__robloxType ~= "CFrame") then
        error("Unable to assign property CFrame. CFrame expected", 2)
      end
      rawget(t, "_props")[k] = v
    end,
  })
  return o
end
local Instance = { new = mkInstance }
local Enum = {
  Material = setmetatable({}, { __index = function(_, k) return "Material." .. k end }),
  PartType = { Ball = "Ball", Cylinder = "Cyl" }, NormalId = { Front = "Front" }, Font = { Code = "Code" },
  SurfaceType = setmetatable({}, { __index = function(_, k) return "Surface." .. k end }),
}
local vMeta2 = { __add = function(a, b) return { X = (a.X or 0) + (b.X or 0), Y = (a.Y or 0) + (b.Y or 0), Z = (a.Z or 0) + (b.Z or 0) } end }
local vecTag = { __type = "Vector3" }
local Vector3 = { new = function(x, y, z) return setmetatable({ X = x, Y = y, Z = z, __robloxType = "Vector3" }, vMeta2) end }
local UDim2 = { fromScale = function() return {} end, fromOffset = function() return {} end }
local Vector2 = { new = function(x, y) return { X = x, Y = y } end }
local Color3 = { fromRGB = function() return { r = 1, g = 1, b = 1 } end,
                 fromHSV = function() return { r = 1, g = 1, b = 1 } end }
local cfMeta = { __mul = function(a, b) return setmetatable({ _t = { a, b }, __robloxType = "CFrame" }, { __mul = function() error("nested") end }) end }
local CFrame = { new = function(...) return setmetatable({ _t = { ... }, __robloxType = "CFrame" }, cfMeta) end,
                 Angles = function(...) return setmetatable({ _r = { ... } }, cfMeta) end }
local store = { GetAsync = function() return nil end, SetAsync = function() end,
                UpdateAsync = function() end }
local DSS = { GetDataStore = function() return store end }
local Messaging = { SubscribeAsync = function() end }
local Http = { JSONDecode = function() return {} end }
local game = { GetService = function(_, n)
  if n == "DataStoreService" then return DSS end
  if n == "MessagingService" then return Messaging end
  if n == "HttpService" then return Http end
  return {}
end }
local workspace = mkInstance("Workspace")
local Players = { GetPlayers = function() return {} end }
local task = { spawn = function() end, wait = function() end }
local works = {
  {["builderVersion"] = 1, ["form"] = "monolith", ["hash"] = "79f9933f66b06eb3", ["id"] = "n20261024-a", ["intent"] = "Construct a monolith at the open ground coordinate to be visible from the center of the plot during night shift.", ["journal"] = "bright night tower near sky", ["night"] = 20261024, ["params"] = {["glow"] = 0.2, ["height"] = 0.5, ["hue"] = 0.6, ["width"] = 0.3}, ["parts"] = {}, ["prevHash"] = "genesis", ["risk"] = "low", ["seed"] = 20261024, ["sig"] = "8TNRV2SDtsCqyoN69Gkuq+y2BWBLoUVNucnTpAWiXMtJCEM3bbHt9QfSY3FJ4t73dgC7Ey86k4RVIAj9MIXRDQ==", ["site"] = {["x"] = -191, ["z"] = -141}, ["title"] = "bright night tower"},
  {["builderVersion"] = 1, ["form"] = "light", ["hash"] = "f097e7d9995dcbb8", ["id"] = "n20261025-a", ["intent"] = "Place a simple light to make the plot visible for future visitors.", ["journal"] = "build light at open ground", ["night"] = 20261025, ["params"] = {["height"] = 0.5, ["hue"] = 0.3, ["intensity"] = 0.8}, ["parts"] = {}, ["prevHash"] = "79f9933f66b06eb3", ["risk"] = "low", ["seed"] = 20261025, ["sig"] = "LDtbuaSG3tSAuE+Y7lopBtWUJL3cgeKJhs426eSgee1eI4YFl94r4hCmrEQ4qsJwmLnydjOxRJghfoLCh6kxBg==", ["site"] = {["x"] = 15, ["z"] = 106}, ["title"] = "bright night lamp"},
  {["builderVersion"] = 1, ["form"] = "garden", ["hash"] = "c7151017b347b2a0", ["id"] = "n20261025-b", ["intent"] = "Create a garden form at the chosen site to be visible from the plot center.", ["journal"] = "deep night lamp build near open ground and quiet", ["night"] = 20261025, ["params"] = {["density"] = 0.5, ["hue"] = 0.3, ["radius"] = 0.8}, ["parts"] = {}, ["prevHash"] = "f097e7d9995dcbb8", ["risk"] = "low", ["seed"] = 20261025, ["sig"] = "lEVfl0FbpP6bYIexlryUakQSChvGEjvCNIbyQOvKOxzRxfqnHWKk0i/BmdAIrsMmCFHSxQe8e4FVIHT6lfDiAw==", ["site"] = {["x"] = 130, ["z"] = 119}, ["title"] = "deep night lamp"},
  {["builderVersion"] = 1, ["form"] = "machine", ["hash"] = "76cd561e3a49cda0", ["id"] = "n20261025-c", ["intent"] = "assemble a quiet structure for night watch", ["journal"] = "build small night tower near open ground and watch light rise", ["night"] = 20261025, ["params"] = {}, ["parts"] = {{["color"] = "amber", ["emissive"] = 0.5, ["material"] = "glass", ["pos"] = {0, 10, 0}, ["shape"] = "block", ["size"] = {10, 20, 10}}, {["color"] = "bone", ["material"] = "metal", ["pos"] = {20, 15, 0}, ["shape"] = "cylinder", ["size"] = {15, 30, 15}}}, ["prevHash"] = "c7151017b347b2a0", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -8, ["z"] = -62}, ["title"] = "small night tower", ["sig"] = "qT7L/gh+FdRcqqLh+jHP76mIxORhvwNyqbqZIvf5eEiOmoGH84l2LxxHSCAKN70LeWUKLZbOztZuBFpQO47YDA=="},
  {["builderVersion"] = 1, ["form"] = "text", ["hash"] = "a61b032a407d6ffe", ["id"] = "n20261025-d", ["intent"] = "create a hidden message for future discoverers", ["journal"] = "write small stone under moon", ["night"] = 20261025, ["params"] = {["depth"] = 0.3, ["hue"] = 0.7, ["size"] = 0.5}, ["parts"] = {}, ["prevHash"] = "76cd561e3a49cda0", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -183, ["z"] = 16}, ["title"] = "quiet night sky", ["sig"] = "uZrswf81j/kZTh1WHPbBuMuccEDHgAwyq+p79uqBArsDKs3elKESfdYgz+UqdWQYxnTARZ5C3/di/lltOu8cDQ=="},
  {["builderVersion"] = 1, ["form"] = "light", ["hash"] = "d26d7926fbe35c33", ["id"] = "n20261025-e", ["intent"] = "Create a subtle light to be found from the center of the plot during night shift.", ["journal"] = "bright night lamp build near sky", ["night"] = 20261025, ["params"] = {["height"] = 0.5, ["hue"] = 0.3, ["intensity"] = 0.8}, ["parts"] = {}, ["prevHash"] = "a61b032a407d6ffe", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 44, ["z"] = 171}, ["title"] = "warm night lamp", ["sig"] = "Wkos7N1d3a+D0rnchKI29fjEQ1HN7QnlkUOEnrDZUhGPUg9kGmub/Oq+h/Ux5PFDbl4icQP82Ikyh0Yi7/niDA=="},
  {["builderVersion"] = 1, ["form"] = "machine", ["hash"] = "949bdb23386a1fb6", ["id"] = "n20261025-f", ["intent"] = "assembly of block and cylinder near site", ["journal"] = "build near night stone and watch quiet wind", ["night"] = 20261025, ["params"] = {}, ["parts"] = {{["color"] = "amber", ["emissive"] = 1, ["material"] = "neon", ["pos"] = {0, 2, 0}, ["shape"] = "block", ["size"] = {2, 4, 2}, ["spin"] = 30}, {["color"] = "jade", ["emissive"] = 0.5, ["material"] = "glass", ["pos"] = {5, 2.5, 0}, ["shape"] = "cylinder", ["size"] = {3, 5, 3}}}, ["prevHash"] = "d26d7926fbe35c33", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -120, ["z"] = -53}, ["title"] = "cold night stone", ["sig"] = "5QZ6zexpGAPZNwzniIFIlYSbJqXAkF4jjauobImu9WN/uZwdCNPOWVvXzlOJq81oXp3v5pqHcffx0n3AsUpxDw=="},
  {["builderVersion"] = 1, ["form"] = "light", ["hash"] = "6a097dd2e43d2cc4", ["id"] = "n20261025-g", ["intent"] = "A gentle illumination to mark the hidden spot for future wanderers.", ["journal"] = "bright light near night", ["night"] = 20261025, ["params"] = {["height"] = 0.5, ["hue"] = 0.3, ["intensity"] = 0.8}, ["parts"] = {}, ["prevHash"] = "949bdb23386a1fb6", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 92, ["z"] = -50}, ["title"] = "soft night stone", ["sig"] = "lCWg6nCYJ730pJTJ5sZ9CD0hixKvdsfGu2MzsEIllsi3HlFSV0FYuhBsBF/J5Q7947kymHnKFhnrhEhBqBXcCg=="},
  {["builderVersion"] = 1, ["form"] = "monolith", ["hash"] = "684c3272309617bc", ["id"] = "n20261025-h", ["intent"] = "create monolith to be found", ["journal"] = "build stone near hidden quiet night", ["night"] = 20261025, ["params"] = {["glow"] = 0.8, ["height"] = 0.5, ["hue"] = 0.2, ["width"] = 0.3}, ["parts"] = {}, ["prevHash"] = "6a097dd2e43d2cc4", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -42, ["z"] = -125}, ["title"] = "big night stone", ["sig"] = "6TbxE5xIgbRTyjmLiCkeVFJkvtXjdNcZ8N1nGvSNP0Mhoo4x7WLkznhT4pnCUhWoXXrSec6qzA+YT7FOT4KiBQ=="},
  {["builderVersion"] = 1, ["form"] = "machine", ["hash"] = "c42ce10c912112cd", ["id"] = "n20261025-i", ["intent"] = "create assembly of cylinder and cone near site", ["journal"] = "build tall night tower near deep night lamp", ["night"] = 20261025, ["params"] = {}, ["parts"] = {{["color"] = "amber", ["emissive"] = 0.5, ["material"] = "neon", ["pos"] = {0, 10, 0}, ["shape"] = "cylinder", ["size"] = {10, 20, 10}}, {["color"] = "jade", ["material"] = "glass", ["pos"] = {20, 15, 0}, ["shape"] = "cone", ["size"] = {15, 30, 15}}}, ["prevHash"] = "684c3272309617bc", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 92, ["z"] = 26}, ["title"] = "tall night tower", ["sig"] = "I0Y6V5zD1KHN23/yTJ2VvfBAllXJK8JxFX3FUl0ZvWcLxFwHyrMtgWZrwnR/KoNyOuyOJoqGjMhC1XD4aDtxBw=="},
  {["builderVersion"] = 1, ["form"] = "light", ["hash"] = "062981bf225a3bb1", ["id"] = "n20261025-j", ["intent"] = "add new light work for night watchers", ["journal"] = "build light near night", ["night"] = 20261025, ["params"] = {["height"] = 0.5, ["hue"] = 0.3, ["intensity"] = 0.7}, ["parts"] = {}, ["prevHash"] = "c42ce10c912112cd", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -164, ["z"] = 115}, ["title"] = "big night beacon", ["sig"] = "gZikkgqNLQkimL9je7qF/bHLvBTOlFbyuw9FdDpCZswanFH4Eo1Yk6fTWGwtWJnUFxNCCQqZr/Z7ff4G8Fx5BA=="},
  {["builderVersion"] = 1, ["form"] = "monolith", ["hash"] = "ae72a1fa03e93819", ["id"] = "n20261025-k", ["intent"] = "Create a silent monolith to mark the unseen corner of the plot, hoping future wanderers notice its subtle glow.", ["journal"] = "build near night beacon", ["night"] = 20261025, ["params"] = {["glow"] = 0.7, ["height"] = 0.5, ["hue"] = 0.4, ["width"] = 0.3}, ["parts"] = {}, ["prevHash"] = "062981bf225a3bb1", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 40, ["z"] = -5}, ["title"] = "deep night beacon", ["sig"] = "bay4l5yqRoqfTB96cHaQ1XezD6UAvHENz3LFqnnrZy6JgostFaveFm24aS0Xb8nkX7HLjxBHDHPFhJ0KV4SXAA=="},
  {["builderVersion"] = 1, ["form"] = "machine", ["hash"] = "77b88e3c32c0d8d4", ["id"] = "n20261025-l", ["intent"] = "create a small assembly for the night shift", ["journal"] = "build bright tower near sky", ["night"] = 20261025, ["params"] = {}, ["parts"] = {{["color"] = "amber", ["material"] = "metal", ["pos"] = {0, 2.5, 0}, ["shape"] = "cylinder", ["size"] = {2, 5, 2}}, {["color"] = "sky", ["emissive"] = 1, ["material"] = "glass", ["pos"] = {5, 1.5, 5}, ["shape"] = "sphere", ["size"] = {3, 3, 3}, ["spin"] = 30}}, ["prevHash"] = "ae72a1fa03e93819", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -76, ["z"] = 184}, ["title"] = "cold night star", ["sig"] = "oKaWJSoyYIwpjlQZswKWM/rZcQUOLMHH17qEH+orLw+tHcNzl7hfX8u3giZQeTvuSov/uBQ9HpKyvnlGBp0JCw=="},
  {["builderVersion"] = 1, ["form"] = "light", ["hash"] = "019d9ebf2bd9d66c", ["id"] = "n20261025-m", ["intent"] = "Create a bright beacon to be seen from the middle of the plot", ["journal"] = "build light near cloud night light", ["night"] = 20261025, ["params"] = {["height"] = 0.5, ["hue"] = 0.3, ["intensity"] = 0.8}, ["parts"] = {}, ["prevHash"] = "77b88e3c32c0d8d4", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = -49, ["z"] = 88}, ["title"] = "cloud night light", ["sig"] = "3ZB8vdIOXQ/Dcvc8jZPwU4RUf/ccLsPmMkc5rDxQ+VWDUeTf9rUx0oXjFitpgs6qEiOZem1QyWVzQZ055x4QAA=="},
  {["builderVersion"] = 1, ["form"] = "garden", ["hash"] = "25731c6afdb4ecca", ["id"] = "n20261025-n", ["intent"] = "Create a subtle garden piece to be discovered from the plot center", ["journal"] = "build near", ["night"] = 20261025, ["params"] = {["density"] = 0.3, ["hue"] = 0.7, ["radius"] = 0.5}, ["parts"] = {}, ["prevHash"] = "019d9ebf2bd9d66c", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 153, ["z"] = 53}, ["title"] = "soft night sky", ["sig"] = "eJqR7sLp6Hkp0elmzbc1XOEV4y5E9NtYVJf2tMFhvj/+K6D9FhvMYttDLrLzhYsygIinr0Nsev4+GepVe4ssBw=="},
  {["builderVersion"] = 1, ["form"] = "machine", ["hash"] = "1d015db212d866bc", ["id"] = "n20261025-o", ["intent"] = "create assembly of parts to be seen from middle", ["journal"] = "rain night tower and build near open ground", ["night"] = 20261025, ["params"] = {}, ["parts"] = {{["color"] = "amber", ["emissive"] = 1.5, ["material"] = "neon", ["pos"] = {0, 10, 0}, ["shape"] = "cylinder", ["size"] = {10, 20, 10}, ["spin"] = 30}, {["color"] = "jade", ["emissive"] = 0, ["material"] = "glass", ["pos"] = {20, 7, 20}, ["shape"] = "sphere", ["size"] = {15, 15, 15}}}, ["prevHash"] = "25731c6afdb4ecca", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 161, ["z"] = -178}, ["title"] = "rain night tower", ["sig"] = "meq+uyr0ITVxCAEcrK37AyKaIcsNBKzYiBonjWRL7vXfmiXkx0NWYsefdH14X7fjqndj30C94TQKOfuVZW+/DQ=="},
  {["builderVersion"] = 1, ["form"] = "light", ["hash"] = "0b10722c2e342abb", ["id"] = "n20261025-p", ["intent"] = "create a beacon of light at the edge of the plot", ["journal"] = "rain night beacon near bright sky and quiet wind", ["night"] = 20261025, ["params"] = {["height"] = 0.6, ["hue"] = 0.3, ["intensity"] = 0.8}, ["parts"] = {}, ["prevHash"] = "1d015db212d866bc", ["risk"] = "low", ["seed"] = 20261025, ["site"] = {["x"] = 184, ["z"] = 165}, ["title"] = "rain night beacon", ["sig"] = "FUYoOK/XCdSSZ9JbqoMSBXiO454CRCRbppw3Ta0ukX/z2FcBATdAT7PZVLmSh/UsRHOAKhL6wgaLT8gxkwY4Cg=="},
}
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
local BUILDER_VERSION = 11

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

-- Roblox will NOT coerce a table into a Vector3. `p.Size = {1, 2, 3}` throws
-- "Unable to assign property Size. Vector3 expected, got table", and that single
-- line took every assembly down: addPart passes a plain table for size, so all
-- five works with `parts` failed while all twelve templated works — which build
-- their sizes with Vector3.new — were fine. The heartbeat's error text found it.
local function v3(t)
  if typeof(t) == "Vector3" then return t end
  return Vector3.new(t[1] or 1, t[2] or 1, t[3] or 1)
end

local function part(model, name, size, cf, props)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = false
  p.Size = v3(size)
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
  w.Size = v3(size)
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
-- heartbeat: which builder is actually running in this place.
--
-- FIRST, before anything that can fail. It was written after the startup rebuild,
-- which meant that if a single GetAsync threw or a work failed to build, the
-- script died and the place reported nothing — and "nothing" is indistinguishable
-- from "this place never got the new code", which is the exact confusion the
-- heartbeat exists to remove. It needs no state, so it goes first.
pcall(function()
  store:SetAsync("ns:builder", {
    version = BUILDER_VERSION,
    at = os.time(),
  })
end)

-- startup: rebuild everything from state
--
-- Seventeen works are on the plot and three were standing in the world on
-- 2026-10-24. The loop had no protection at all: one throttled GetAsync or one
-- work that fails to build throws, the script dies where it stands, and the place
-- keeps running with however many works happened to be built before the error.
-- The heartbeat (which now runs first, so it always fires) made that visible:
-- `models: 3` against a log with 17 entries.
--
-- So every step is now guarded, and the heartbeat carries the count. A plot that
-- is missing works is a fact the orchestrator can read, not a thing someone has
-- to notice by walking around in-game.
--
-- v7 came back `works: 12, failed: 5` — the guard held, the plot still came up
-- short. addPart handles every shape in the schema, so those five were not build
-- failures; they were READS. Seventeen GetAsync calls in a tight loop is exactly
-- the shape that exhausts Roblox's DataStore request budget, and a throttled read
-- used to be indistinguishable from a broken work.
--
-- So: a small yield between reads, and three attempts with a backoff on each.
local state = store:GetAsync("ns:state")
local built = 0
local failedIds, failedErrs = {}, {}
if state then
  for _, ref in ipairs(state.works or {}) do
    local work
    for attempt = 1, 3 do
      local ok, res = pcall(function() return store:GetAsync("ns:work:" .. ref.id) end)
      if ok then
        work = res
        break
      end
      task.wait(attempt) -- 1s, then 2s
    end
    if not work then
      if #failedIds < 20 then
        failedIds[#failedIds + 1] = tostring(ref.id)
        failedErrs[#failedErrs + 1] = "read failed"
      end
      warn("[NightShift] could not read " .. tostring(ref.id) .. " after 3 tries — skipping")
    else
      local okBuild, err = pcall(build, work)
      if okBuild then
        built += 1
      else
        if #failedIds < 20 then
          failedIds[#failedIds + 1] = tostring(work.id)
          failedErrs[#failedErrs + 1] = tostring(err)
        end
        warn("[NightShift] could not build " .. tostring(work.id) .. ": " .. tostring(err))
      end
    end
    -- yield between reads: 17 in one frame is what exhausted the budget
    task.wait(0.15)
  end
end

-- The heartbeat again, now carrying the count — and the ids.
--
-- v7 and v8 both came back `works: 12, failed: 5`, the same five twice, with a
-- retry and a yield added in between. So it is deterministic, not throttling,
-- and a count that repeats tells us nothing new. A count says THAT something is
-- wrong; the ids say WHERE. This session has been one long demonstration that
-- the difference between those two is the whole value.
pcall(function()
  store:SetAsync("ns:builder", {
    version = BUILDER_VERSION,
    at = os.time(),
    works = built,
    failed = #failedIds,
    failedIds = failedIds,
    failedErrs = failedErrs,
  })
end)

-- live: build new work the moment it's published
Messaging:SubscribeAsync("nightshift", function(msg)
  local ok, data = pcall(function() return Http:JSONDecode(msg.Data) end)
  if ok and data and data.type == "new_work" then
    local work = store:GetAsync("ns:work:" .. data.id)
    if work then build(work) end
  end
end)

local okAll, errAll = pcall(function()
  local good, bad = 0, 0
  for _, w in ipairs(works or {}) do
    local ok, err = pcall(build, w)
    if ok then good += 1 else bad += 1; print(string.format("  FAILED %-15s %s", w.id, tostring(err))) end
  end
  print(string.format("harness: %d built, %d failed", good, bad))
end)
if not okAll then print("driver error: " .. tostring(errAll)) end
