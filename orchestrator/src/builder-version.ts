// The one number that can travel between the repo and the running place.
//
// The place cannot know what the repo contains, and the repo cannot read the
// place. What they can share is a constant: `BUILDER_VERSION` at the top of
// src/builder.lua, bumped by hand in the same commit as any change to that file.
// The place reports it in ns:builder on every server start; this reads the repo's
// copy so the two can be compared.
//
// It cannot repair a stale place — only `tools/install-studio.py` can — but it
// turns "the site and the game might disagree" into a line in status.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The BUILDER_VERSION constant in src/builder.lua, or null when unreadable. */
export function repoBuilderVersion(): number | null {
  try {
    const p = join(__dirname, "..", "..", "src", "builder.lua");
    const m = readFileSync(p, "utf8").match(/^local BUILDER_VERSION\s*=\s*(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

export type BuilderReport = {
  version: number;
  works: number;
  /** Unix seconds, as the Roblox server saw it. */
  at: number;
};

export type BuilderVerdict = {
  repo: number | null;
  place: BuilderReport | null;
  state: "in-sync" | "stale" | "ahead" | "never-reported" | "unknown";
  detail: string;
};

/**
 * Compare what the repo says with what the place last reported.
 *
 * `never-reported` is a WARN, not a failure: a brand new place, or one nobody has
 * played since the heartbeat was added, has nothing to report — and turning that
 * into a red pipeline would punish the very state this check exists to fix.
 */
export function compareBuilder(repo: number | null, place: BuilderReport | null): BuilderVerdict {
  if (repo === null) {
    return { repo, place, state: "unknown", detail: "src/builder.lua has no BUILDER_VERSION line" };
  }
  if (!place || typeof place.version !== "number") {
    return {
      repo,
      place: null,
      state: "never-reported",
      detail: `the place has never reported a builder version (repo has v${repo}) — open the place once, or the heartbeat is not installed`,
    };
  }
  if (place.version === repo) {
    return { repo, place, state: "in-sync", detail: `place is running v${repo}` };
  }
  if (place.version < repo) {
    return {
      repo,
      place,
      state: "stale",
      detail: `the place is running v${place.version}, the repo has v${repo} — run tools/install-studio.py`,
    };
  }
  return {
    repo,
    place,
    state: "ahead",
    detail: `the place is running v${place.version}, ahead of the repo's v${repo} — someone edited the place directly`,
  };
}
