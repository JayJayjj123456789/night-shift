#!/usr/bin/env node
/**
 * Refuse a NIGHT that is not a real YYYYMMDD before anything is written.
 *
 * Why this is a file and not three lines inside the workflow:
 *
 *   The first version was `node -e '...'` inside a `run:` block. actionlint runs
 *   shellcheck over every run block, and shellcheck's SC2016 fires on `${n}`
 *   inside single quotes — an *info* diagnostic, but actionlint exits non-zero on
 *   any finding, so the Lint step failed and the whole night was skipped. It also
 *   could not be tested: a shell snippet in YAML is only exercised by a real
 *   dispatch.
 *
 *   As a file it is lintable, testable with node --test, and the workflow step is
 *   one line that cannot drift from what the tests cover.
 *
 * Usage: node tools/validate-night.js 20261024
 * Exit:  0 valid, 1 invalid, 2 no argument
 */

/**
 * @param {string} raw
 * @returns {{ok: true, night: number} | {ok: false, reason: string}}
 */
function validateNight(raw) {
  if (!/^\d{8}$/.test(raw)) {
    return { ok: false, reason: `NIGHT='${raw}' is not YYYYMMDD` };
  }
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const iso = `${y}-${m}-${d}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // new Date("2026-10-32") does NOT throw — it rolls over to 2026-11-01. The
  // round-trip is what makes 20261032 invalid; isNaN alone would pass it.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    return { ok: false, reason: `NIGHT=${raw} is not a real date` };
  }
  return { ok: true, night: Number(raw) };
}

module.exports = { validateNight };

if (require.main === module) {
  const raw = process.argv[2];
  if (!raw) {
    console.error("::error::usage: node tools/validate-night.js YYYYMMDD");
    process.exit(2);
  }
  const r = validateNight(raw);
  if (!r.ok) {
    console.error(`::error::${r.reason}`);
    process.exit(1);
  }
  console.log(`NIGHT=${r.night} is valid`);
}
