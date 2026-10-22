// Renders a small SVG preview for a work. Each form has a distinct silhouette
// so the public journal reads as a timeline of objects, not just dots.
import type { Work } from "./schema";

const FORM_COLOR: Record<string, string> = {
  monolith: "#e8e8e8",
  garden: "#7fb069",
  machine: "#f59e0b",
  text: "#60a5fa",
  light: "#fde68a",
  void: "#6b7280",
};

export function renderPreview(w: Work): string {
  const cx = 256 + w.site.x;
  const cy = 256 + w.site.z;
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
      body = `<text x="${cx}" y="${cy}" font-size="${sz}" fill="${c}" text-anchor="middle" font-family="monospace">${w.title.slice(0, 6)}</text>`;
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
    <text x="8" y="500" fill="#888" font-size="10">${w.id} · ${w.title}</text>
  </svg>`;
}
