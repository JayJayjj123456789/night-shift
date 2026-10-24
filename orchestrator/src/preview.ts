// Renders a small SVG preview for a work. Each form has a distinct silhouette
// so the public journal reads as a timeline of objects, not just dots.
import type { Part, Work } from "./schema";

const FORM_COLOR: Record<string, string> = {
  monolith: "#e8e8e8",
  garden: "#7fb069",
  machine: "#f59e0b",
  text: "#60a5fa",
  light: "#fde68a",
  void: "#6b7280",
};

/** Matches the palette in schema.ts — the only colours a work may use. */
const PART_COLOR: Record<string, string> = {
  ink: "#0b1220",
  slate: "#334155",
  bone: "#d6cbb8",
  rust: "#9a4b2b",
  amber: "#e0a33a",
  jade: "#3f9e7a",
  sky: "#5aa9e6",
  violet: "#8b6bd9",
};

/**
 * XML-escape text before it goes into the SVG.
 *
 * The title is model output. Today the 200-word lexicon makes `<` and `&`
 * impossible, so this is latent rather than live — but the SVG is also written
 * for the `void` path, whose `intent` is a raw error string, and one schema
 * change is all that separates "cannot contain markup" from "does".
 */
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string),
  );
}

function partSize(p: Part): { w: number; h: number; d: number } {
  // The shape the BUILDER makes, not the shape the name suggests: cone and torus
  // have no Roblox primitive without an asset, so builder.lua builds both as a
  // block of [size0, size1, size2]. This used to read a torus's size0 as a radius
  // and double it while ignoring size2, so the preview showed a different object
  // from the one standing in the game.
  switch (p.shape) {
    case "cylinder":
    case "sphere": return { w: p.size[0], h: p.size[0], d: p.size[0] };
    default: return { w: p.size[0], h: p.size[1], d: p.size[2] };
  }
}

/**
 * Side-view silhouette of an assembly, in the same visual language as the
 * form-based previews: every part stands up from its own ground mark.
 */
function renderParts(cx: number, cy: number, parts: Part[]): string {
  const sorted = [...parts].sort((a, b) => partSize(b).h - partSize(a).h);
  return sorted
    .map((p) => {
      const { w, h } = partSize(p);
      const x = cx + p.pos[0];
      const groundY = cy + p.pos[2];
      const color = PART_COLOR[p.color] ?? "#e8e8e8";
      const glow = (p.emissive ?? 0) > 0.5;
      const top = groundY - p.pos[1] - h;
      let shape = "";
      // Only cylinder and sphere are round in the game. cone and torus are
      // blocks there, so they are drawn as blocks here.
      if (p.shape === "cylinder" || p.shape === "sphere") {
        shape = `<circle cx="${x.toFixed(1)}" cy="${(top + h / 2).toFixed(1)}" r="${(w / 2).toFixed(1)}" fill="${color}"/>`;
      } else {
        shape = `<rect x="${(x - w / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>`;
      }
      return (
        `<circle cx="${x.toFixed(1)}" cy="${groundY.toFixed(1)}" r="1.2" fill="${color}" opacity="0.5"/>` +
        shape +
        (glow ? `<circle cx="${x.toFixed(1)}" cy="${top.toFixed(1)}" r="3" fill="#fff" opacity="0.85"/>` : "")
      );
    })
    .join("");
}

export function renderPreview(w: Work): string {
  const cx = 256 + w.site.x;
  const cy = 256 + w.site.z;

  if (w.parts && w.parts.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#111"/>
    ${renderParts(cx, cy, w.parts)}
    <text x="8" y="500" fill="#888" font-size="10">${esc(w.id)} · ${esc(w.title)}</text>
  </svg>`;
  }

  const c = FORM_COLOR[w.form] ?? "#e8e8e8";
  const p = w.params ?? {};

  let body = "";
  switch (w.form) {
    case "monolith": {
      const h = 40 + Math.round((p.height ?? 0.5) * 80);
      const wd = 10 + Math.round((p.width ?? 0.3) * 24);
      body =
        `<rect x="${cx - wd / 2}" y="${cy - h}" width="${wd}" height="${h}" fill="${c}"/>` +
        (p.glow && p.glow > 0.5
          ? `<circle cx="${cx}" cy="${cy - h}" r="6" fill="#fde68a" opacity="0.9"/>`
          : "");
      break;
    }
    case "garden": {
      const r = 20 + Math.round((p.radius ?? 0.5) * 40);
      const n = Math.max(3, Math.round((p.density ?? 0.5) * 14));
      let dots = "";
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * Math.sqrt(i / n || 0.1);
        dots += `<circle cx="${cx + Math.cos(a) * rr}" cy="${cy + Math.sin(a) * rr}" r="2" fill="${c}"/>`;
      }
      body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="1" opacity="0.4"/>` + dots;
      break;
    }
    case "machine": {
      const parts = Math.max(2, Math.round((p.parts ?? 0.5) * 8));
      let gears = "";
      for (let i = 0; i < parts; i++) {
        const a = (i / parts) * Math.PI * 2;
        const r = 26;
        gears += `<rect x="${cx + Math.cos(a) * r - 3}" y="${cy + Math.sin(a) * r - 3}" width="6" height="6" fill="${c}" transform="rotate(${(a * 180) / Math.PI + 45}, ${cx + Math.cos(a) * r}, ${cy + Math.sin(a) * r})"/>`;
      }
      body = `<circle cx="${cx}" cy="${cy}" r="8" fill="${c}"/>` + gears;
      break;
    }
    case "text": {
      const sz = 10 + Math.round((p.size ?? 0.5) * 14);
      body = `<text x="${cx}" y="${cy}" font-size="${sz}" fill="${c}" text-anchor="middle" font-family="monospace">${esc(w.title.slice(0, 6))}</text>`;
      break;
    }
    case "light": {
      const h = 30 + Math.round((p.height ?? 0.5) * 60);
      const intensity = Math.round((p.intensity ?? 0.5) * 100);
      body =
        `<rect x="${cx - 2}" y="${cy - h}" width="4" height="${h}" fill="${c}"/>` +
        `<circle cx="${cx}" cy="${cy - h}" r="8" fill="${c}" opacity="${0.3 + intensity / 200}"/>` +
        `<circle cx="${cx}" cy="${cy - h}" r="3" fill="${c}"/>`;
      break;
    }
    case "void":
    default: {
      body = `<circle cx="${cx}" cy="${cy}" r="4" fill="${c}" opacity="0.6"/>`;
      break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#111"/>
    ${body}
    <text x="8" y="500" fill="#888" font-size="10">${esc(w.id)} · ${esc(w.title)}</text>
  </svg>`;
}
