#!/usr/bin/env python3
"""
Install the Night Shift Luau scripts into a running Roblox Studio place.

Speaks MCP over stdio to the StudioMCP server that ships inside Roblox Studio
(no third-party bridge, no Rojo needed). Idempotent: safe to run every time.

Usage:
    python3 tools/install-studio.py                     # find the place by placeId
    python3 tools/install-studio.py --place-id 137052081975336
    python3 tools/install-studio.py --name "Night shift"
    python3 tools/install-studio.py --check             # verify only, write nothing
    python3 tools/install-studio.py --dry-run           # print the plan, write nothing

Requirements:
    - Roblox Studio is OPEN with the place loaded
    - Studio -> Assistant -> ... -> Manage MCP Servers -> "Enable Studio as MCP server"
    - the place is NOT in Play mode (the installer stops play itself)
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time

STUDIO_MCP = "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(REPO, "src")

# script file -> name it gets inside ServerScriptService
SCRIPTS = {
    "builder.lua": "NightShiftBuilder",
    "telemetry.lua": "NightShiftTelemetry",
    "journal.lua": "NightShiftJournal",
}

PLOT_NAME = "NightShiftPlot"
PLOT_SIZE = 512


# --------------------------------------------------------------------------- #
# MCP client
# --------------------------------------------------------------------------- #
class Studio:
    """Minimal MCP stdio client."""

    def __init__(self, binary: str = STUDIO_MCP):
        self.proc = subprocess.Popen(
            [binary],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._id = 0
        self.call(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "night-shift-installer", "version": "1.0"},
            },
        )
        self.notify("notifications/initialized", {})

    def _send(self, obj: dict) -> None:
        self.proc.stdin.write(json.dumps(obj) + "\n")
        self.proc.stdin.flush()

    def notify(self, method: str, params: dict) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params})

    def call(self, method: str, params: dict, timeout: int = 60):
        self._id += 1
        mid = self._id
        self._send({"jsonrpc": "2.0", "id": mid, "method": method, "params": params})
        deadline = time.time() + timeout
        while time.time() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("StudioMCP closed the connection")
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(msg["error"].get("message", str(msg["error"])))
                return msg.get("result")
        raise TimeoutError(f"{method} timed out after {timeout}s")

    def tool(self, name: str, args: dict, timeout: int = 120):
        return self.call("tools/call", {"name": name, "arguments": args}, timeout=timeout)

    def close(self) -> None:
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass


def tool_text(result) -> str:
    """Pull the text payload out of an MCP tool result."""
    if isinstance(result, dict):
        parts = [c.get("text", "") for c in result.get("content", []) if c.get("type") == "text"]
        if parts:
            return "\n".join(parts)
    return json.dumps(result)


def run_luau(studio: Studio, studio_id: str, code: str, datamodel: str = "Edit") -> str:
    res = studio.tool(
        "execute_luau",
        {"studio_id": studio_id, "datamodel_type": datamodel, "code": code},
    )
    return tool_text(res)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def find_studio(studio: Studio, place_id: str | None, name: str | None) -> dict:
    res = studio.tool("list_roblox_studios", {})
    data = json.loads(tool_text(res))
    studios = data.get("studios", [])
    if not studios:
        raise SystemExit("No Studio instance connected. Is Roblox Studio open with a place loaded?")

    for s in studios:
        sname = s.get("name", "")
        if place_id and place_id in sname:
            return s
        if name and name.lower() in sname.lower():
            return s
    if len(studios) == 1:
        return studios[0]
    listing = "\n".join(f"  - {s.get('name')}  ({s.get('id')})" for s in studios)
    raise SystemExit(f"Could not pick a Studio instance. Open ones:\n{listing}")


def ensure_edit_mode(studio: Studio, studio_id: str) -> None:
    """Edit mode is required to write script Source. Stop play if needed."""
    res = studio.tool("get_studio_state", {"studio_id": studio_id})
    text = tool_text(res)
    if "Edit" in text and "Client" in text:
        # in play mode both datamodels are present; try Edit and see
        pass
    probe = run_luau(studio, studio_id, "return 'edit-ok'", "Edit")
    if "edit-ok" in probe:
        return
    # not in Edit -> stop play and retry
    studio.tool("start_stop_play", {"studio_id": studio_id, "is_start": False})
    time.sleep(1.5)
    probe = run_luau(studio, studio_id, "return 'edit-ok'", "Edit")
    if "edit-ok" not in probe:
        raise SystemExit("Could not get into Edit mode. Stop Play mode in Studio and retry.")


def luau_set_source(script_name: str, source: str) -> str:
    """Set a Script's Source.

    The source travels as a Lua long-bracket string literal, which cannot be
    terminated by the source itself as long as the source contains no `]==]`.
    Roblox has no base64 decoder on HttpService (only Base64Encode), so this is
    the safe way to ship arbitrary Lua.
    """
    if "]==]" in source:
        # fall back to a delimiter that cannot occur
        for delim in ("[==[", "[====["):
            close = delim[0] + "]" * (len(delim) - 1) + "]"
            if close not in source:
                return (
                    f"local s = {delim}{source}{close}\n"
                    f"local o = game:GetService('ServerScriptService'):FindFirstChild('{script_name}')\n"
                    f"if not o then o = Instance.new('Script'); o.Name = '{script_name}';"
                    f" o.Parent = game:GetService('ServerScriptService') end\n"
                    f"o.Source = s\nreturn o.Name .. ' len=' .. #o.Source"
                )
        raise SystemExit("source contains every safe long-bracket delimiter")
    return (
        f"local s = [==[{source}]==]\n"
        f"local o = game:GetService('ServerScriptService'):FindFirstChild('{script_name}')\n"
        f"if not o then o = Instance.new('Script'); o.Name = '{script_name}';"
        f" o.Parent = game:GetService('ServerScriptService') end\n"
        f"o.Source = s\nreturn o.Name .. ' len=' .. #o.Source"
    )


def luau_ensure_plot() -> str:
    return f"""
local root = workspace:FindFirstChild("NightShift")
if not root then
    root = Instance.new("Folder")
    root.Name = "NightShift"
    root.Parent = workspace
end
local plot = root:FindFirstChild("{PLOT_NAME}")
if not plot then
    plot = Instance.new("Part")
    plot.Name = "{PLOT_NAME}"
    plot.Anchored = true
    plot.Size = Vector3.new({PLOT_SIZE}, 0.5, {PLOT_SIZE})
    plot.CFrame = CFrame.new(0, 0.1, 0)
    plot.Material = Enum.Material.Neon
    plot.Color = Color3.fromHSV(0.6, 0.4, 0.3)
    plot.Transparency = 0.85
    plot.CanCollide = false
    plot.Parent = root
    return "plot created"
end
return "plot exists"
"""


def luau_verify() -> str:
    return """
local out = {}
local sss = game:GetService("ServerScriptService")
for _, c in ipairs(sss:GetChildren()) do
    if c:IsA("Script") then
        table.insert(out, c.Name .. "=" .. #c.Source)
    end
end
local root = workspace:FindFirstChild("NightShift")
if root then
    for _, c in ipairs(root:GetChildren()) do
        table.insert(out, "ws:" .. c.Name .. "=" .. c.ClassName)
    end
end
return table.concat(out, ", ")
"""


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--place-id", default="137052081975336", help="match a placeId in the Studio window title")
    ap.add_argument("--name", default=None, help="match a Studio window name")
    ap.add_argument("--check", action="store_true", help="verify only, write nothing")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    ap.add_argument("--no-plot", action="store_true", help="skip creating the 512x512 plot part")
    args = ap.parse_args()

    # read the sources first so we fail before touching Studio
    payloads: dict[str, str] = {}
    for fname, sname in SCRIPTS.items():
        path = os.path.join(SRC_DIR, fname)
        if not os.path.exists(path):
            print(f"MISSING {path}", file=sys.stderr)
            return 2
        payloads[sname] = open(path, "r", encoding="utf-8").read()

    print("plan:")
    for fname, sname in SCRIPTS.items():
        size = os.path.getsize(os.path.join(SRC_DIR, fname))
        print(f"  ServerScriptService.{sname:22} <- src/{fname} ({size} bytes)")
    if not args.no_plot:
        print(f"  Workspace.NightShift.{PLOT_NAME:22} <- {PLOT_SIZE}x{PLOT_SIZE} plot")

    if args.dry_run:
        print("\ndry run, nothing written")
        return 0

    studio = Studio()
    try:
        s = find_studio(studio, args.place_id, args.name)
        studio_id = s["id"]
        print(f"\nstudio: {s.get('name')}  ({studio_id})")

        ensure_edit_mode(studio, studio_id)

        if args.check:
            print("check:")
            print("  " + run_luau(studio, studio_id, luau_verify(), "Edit"))
            return 0

        for fname, sname in SCRIPTS.items():
            out = run_luau(studio, studio_id, luau_set_source(sname, payloads[sname]), "Edit")
            print(f"  wrote {sname}: {out.strip()}")

        if not args.no_plot:
            out = run_luau(studio, studio_id, luau_ensure_plot(), "Edit")
            print(f"  plot: {out.strip()}")

        print("\nverify:")
        print("  " + run_luau(studio, studio_id, luau_verify(), "Edit"))
        print("\ndone. Press Play in Studio, or run: node orchestrator/dist/index.js")
    finally:
        studio.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
