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
