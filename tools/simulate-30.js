// Simulates 30 consecutive nights into site ONLY (site/sim.jsonl +
// site/sim-preview/<id>.svg). Does NOT touch the real DataStore chain or the
// real site/log.jsonl, so the nightly cron keeps chaining off the true head.
// The sim is a what-if preview: see it at timeline.html?src=sim.jsonl
// (ceiling: a better version would seed the sim with the real latest hash so
//  the two timelines share one head; revisit if we ever want them merged).
const { renderPreview } = require("../orchestrator/dist/preview.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "site");
const FORMS = ["monolith", "garden", "machine", "text", "light", "void"];
const FIRST_NIGHT = 100000 + 20261023 - 100000; // = 20261023
const NIGHTS = 30;

// Deterministic RNG so reruns are identical.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261023);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const TITLES = {
  monolith: ["bright stone tower", "black pillar", "obsidian column", "grey spire"],
  garden: ["flower grove", "moss circle", "bamboo ring", "wild patch"],
  machine: ["rusty engine", "copper gears", "iron clockwork", "brass turbine"],
  text: ["crude sign", "faded word", "burnt letters", "scratched glyph"],
  light: ["lantern post", "glowing rod", "beacon spike", "ember staff"],
  void: ["empty plot", "bare square", "quiet corner", "silent field"],
};
const JOURNALS = [
  "near=90 dwell=412 players=3",
  "near=215 dwell=1104 players=1",
  "near=48 dwell=133 players=0",
  "near=340 dwell=2670 players=2",
  "near=12 dwell=25 players=0",
  "near=177 dwell=903 players=2",
];

// Start the sim chain from the REAL latest work's hash so forms/sites chain
// plausibly; but we deliberately put the sim in its own file so the real
// log.jsonl head is never touched.
const realLog = path.join(SITE, "log.jsonl");
const realEntries = fs.readFileSync(realLog, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
let prev = realEntries[realEntries.length - 1].hash;

// Site allocation: scatter on a 512x512 grid, avoid origin (0,0) and (100,80).
const taken = new Set(realEntries.map((e) => `${e.site.x},${e.site.z}`));
function freeSite() {
  for (let k = 0; k < 2000; k++) {
    const x = Math.round((rnd() * 2 - 1) * 220);
    const z = Math.round((rnd() * 2 - 1) * 220);
    const key = `${x},${z}`;
    if (!taken.has(key)) { taken.add(key); return { x, z }; }
  }
  return { x: 0, z: 0 };
}

function sha256hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

const sim = [];
for (let i = 0; i < NIGHTS; i++) {
  const night = FIRST_NIGHT + i;
  const form = FORMS[i % FORMS.length]; // guarantee every form shows up
  const site = freeSite();
  const title = pick(TITLES[form]);
  const journal = pick(JOURNALS);
  const params = { height: Math.round(rnd() * 10) / 10, width: Math.round(rnd() * 10) / 10, hue: Math.round(rnd() * 80) / 100 };
  const payload = JSON.stringify([night, title, form, site.x, site.z, journal, prev]);
  const hash = sha256hex(payload).slice(0, 16);
  const work = {
    id: `n${night}-a`, night, title, form, site,
    params, seed: i + 1, journal, prevHash: prev, hash, builderVersion: 1,
  };
  sim.push(work);
  prev = hash;
}

// write sim.jsonl
fs.writeFileSync(path.join(SITE, "sim.jsonl"), sim.map((w) => JSON.stringify(w)).join("\n") + "\n");

// write 30 previews under sim-preview/
const pdir = path.join(SITE, "sim-preview");
fs.mkdirSync(pdir, { recursive: true });
sim.forEach((w) => fs.writeFileSync(path.join(pdir, `${w.id}.svg`), renderPreview(w)));

console.log(`wrote ${sim.length} sim nights to site/sim.jsonl + ${sim.length} previews`);
console.log("head chain:", sim[sim.length - 1].hash);
console.log("forms used:", [...new Set(sim.map((w) => w.form))].join(", "));
const sample = sim.slice(0, 5).map((w) => `${w.id} ${w.form} (${w.site.x},${w.site.z})`);
console.log("first 5:"); sample.forEach((s) => console.log("  ", s));
