import type { Work } from "./schema";

export function renderPreview(w: Work): string {
  const cx = 256 + w.site.x;
  const cy = 256 + w.site.z;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#111"/>
    <circle cx="${cx}" cy="${cy}" r="12" fill="#e8e8e8"/>
    <text x="8" y="500" fill="#888" font-size="10">${w.id} · ${w.title}</text>
  </svg>`;
}
