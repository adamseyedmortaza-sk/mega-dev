import type { Night } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// ok and fail count jobs by last status; retry is the total of retry lines.
export function nightCounts(night: Night): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of night.rows) {
    counts.retry += row.retries;
    if (row.lastStatus === 'ok') counts.ok += 1;
    if (row.lastStatus === 'fail') counts.fail += 1;
  }
  return counts;
}
