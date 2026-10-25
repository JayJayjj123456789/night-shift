/**
 * Wipe the plot.
 *
 * Clears the DataStore of every work and resets ns:state to genesis, so the next
 * night starts from an empty plot. The works are ARCHIVED first, not deleted:
 * there is no delete in the DataStore API, so a wiped key is tombstoned and the
 * full list of what was on the plot is written to ns:archive:{label} before that
 * happens. The site's git history keeps the rendered previews; this keeps the
 * data itself retrievable.
 *
 * The attention data goes too: a fresh plot has never been seen, and leaving
 * yesterday's numbers on it would tell the next night's model that someone was
 * standing in a place that no longer exists.
 */

import { getEntry, putEntry } from "./datastore.js";
import type { State } from "./schema";

const WIPE_MARK = { wiped: true };

/** Today in Bangkok, as YYYYMMDD. The night the plot restarts on. */
export function bangkokToday(): number {
  const iso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return Number(iso.replace(/-/g, ""));
}

export async function wipePlot(label: string): Promise<{ archived: number; night: number }> {
  const state = await getEntry<State>("ns:state");
  const ids = (state?.works || []).map((w) => w.id);
  console.log(`plot holds ${ids.length} work(s); archiving to ns:archive:${label}`);

  const archive: unknown[] = [];
  for (const id of ids) {
    const w = await getEntry<unknown>(`ns:work:${id}`);
    if (w && !(w as { wiped?: boolean }).wiped) archive.push(w);
    await putEntry(`ns:work:${id}`, { ...WIPE_MARK, at: new Date().toISOString() });
  }
  await putEntry(`ns:archive:${label}`, {
    at: new Date().toISOString(),
    count: archive.length,
    works: archive,
  });

  await putEntry("ns:state", {
    night: 0,
    journalHead: "genesis",
    works: [],
    plot: { size: 512 },
  });

  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    await putEntry(`ns:telemetry:${d}`, {});
  }
  await putEntry("ns:telemetry:status", { wiped: true, at: new Date().toISOString() });

  const night = bangkokToday();
  console.log(
    `wiped ${ids.length} work(s); state reset to genesis; telemetry cleared. ` +
    `The plot restarts on night ${night}.`,
  );
  return { archived: ids.length, night };
}
